/**
 * Panel del comercio (ofertas, descuentos y métricas de una tienda), administración de comercios
 * y reporte de validación. Todas las rutas exigen el token Bearer de la sesión.
 */
import type { Reporte } from './reportes';
import { ErrorSesion } from './sesion';

const apiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');

export type TipoOferta = 'porcentaje' | '2x1' | 'otro';

export interface DatosOferta {
  tipo: TipoOferta;
  porcentaje: number;
  descripcion: string;
  activo: boolean;
  principal: boolean;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  /** 0 = lunes … 6 = domingo. */
  diasSemana: string;
  condiciones: string | null;
}

export interface OfertaPanel extends DatosOferta {
  id: number;
  aplicaHoy: boolean;
}

export interface UsuarioComercio {
  id: number;
  usuario: string;
  nombre: string;
  activo: boolean;
}

export interface ComercioPanel {
  id: number;
  nombre: string;
  categoria: string;
  activo: boolean;
  descuentos: OfertaPanel[];
  /** La oferta que se aplica hoy al validar en esta tienda. */
  descuentoHoy: number | null;
  usuarios: UsuarioComercio[];
}

export interface ResumenValidacion {
  total: number;
  exitosas: number;
  tasaExito: number | null;
  activos: number;
  tasaActivos: number | null;
  noVerificadas: number;
}

export interface Tiempos {
  medidas: number;
  promedio: number | null;
  mediana: number | null;
  p90: number | null;
  p95: number | null;
  minimo: number | null;
  maximo: number | null;
  dentroMeta: number | null;
}

export interface GrupoValidacion {
  nombre: string;
  total: number;
  exitosas: number;
  tasaExito: number | null;
  activos: number;
  medianaMs: number | null;
  p95Ms: number | null;
}

export interface ReporteValidacion {
  periodo: { desde: string; hasta: string; dias: number };
  metaMs: number;
  resumen: ResumenValidacion;
  resultados: { resultado: 'ACTIVO' | 'INACTIVO' | 'NO_ENCONTRADO' | 'NO_VERIFICADO'; validaciones: number; participacion: number | null }[];
  tiempos: Tiempos;
  tiemposExitosas: Tiempos;
  tramos: { tramo: string; validaciones: number }[];
  porDia: { fecha: string; total: number; exitosas: number; activos: number; medianaMs: number | null }[];
  porCriterio: GrupoValidacion[];
  porComercio: GrupoValidacion[];
}

export type MetricasComercio = Omit<Reporte, 'tiendas' | 'categorias' | 'alertas'> & {
  ofertas: { descripcion: string; canjes: number }[];
  validacion: ResumenValidacion;
};

async function pedir<T>(ruta: string, token: string, opciones: { metodo?: string; cuerpo?: unknown; senal?: AbortSignal } = {}): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${apiUrl}${ruta}`, {
      method: opciones.metodo ?? 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opciones.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
      signal: opciones.senal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('No hay conexión con el servidor.');
  }
  if (respuesta.status === 401) throw new ErrorSesion('Tu sesión venció. Vuelve a iniciar sesión.');
  if (respuesta.status === 204) return undefined as T;
  const cuerpo = (await respuesta.json().catch(() => null)) as unknown;
  if (!respuesta.ok) {
    const mensaje = (cuerpo as { error?: unknown } | null)?.error;
    throw new Error(typeof mensaje === 'string' ? mensaje : `El servidor respondió con un error (${respuesta.status}).`);
  }
  return cuerpo as T;
}

export const panel = {
  comercio: (id: number, token: string, senal?: AbortSignal) => pedir<ComercioPanel>(`/panel/comercios/${id}`, token, { senal }),
  crearOferta: (id: number, datos: DatosOferta, token: string) =>
    pedir<ComercioPanel>(`/panel/comercios/${id}/descuentos`, token, { metodo: 'POST', cuerpo: datos }),
  editarOferta: (id: number, oferta: number, datos: DatosOferta, token: string) =>
    pedir<ComercioPanel>(`/panel/comercios/${id}/descuentos/${oferta}`, token, { metodo: 'PUT', cuerpo: datos }),
  eliminarOferta: (id: number, oferta: number, token: string) =>
    pedir<void>(`/panel/comercios/${id}/descuentos/${oferta}`, token, { metodo: 'DELETE' }),
  metricas: (id: number, dias: number, token: string, senal?: AbortSignal) =>
    pedir<MetricasComercio>(`/panel/comercios/${id}/metricas?dias=${dias}`, token, { senal }),

  // Solo administradores
  comercios: (token: string, senal?: AbortSignal) => pedir<ComercioPanel[]>('/admin/comercios', token, { senal }),
  crearComercio: (datos: { nombre: string; categoria: string; activo: boolean }, token: string) =>
    pedir<ComercioPanel>('/admin/comercios', token, { metodo: 'POST', cuerpo: datos }),
  editarComercio: (id: number, datos: { nombre: string; categoria: string; activo: boolean }, token: string) =>
    pedir<ComercioPanel>(`/admin/comercios/${id}`, token, { metodo: 'PUT', cuerpo: datos }),
  crearUsuario: (id: number, datos: { usuario: string; nombre: string; contrasena: string }, token: string) =>
    pedir<ComercioPanel>(`/admin/comercios/${id}/usuarios`, token, { metodo: 'POST', cuerpo: datos }),
  cambiarUsuario: (usuario: number, cambio: { activo?: boolean; contrasena?: string }, token: string) =>
    pedir<ComercioPanel>(`/admin/usuarios/${usuario}`, token, { metodo: 'PATCH', cuerpo: cambio }),
  reporteValidacion: (dias: number, token: string, senal?: AbortSignal) =>
    pedir<ReporteValidacion>(`/reportes/validacion?dias=${dias}`, token, { senal }),
};

export const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** "0123456" → "Todos los días"; "01234" → "Lunes a viernes"; "024" → "lunes, miércoles, viernes". */
export function textoDias(dias: string): string {
  if (dias === '0123456') return 'Todos los días';
  const n = dias.split('').map(Number);
  const seguidos = n.every((d, i) => i === 0 || d === n[i - 1]! + 1);
  if (seguidos && n.length >= 3) {
    const t = `${DIAS_LARGOS[n[0]!]} a ${DIAS_LARGOS[n[n.length - 1]!]}`;
    return t[0]!.toUpperCase() + t.slice(1);
  }
  const t = n.map((d) => DIAS_LARGOS[d]).join(', ');
  return t[0]!.toUpperCase() + t.slice(1);
}

export const ms = (valor: number | null) =>
  valor === null ? '—' : valor < 1000 ? `${valor.toLocaleString('es-PA')} ms` : `${(valor / 1000).toLocaleString('es-PA', { maximumFractionDigits: 2 })} s`;
