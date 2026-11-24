/**
 * Sesión del administrador (panel de reportes).
 *   POST {VITE_API_URL}/auth/login { usuario, contrasena } → { token, expiraEn, usuario }
 * El token se guarda en sessionStorage: se pierde al cerrar la pestaña.
 */

export interface UsuarioSesion {
  usuario: string;
  nombre: string;
  rol: 'admin';
}

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
