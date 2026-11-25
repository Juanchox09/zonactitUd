/**
 * Sesión del panel: administración de ActitUd (rol admin) o personal de una tienda (rol comercio).
 *   POST {VITE_API_URL}/auth/login { usuario, contrasena } → { token, expiraEn, usuario }
 * El token se guarda en sessionStorage: se pierde al cerrar la pestaña.
 */

export interface UsuarioSesion {
  usuario: string;
  nombre: string;
  rol: 'admin' | 'comercio';
  /** Solo rol comercio: su tienda. */
  comercioId?: number | null;
  comercio?: string | null;
  /** Solo rol comercio: cajero = solo valida carnets; administrador = gestiona ofertas, métricas y cajeros. */
  permiso?: Permiso | null;
}

export type Permiso = 'cajero' | 'administrador';

export const TEXTO_PERMISO: Record<Permiso, string> = { cajero: 'Cajero', administrador: 'Administrador de tienda' };

/** "Administración ActitUd", "Administrador de tienda" o "Cajero". */
export function textoRol(usuario: Pick<UsuarioSesion, 'rol' | 'permiso'>): string {
  return usuario.rol === 'admin' ? 'Administración ActitUd' : TEXTO_PERMISO[usuario.permiso ?? 'cajero'];
}

/** El usuario es de caja: solo valida carnets, no entra al panel. */
export const esCajero = (sesion: Sesion | null) => sesion?.usuario.rol === 'comercio' && sesion.usuario.permiso !== 'administrador';

export interface Sesion {
  token: string;
  /** Segundos Unix. */
  expiraEn: number;
  usuario: UsuarioSesion;
}

/** El servidor rechazó la sesión (vencida o inválida): hay que volver a iniciarla. */
export class ErrorSesion extends Error {}

const apiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');
const CLAVE = 'actitud.sesion';

export function sesionGuardada(): Sesion | null {
  try {
    const sesion = JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null') as Sesion | null;
    if (sesion && sesion.expiraEn * 1000 > Date.now()) return sesion;
  } catch {
    /* almacenamiento bloqueado o dato dañado */
  }
  cerrarSesion();
  return null;
}

export function cerrarSesion() {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
  }
}

export async function iniciarSesion(usuario: string, contrasena: string): Promise<Sesion> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ usuario, contrasena }),
    });
  } catch {
    throw new Error('No hay conexión con el servidor.');
  }
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(typeof cuerpo?.error === 'string' ? cuerpo.error : `El servidor respondió con un error (${respuesta.status}).`);
  }
  const sesion = (await respuesta.json()) as Sesion;
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
  } catch {
    /* sin almacenamiento: la sesión dura mientras la página siga abierta */
  }
  return sesion;
}
