import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { CREDENCIALES_MOCK, crearMockUtp } from '../mock-utp/servidor.ts';
import { construirApp } from '../src/app.ts';
import { abrirBaseDatos } from '../src/db.ts';
import { ClienteUtp, OrigenUtp, type OpcionesClienteUtp } from '../src/origen-utp.ts';
import { prepararTitular, RepositorioTitulares } from '../src/repositorio.ts';

const demo: unknown[] = JSON.parse(readFileSync(new URL('../data/titulares-demo.json', import.meta.url), 'utf8'));
const silencioso = { warn() {}, error() {} };

const mock = crearMockUtp({ retardoLentoMs: 600 });
let urlBase = '';
before(async () => {
  await new Promise<void>((listo) => mock.listen(0, '127.0.0.1', listo));
  urlBase = `http://127.0.0.1:${(mock.address() as AddressInfo).port}/api/v1`;
});
after(() => mock.close());

/** Cuenta las llamadas reales que llegan al mock. */
function fetchContado() {
  const llamadas: string[] = [];
  const f: typeof fetch = (entrada, init) => {
    llamadas.push(`${init?.method ?? 'GET'} ${String(entrada).replace(urlBase, '')}`);
    return fetch(entrada, init);
  };
  return { llamadas, fetch: f };
}

async function crear(opciones: Partial<OpcionesClienteUtp> = {}) {
  const db = abrirBaseDatos(':memory:');
  const repositorio = new RepositorioTitulares(db);
  repositorio.guardarVarios(demo.map(prepararTitular));
  const cliente = new ClienteUtp({
    urlBase,
    ...CREDENCIALES_MOCK,
    timeoutMs: 300,
    limitePorMinuto: 55,
    cacheSegundos: 0,
    log: silencioso,
    ...opciones,
  });
  const app = await construirApp({
    origen: new OrigenUtp(cliente, repositorio, () => '2026-11-19'),
    repositorio,
    origenesCors: [],
    limitePorMinuto: 1000,
  });
  const validar = (query: string) => app.inject({ method: 'GET', url: `/api/carnets/validar?${query}` });
  return { app, db, validar };
}

describe('origen UTP', () => {
  let ctx: Awaited<ReturnType<typeof crear>>;
  before(async () => (ctx = await crear()));
  after(async () => {
    await ctx.app.close();
    ctx.db.close();
  });

  it('estudiante activo por cédula (con ceros a la izquierda)', async () => {
    const r = await ctx.validar('cedula=08-0123-00456');
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), {
      nombre: 'ANA MARÍA PÉREZ GÓMEZ',
      cedula: '8-123-456',
      tipo: 'Estudiante',
      unidad: 'Facultad de Ingeniería de Sistemas Computacionales',
      programa: 'Licenciatura en Ingeniería de Software',
      sede: 'Campus Víctor Levi Sasso',
      estado: 'ACTIVO',
      periodo: { anio: 2026, semestre: 2 },
      fuente: 'utp',
    });
  });

  it('estudiante no matriculado → 200 INACTIVO, no error', async () => {
    const r = await ctx.validar('cedula=8-234-567');
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().estado, 'INACTIVO');
    assert.equal(r.json().motivo, 'No matriculado en el periodo vigente');
  });

  it('valida el QR del carné con el endpoint validar-carne', async () => {
    const r = await ctx.validar(`qr=${encodeURIComponent('RS04LTEyMzQ1QHV0cC5hYy5wYQ==')}`);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().nombre, 'LUCÍA FERNANDA TORRES');
  });

  it('QR inválido → 400', async () => {
    const r = await ctx.validar('qr=zzz');
    assert.equal(r.statusCode, 400);
    assert.match(r.json().error, /QR/);
  });

  it('no encontrado → 404', async () => {
    const r = await ctx.validar('cedula=8-999-999');
    assert.equal(r.statusCode, 404);
  });

  it('origen no disponible (503) → 503 "no se pudo verificar", nunca INACTIVO', async () => {
    const r = await ctx.validar('cedula=8-500-500');
    assert.equal(r.statusCode, 503);
    assert.equal(r.headers['retry-after'], '30');
    assert.match(r.json().error, /no está disponible/);
    const fila = ctx.db.prepare('SELECT * FROM validaciones ORDER BY id DESC LIMIT 1').get() as Record<string, unknown>;
    assert.equal(fila.resultado, 'NO_VERIFICADO');
    assert.equal(fila.fuente, 'utp');
  });

  it('timeout → 503', async () => {
    const r = await ctx.validar('cedula=8-600-600');
    assert.equal(r.statusCode, 503);
    assert.match(r.json().error, /no respondió a tiempo/);
  });

  it('colaboradores y egresados siguen saliendo de la base local', async () => {
    const r = await ctx.validar('cedula=PE-12-345');
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().tipo, 'Colaborador');
    assert.equal(r.json().fuente, 'local');
  });

  it('código de carnet de un estudiante local → estado confirmado en la API UTP', async () => {
    // 2023-00451 pertenece a la cédula 8-123-456 en la base local.
    const r = await ctx.validar('carnet=2023-00451');
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().fuente, 'utp');
    assert.equal(r.json().carnet, '2023-00451');
    assert.equal(r.json().nombre, 'ANA MARÍA PÉREZ GÓMEZ');
  });
});

describe('cliente UTP', () => {
  it('reutiliza el token entre consultas', async () => {
    const { llamadas, fetch } = fetchContado();
    const { app, db, validar } = await crear({ fetch });
    await validar('cedula=8-123-456');
    await validar('cedula=8-234-567');
    assert.deepEqual(llamadas, [
      'POST /auth/token',
      'GET /estudiantes/8-123-456/estado',
      'GET /estudiantes/8-234-567/estado',
    ]);
    await app.close();
    db.close();
  });

  it('pide un token nuevo si la API responde 401 y reintenta una vez', async () => {
    const llamadas: string[] = [];
    let primerToken = true;
    const f: typeof fetch = async (entrada, init) => {
      const ruta = String(entrada).replace(urlBase, '');
      llamadas.push(ruta);
      if (ruta === '/auth/token' && primerToken) {
        primerToken = false;
        return Response.json({ access_token: 'token-vencido', token_type: 'Bearer', expires_in: 3600 });
      }
      return fetch(entrada, init);
    };
    const { app, db, validar } = await crear({ fetch: f });
    const r = await validar('cedula=8-123-456');
    assert.equal(r.statusCode, 200);
    assert.deepEqual(llamadas, ['/auth/token', '/estudiantes/8-123-456/estado', '/auth/token', '/estudiantes/8-123-456/estado']);
    await app.close();
    db.close();
  });

  it('credenciales incorrectas → 503 sin exponer detalles', async () => {
    const { app, db, validar } = await crear({ clientSecret: 'otro' });
    const r = await validar('cedula=8-123-456');
    assert.equal(r.statusCode, 503);
    assert.match(r.json().error, /administrador/);
    await app.close();
    db.close();
  });

  it('API caída (sin conexión) → 503', async () => {
    const { app, db, validar } = await crear({ urlBase: 'http://127.0.0.1:1/api/v1' });
    const r = await validar('cedula=8-123-456');
    assert.equal(r.statusCode, 503);
    assert.match(r.json().error, /No se pudo conectar/);
    await app.close();
    db.close();
  });

  it('la caché evita repetir la misma consulta', async () => {
    const { llamadas, fetch } = fetchContado();
    const { app, db, validar } = await crear({ fetch, cacheSegundos: 30 });
    await validar('cedula=8-123-456');
    await validar('cedula=8-123-456');
    assert.equal(llamadas.filter((l) => l.startsWith('GET')).length, 1);
    await app.close();
    db.close();
  });

  it('respeta un límite propio por debajo del de la API', async () => {
    const { app, db, validar } = await crear({ limitePorMinuto: 2 });
    await validar('cedula=8-123-456');
    await validar('cedula=8-234-567');
    const r = await validar('cedula=E-8-12345');
    assert.equal(r.statusCode, 503);
    assert.ok(Number(r.headers['retry-after']) > 0);
    await app.close();
    db.close();
  });
});
