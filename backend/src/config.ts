import type { Fuente } from './tipos.ts';

export interface ConfiguracionUtp {
  urlBase: string;
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
  limitePorMinuto: number;
  cacheSegundos: number;
}

export interface Configuracion {
  puerto: number;
  host: string;
  rutaBaseDatos: string;
  origenesCors: string[];
  limitePorMinuto: number;
  zonaHoraria: string;
  /** local = solo SQLite · utp = estudiantes desde la API UTP, colaboradores y egresados desde SQLite. */
  origen: Fuente;
  utp: ConfiguracionUtp;
}

function entero(valor: string | undefined, porDefecto: number, minimo = 1): number {
  if (valor === undefined || valor.trim() === '') return porDefecto;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= minimo ? numero : porDefecto;
}

export function leerConfiguracion(env: NodeJS.ProcessEnv = process.env): Configuracion {
  const origen = (env.ORIGEN?.trim().toLowerCase() || 'local') as Fuente;
  if (origen !== 'local' && origen !== 'utp') {
    throw new Error(`ORIGEN debe ser "local" o "utp" (recibido: "${env.ORIGEN}").`);
  }

  const utp: ConfiguracionUtp = {
    urlBase: env.UTP_API_URL?.trim() || 'http://localhost:8090/api/v1',
    clientId: env.UTP_CLIENT_ID?.trim() ?? '',
    clientSecret: env.UTP_CLIENT_SECRET?.trim() ?? '',
    timeoutMs: entero(env.UTP_TIMEOUT_MS, 5000),
    // La API permite 60/min por cliente; se deja margen.
    limitePorMinuto: entero(env.UTP_LIMITE_POR_MINUTO, 55),
    cacheSegundos: entero(env.UTP_CACHE_SEGUNDOS, 30, 0),
  };
  if (origen === 'utp' && (!utp.clientId || !utp.clientSecret)) {
    throw new Error('Con ORIGEN=utp hay que definir UTP_CLIENT_ID y UTP_CLIENT_SECRET.');
  }

  return {
    puerto: entero(env.PORT, 4000),
    host: env.HOST?.trim() || '0.0.0.0',
    rutaBaseDatos: env.DB_PATH?.trim() || 'data/carnets.db',
    origenesCors: (env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    limitePorMinuto: entero(env.RATE_LIMIT_MAX, 30),
    zonaHoraria: env.ZONA_HORARIA?.trim() || 'America/Panama',
    origen,
    utp,
  };
}
