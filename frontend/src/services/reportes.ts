/** Reportería del programa ActitUd (propuesta). Contrato: GET {VITE_API_URL}/reportes?dias=30 */

export interface Resumen {
  canjes: number;
  canjesAnterior: number;
  variacionCanjes: number | null;
  estudiantesUnicos: number;
  estudiantesAnterior: number;
  recurrencia: number | null;
  canjesPorEstudiante: number | null;
  descuentoPromedio: number | null;
  ahorroTotal: number;
  ticketPromedio: number | null;
  canjesConMonto: number;
  validaciones: number;
  conversion: number | null;
  tasaRechazo: number | null;
  noVerificadas: number;
}

export interface Grupo {
  nombre: string;
  canjes: number;
  estudiantes: number;
  agrupado?: boolean;
}

export interface Reporte {
  periodo: { desde: string; hasta: string; dias: number };
  resumen: Resumen;
  porDia: { fecha: string; canjes: number }[];
  horario: { dias: string[]; matriz: number[][]; pico: { dia: string; hora: number; canjes: number } | null };
  tiendas: { nombre: string; categoria: string; canjes: number; estudiantes: number; descuentoPromedio: number; ahorro: number }[];
  categorias: { nombre: string; canjes: number }[];
  facultades: (Grupo & { matricula: number | null; porCada100: number | null })[];
  carreras: Grupo[];
  descuentos: { tipo: string; canjes: number; estudiantes: number; participacion: number | null }[];
  alertas: { tipo: 'simultaneo' | 'repetido'; fecha: string; estudiante: string; detalle: string }[];
  minimoGrupo: number;
}

const apiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');

export const reporteriaDisponible = Boolean(apiUrl);

export async function obtenerReporte(dias: number, senal?: AbortSignal): Promise<Reporte> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${apiUrl}/reportes?dias=${dias}`, { headers: { Accept: 'application/json' }, signal: senal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('No hay conexión con el servidor de reportes.');
  }
  if (!respuesta.ok) throw new Error(`El servidor respondió con un error (${respuesta.status}).`);
  return (await respuesta.json()) as Reporte;
}

const numero = new Intl.NumberFormat('es-PA');
const dinero = new Intl.NumberFormat('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaCorta = new Intl.DateTimeFormat('es-PA', { weekday: 'short', day: 'numeric', month: 'short' });
const fechaDia = new Intl.DateTimeFormat('es-PA', { day: 'numeric', month: 'short' });

export const fmt = {
  numero: (n: number) => numero.format(n),
  dinero: (n: number) => `$${dinero.format(n)}`,
  pct: (n: number | null) => (n === null ? '—' : `${n.toLocaleString('es-PA')} %`),
  /** "2026-11-20" sin desfase de zona horaria. */
  fecha: (iso: string, larga = false) => {
    const [a, m, d] = iso.split('-').map(Number);
    return (larga ? fechaCorta : fechaDia).format(new Date(a!, m! - 1, d!));
  },
  hora: (h: number) => `${h}:00`,
};
