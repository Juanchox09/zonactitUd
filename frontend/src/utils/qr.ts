import type { Criterio } from '../types';
import { validarCedula } from './cedula';

/** Código alfanumérico de 4 a 40 caracteres con al menos un dígito (p. ej. 2023-00451, C-000873). */
const CODIGO_CARNET = /^(?=.*\d)[A-Z0-9][A-Z0-9-]{3,39}$/;
const CAMPOS_CARNET = ['carnet', 'codigo', 'id'];

const BASE64 = /^[A-Za-z0-9+/]{4,508}={0,2}$/;

/**
 * Carné UTP: el QR contiene Base64 de "<cedula>@<sufijo>" (p. ej. "8-123-456@utp.ac.pa").
 * Devuelve la cédula normalizada, o null si el texto no tiene ese formato.
 */
export function cedulaDeTokenQr(token: string): string | null {
  const limpio = token.trim();
  if (!BASE64.test(limpio) || limpio.length % 4 !== 0) return null;
  let texto: string;
  try {
    const bytes = Uint8Array.from(atob(limpio), (c) => c.charCodeAt(0));
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const arroba = texto.indexOf('@');
  if (arroba <= 0) return null;
  const resultado = validarCedula(texto.slice(0, arroba));
  return resultado.valida ? resultado.cedula : null;
}

/**
 * Extrae el criterio de búsqueda del contenido de un código QR. Acepta:
 *   - Carné UTP: Base64 de "<cedula>@<sufijo>" → se envía tal cual al backend (tipo "qr")
 *   - JSON:  {"cedula": "8-123-456"} o {"carnet": "2023-00451"}
 *   - URL:   https://.../validar?cedula=8-123-456  o  https://.../carnet/2023-00451
 *   - Texto: una cédula o un código de carnet
 */
export function interpretarQr(texto: string): Criterio | null {
  const contenido = texto.trim();
  if (!contenido) return null;

  // Va primero y sin pasar a mayúsculas: Base64 distingue mayúsculas y minúsculas.
  if (cedulaDeTokenQr(contenido)) return { tipo: 'qr', valor: contenido };

  if (contenido.startsWith('{')) {
    try {
      const datos: Record<string, unknown> = JSON.parse(contenido);
      return desdeCampos((campo) => datos?.[campo]);
    } catch {
      return null;
    }
  }

  if (/^https?:\/\//i.test(contenido)) {
    try {
      const url = new URL(contenido);
      const desdeQuery = desdeCampos((campo) => url.searchParams.get(campo));
      if (desdeQuery) return desdeQuery;
      const ultimoSegmento = url.pathname.split('/').filter(Boolean).pop();
      return ultimoSegmento ? desdeTexto(decodeURIComponent(ultimoSegmento)) : null;
    } catch {
      return null;
    }
  }

  return desdeTexto(contenido);
}

function desdeCampos(leer: (campo: string) => unknown): Criterio | null {
  const cedula = leer('cedula');
  if (typeof cedula === 'string') {
    const resultado = validarCedula(cedula);
    if (resultado.valida) return { tipo: 'cedula', valor: resultado.cedula };
  }
  for (const campo of CAMPOS_CARNET) {
    const valor = leer(campo);
    if (typeof valor === 'string' || typeof valor === 'number') {
      const criterio = desdeCarnet(String(valor));
      if (criterio) return criterio;
    }
  }
  return null;
}

function desdeTexto(texto: string): Criterio | null {
  const resultado = validarCedula(texto);
  if (resultado.valida) return { tipo: 'cedula', valor: resultado.cedula };
  return desdeCarnet(texto);
}

function desdeCarnet(texto: string): Criterio | null {
  const codigo = texto.trim().toUpperCase();
  return CODIGO_CARNET.test(codigo) ? { tipo: 'carnet', valor: codigo } : null;
}
