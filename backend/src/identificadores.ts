/**
 * Normalización y validación de cédula panameña, código de carnet y token QR del carné UTP.
 * Mantener alineado con frontend/src/utils/cedula.ts y frontend/src/utils/qr.ts.
 *
 *   8-123-456   provincia-tomo-asiento
 *   PE-12-345   panameño nacido en el extranjero
 *   E-8-12345   extranjero
 *   N-12-345    naturalizado
 *   8AV-12-345  registrado antes de la vigencia
 *   8PI-12-345  población indígena
 */
const PATRON_CEDULA = /^(?:(PE|E|N)|(\d{1,2})(AV|PI)?)-(\d{1,4})-(\d{1,6})$/;

/** Código alfanumérico de 4 a 40 caracteres con al menos un dígito (p. ej. 2023-00451, C-000873). */
const PATRON_CARNET = /^(?=.*\d)[A-Z0-9][A-Z0-9-]{3,39}$/;

/** Base64 estándar con relleno. */
const PATRON_BASE64 = /^[A-Za-z0-9+/]{4,508}={0,2}$/;

/** Unifica separadores, pasa a mayúsculas y quita ceros a la izquierda (08-0123-00456 → 8-123-456). */
export function normalizarCedula(entrada: string): string {
  return entrada
    .trim()
    .toUpperCase()
    .replace(/\s*[-‐‑–—]\s*|\s+/g, '-')
    .replace(/-+/g, '-')
    .split('-')
    .map((parte) => (/^\d+$/.test(parte) ? parte.replace(/^0+(?=\d)/, '') : parte))
    .join('-');
}

/** Devuelve la cédula normalizada, o null si el formato no es válido. */
export function cedulaValida(entrada: string): string | null {
  const cedula = normalizarCedula(entrada);
  const partes = PATRON_CEDULA.exec(cedula);
  if (!partes) return null;
  if (partes[2] !== undefined) {
    const provincia = Number(partes[2]);
    if (provincia < 1 || provincia > 13) return null;
  }
  return cedula;
}

/** Devuelve el código de carnet normalizado, o null si el formato no es válido. */
export function carnetValido(entrada: string): string | null {
  const codigo = entrada.trim().toUpperCase();
  return PATRON_CARNET.test(codigo) ? codigo : null;
}

/**
 * Decodifica el token QR del carné UTP: Base64 de "<cedula>@<sufijo>".
 * Devuelve la cédula normalizada, o null si el token no tiene ese formato.
 */
export function cedulaDeTokenQr(token: string): string | null {
  const limpio = token.trim();
  if (!PATRON_BASE64.test(limpio) || limpio.length % 4 !== 0) return null;
  const texto = Buffer.from(limpio, 'base64').toString('utf8');
  const arroba = texto.indexOf('@');
  if (arroba <= 0) return null;
  return cedulaValida(texto.slice(0, arroba));
}
