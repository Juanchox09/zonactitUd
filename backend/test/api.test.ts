import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { construirApp } from '../src/app.ts';
import { abrirBaseDatos } from '../src/db.ts';
import { cedulaDeTokenQr, cedulaValida } from '../src/identificadores.ts';
import { OrigenLocal } from '../src/origen.ts';
import { prepararTitular, RepositorioTitulares } from '../src/repositorio.ts';

const demo: unknown[] = JSON.parse(readFileSync(new URL('../data/titulares-demo.json', import.meta.url), 'utf8'));
const qr = (texto: string) => Buffer.from(texto).toString('base64');

async function crear(opciones: { hoy?: string; limite?: number } = {}) {
  const db = abrirBaseDatos(':memory:');
  const repositorio = new RepositorioTitulares(db);
  repositorio.guardarVarios(demo.map(prepararTitular));
  const app = await construirApp({
    origen: new OrigenLocal(repositorio, () => opciones.hoy ?? '2026-11-19'),
    repositorio,
    origenesCors: ['http://localhost:5173'],
    limitePorMinuto: opciones.limite ?? 1000,
  });
  return { app, db };
}

describe('GET /api/carnets/validar (origen local)', () => {
  let ctx: Awaited<ReturnType<typeof crear>>;
  before(async () => (ctx = await crear()));
  after(async () => {
    await ctx.app.close();
    ctx.db.close();
  });

  const validar = (query: string) => ctx.app.inject({ method: 'GET', url: `/api/carnets/validar?${query}` });

  it('encuentra un carnet activo por cédula, normalizando la entrada', async () => {
    const r = await validar('cedula=08%200123%20456');
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.deepEqual(r.json(), {
      nombre: 'María Fernanda Ríos Batista',
      cedula: '8-123-456',
      carnet: '2023-00451',
      tipo: 'Estudiante',
      unidad: 'Facultad de Ingeniería de Sistemas Computacionales',
      programa: 'Licenciatura en Ingeniería de Software',
      estado: 'ACTIVO',
      vigenteHasta: '2027-03-31',
      fuente: 'local',
    });
  });

  it('encuentra un carnet inactivo por código, sin distinguir mayúsculas', async () => {
    const r = await validar('carnet=eg-2019-0332');
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().estado, 'INACTIVO');
    assert.equal(r.json().motivo, 'Carnet vencido');
  });

  it('acepta el QR del carné UTP (Base64 de "<cedula>@<sufijo>")', async () => {
    const r = await validar(`qr=${encodeURIComponent(qr('PE-12-345@utp.ac.pa'))}`);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().carnet, 'C-000873');
  });

  it('responde 400 con un QR que no se puede decodificar', async () => {
    const r = await validar('qr=zzz');
    assert.equal(r.statusCode, 400);
    assert.match(r.json().error, /QR/);
  });

  it('omite programa cuando no aplica', async () => {
    const r = await validar('carnet=C-000873');
    assert.equal(r.statusCode, 200);
    assert.equal('programa' in r.json(), false);
  });

  it('responde 404 si no existe carnet asociado', async () => {
    const r = await validar('cedula=9-999-9999');
    assert.equal(r.statusCode, 404);
    assert.ok(r.json().error);
  });

  it('responde 400 ante formato inválido o parámetros incorrectos', async () => {
    for (const query of ['cedula=abc', 'carnet=x', '', 'cedula=8-123-456&carnet=2023-00451', 'qr=']) {
      const r = await validar(query);
      assert.equal(r.statusCode, 400, `query: "${query}"`);
      assert.ok(r.json().error);
    }
  });

  it('registra cada consulta en la bitácora sin guardar el valor consultado', async () => {
    await validar('carnet=2023-00451');
    const fila = ctx.db.prepare('SELECT * FROM validaciones ORDER BY id DESC LIMIT 1').get() as Record<string, unknown>;
    assert.equal(fila.criterio, 'carnet');
    assert.equal(fila.fuente, 'local');
    assert.equal(fila.resultado, 'ACTIVO');
    await validar('cedula=9-999-9999');
    const noEncontrado = ctx.db.prepare('SELECT * FROM validaciones ORDER BY id DESC LIMIT 1').get() as Record<string, unknown>;
    assert.equal(noEncontrado.resultado, 'NO_ENCONTRADO');
    assert.equal(noEncontrado.titular_id, null);
  });

  it('permite el origen del frontend por CORS', async () => {
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/carnets/validar?carnet=2023-00451',
      headers: { origin: 'http://localhost:5173' },
    });
    assert.equal(r.headers['access-control-allow-origin'], 'http://localhost:5173');
  });

  it('informa el origen en /salud', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: '/api/salud' });
    assert.deepEqual(r.json(), { estado: 'ok', origen: 'local', titularesLocales: 4 });
  });
});

describe('vigencia', () => {
  it('informa INACTIVO un carnet marcado ACTIVO cuya fecha ya pasó', async () => {
    const { app, db } = await crear({ hoy: '2027-01-01' });
    const r = await app.inject({ method: 'GET', url: '/api/carnets/validar?carnet=C-000873' });
    assert.equal(r.json().estado, 'INACTIVO');
    assert.equal(r.json().motivo, 'Carnet vencido');
    await app.close();
    db.close();
  });
});

describe('límite de consultas', () => {
  it('responde 429 al superar el máximo por minuto', async () => {
    const { app, db } = await crear({ limite: 2 });
    const pedir = () => app.inject({ method: 'GET', url: '/api/carnets/validar?carnet=2023-00451' });
    await pedir();
    await pedir();
    const r = await pedir();
    assert.equal(r.statusCode, 429);
    assert.match(r.json().error, /Demasiadas consultas/);
    await app.close();
    db.close();
  });
});

describe('identificadores', () => {
  it('quita ceros a la izquierda como la API UTP', () => {
    assert.equal(cedulaValida('08-0123-00456'), '8-123-456');
    assert.equal(cedulaValida('E-08-012345'), 'E-8-12345');
    assert.equal(cedulaValida('0-1-1'), null);
  });

  it('decodifica el token QR del carné', () => {
    assert.equal(cedulaDeTokenQr('OC0xMjMtNDU2QHV0cC5hYy5wYQ=='), '8-123-456');
    assert.equal(cedulaDeTokenQr('RS04LTEyMzQ1QHV0cC5hYy5wYQ=='), 'E-8-12345');
    assert.equal(cedulaDeTokenQr('zzz'), null);
    assert.equal(cedulaDeTokenQr(qr('sin-arroba')), null);
  });
});

describe('prepararTitular', () => {
  it('rechaza registros con datos inválidos', () => {
    assert.throws(() => prepararTitular({ ...(demo[0] as object), tipo: 'Docente' }, 0), /tipo debe ser/);
    assert.throws(() => prepararTitular({ ...(demo[0] as object), cedula: '99-1-1' }, 0), /cédula/);
    assert.throws(() => prepararTitular({ ...(demo[0] as object), vigenteHasta: '31/03/2027' }, 0), /vigenteHasta/);
  });
});

describe('migración de la bitácora', () => {
  it('convierte la tabla validaciones de la versión anterior conservando los registros', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'carnets-'));
    const ruta = join(carpeta, 'v0.db');
    const v0 = new DatabaseSync(ruta);
    v0.exec(`
      CREATE TABLE validaciones (id INTEGER PRIMARY KEY, criterio TEXT NOT NULL CHECK (criterio IN ('cedula', 'carnet')),
        titular_id INTEGER, estado TEXT, consultado_en TEXT NOT NULL DEFAULT '2026-11-01T00:00:00Z');
      CREATE INDEX idx_validaciones_fecha ON validaciones (consultado_en);
      INSERT INTO validaciones (criterio, titular_id, estado) VALUES ('cedula', NULL, 'ACTIVO'), ('carnet', NULL, NULL);
    `);
    v0.close();

    const db = abrirBaseDatos(ruta);
    const filas = db.prepare('SELECT criterio, fuente, resultado FROM validaciones ORDER BY id').all();
    assert.deepEqual(
      filas.map((f) => ({ ...f })),
      [
        { criterio: 'cedula', fuente: 'local', resultado: 'ACTIVO' },
        { criterio: 'carnet', fuente: 'local', resultado: 'NO_ENCONTRADO' },
      ],
    );
    db.prepare("INSERT INTO validaciones (criterio, fuente, resultado) VALUES ('qr', 'utp', 'NO_VERIFICADO')").run();
    db.close();
    rmSync(carpeta, { recursive: true, force: true });
  });
});
