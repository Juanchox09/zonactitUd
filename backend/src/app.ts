import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { carnetValido, cedulaValida } from './identificadores.ts';
import { ErrorNoVerificado, ErrorSolicitud, type OrigenDatos } from './origen.ts';
import type { RepositorioTitulares } from './repositorio.ts';
import type { Criterio } from './tipos.ts';

export interface OpcionesApp {
  origen: OrigenDatos;
  /** Para la bitácora y /salud. */
  repositorio: RepositorioTitulares;
  origenesCors: string[];
  limitePorMinuto: number;
  logger?: FastifyServerOptions['logger'];
}

interface ConsultaValidar {
  cedula?: string;
  carnet?: string;
  qr?: string;
}

const esquemaError = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
} as const;

const esquemaTitular = {
  type: 'object',
  properties: {
    nombre: { type: 'string' },
    cedula: { type: 'string' },
    carnet: { type: 'string' },
    tipo: { type: 'string', enum: ['Estudiante', 'Colaborador', 'Egresado'] },
    unidad: { type: 'string' },
    programa: { type: 'string' },
    sede: { type: 'string' },
    estado: { type: 'string', enum: ['ACTIVO', 'INACTIVO'] },
    vigenteHasta: { type: 'string' },
    periodo: {
      type: 'object',
      properties: { anio: { type: 'integer' }, semestre: { type: 'integer' } },
      required: ['anio', 'semestre'],
    },
    motivo: { type: 'string' },
    fuente: { type: 'string', enum: ['local', 'utp'] },
  },
  required: ['nombre', 'cedula', 'tipo', 'unidad', 'estado', 'fuente'],
} as const;

/** Quita la cadena de consulta de los logs: contiene cédulas y tokens QR. */
export const serializadoresSinDatosPersonales = {
  req(req: { method: string; url: string; ip?: string }) {
    return { method: req.method, url: req.url.split('?')[0], ip: req.ip };
  },
};

export async function construirApp(opciones: OpcionesApp) {
  const { origen, repositorio } = opciones;

  const app = Fastify({
    logger: opciones.logger ?? false,
    // Detrás de un proxy inverso (nginx, túnel, Vite), para que el límite por IP use la IP real.
    trustProxy: true,
  });

  await app.register(cors, { origin: opciones.origenesCors, methods: ['GET'] });
  await app.register(rateLimit, {
    max: opciones.limitePorMinuto,
    timeWindow: '1 minute',
    // Se lanza como error y lo formatea setErrorHandler → { error: mensaje }.
    errorResponseBuilder: (_req, contexto) => ({
      statusCode: 429,
      message: `Demasiadas consultas. Intenta de nuevo en ${Math.ceil(contexto.ttl / 1000)} s.`,
    }),
  });

  // Las respuestas contienen datos personales: que ningún proxy ni navegador las guarde.
  app.addHook('onSend', async (_req, respuesta) => {
    respuesta.header('Cache-Control', 'no-store');
  });

  app.setNotFoundHandler((_req, respuesta) => respuesta.code(404).send({ error: 'Ruta no encontrada.' }));

  app.setErrorHandler<{ statusCode?: number; validation?: unknown; message: string }>((error, req, respuesta) => {
    if (error.validation) return respuesta.code(400).send({ error: 'Parámetros no válidos.' });
    const codigo = error.statusCode ?? 500;
    if (codigo >= 500) {
      req.log.error(error);
      return respuesta.code(500).send({ error: 'Error interno del servidor.' });
    }
    return respuesta.code(codigo).send({ error: error.message });
  });

  await app.register(
    async (api) => {
      api.get('/salud', async () => ({ estado: 'ok', origen: origen.nombre, titularesLocales: repositorio.contar() }));

      api.get<{ Querystring: ConsultaValidar }>(
        '/carnets/validar',
        {
          schema: {
            querystring: {
              type: 'object',
              properties: {
                cedula: { type: 'string', maxLength: 30 },
                carnet: { type: 'string', maxLength: 40 },
                qr: { type: 'string', maxLength: 512 },
              },
            },
            response: { 200: esquemaTitular, 400: esquemaError, 404: esquemaError, 503: esquemaError },
          },
        },
        async (req, respuesta) => {
          const { cedula, carnet, qr } = req.query;
          if ([cedula, carnet, qr].filter((v) => v !== undefined).length !== 1) {
            return respuesta.code(400).send({ error: 'Indica exactamente uno de los parámetros: cedula, carnet o qr.' });
          }

          let criterio: Criterio;
          if (cedula !== undefined) {
            const valor = cedulaValida(cedula);
            if (!valor) return respuesta.code(400).send({ error: 'Formato de cédula no válido.' });
            criterio = { tipo: 'cedula', valor };
          } else if (carnet !== undefined) {
            const valor = carnetValido(carnet);
            if (!valor) return respuesta.code(400).send({ error: 'Formato de código de carnet no válido.' });
            criterio = { tipo: 'carnet', valor };
          } else {
            const valor = qr!.trim();
            if (!valor) return respuesta.code(400).send({ error: 'El código QR está vacío.' });
            criterio = { tipo: 'qr', valor };
          }

          try {
            const resultado = await origen.consultar(criterio);
            if (!resultado.titular) {
              repositorio.registrarValidacion(criterio.tipo, resultado.fuente, 'NO_ENCONTRADO');
              return respuesta.code(404).send({ error: 'No existe un carnet asociado.' });
            }
            repositorio.registrarValidacion(criterio.tipo, resultado.fuente, resultado.titular.estado, resultado.titularId);
            return resultado.titular;
          } catch (error) {
            if (error instanceof ErrorSolicitud) return respuesta.code(400).send({ error: error.message });
            if (error instanceof ErrorNoVerificado) {
              repositorio.registrarValidacion(criterio.tipo, origen.nombre, 'NO_VERIFICADO');
              if (error.reintentarEnSegundos) respuesta.header('Retry-After', String(error.reintentarEnSegundos));
              return respuesta.code(503).send({ error: error.message });
            }
            throw error;
          }
        },
      );
    },
    { prefix: '/api' },
  );

  return app;
}
