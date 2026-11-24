/** Tiendas afiliadas. Contrato: GET {VITE_API_URL}/comercios */

export interface Oferta {
  id: number;
  tipo: 'porcentaje' | '2x1' | 'otro';
  porcentaje: number;
  descripcion: string;
}

export interface Comercio {
  id: number;
  nombre: string;
  categoria: string;
  /** La primera es la principal: la que se aplica al validar. */
  descuentos: Oferta[];
}

const apiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');

export const tiendasDisponibles = Boolean(apiUrl);

export async function listarComercios(senal?: AbortSignal): Promise<Comercio[]> {
  const respuesta = await fetch(`${apiUrl}/comercios`, { headers: { Accept: 'application/json' }, signal: senal });
  if (!respuesta.ok) throw new Error(`El servidor respondió con un error (${respuesta.status}).`);
  const comercios = (await respuesta.json()) as Comercio[];
  return comercios.filter((c) => c.descuentos.length > 0);
}

export const textoOferta = (o: Oferta) => (o.tipo === '2x1' ? '2x1' : `${o.porcentaje} %`);

/* La tienda elegida se recuerda en este equipo (hasta que exista el login de cajero). */
const CLAVE_TIENDA = 'actitud.tienda';

export function tiendaGuardada(): number | null {
  try {
    const valor = Number(localStorage.getItem(CLAVE_TIENDA));
    return Number.isInteger(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
}

export function guardarTienda(id: number | null) {
  try {
    if (id) localStorage.setItem(CLAVE_TIENDA, String(id));
    else localStorage.removeItem(CLAVE_TIENDA);
  } catch {
    /* sin almacenamiento: se pedirá la tienda de nuevo al recargar */
  }
}
