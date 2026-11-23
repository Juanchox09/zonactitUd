/**
 * Cédula panameña: provincia (1-13) o prefijo especial, tomo y asiento.
 *   8-123-456   provincia-tomo-asiento
 *   PE-12-345   panameño nacido en el extranjero
 *   E-8-12345   extranjero
 *   N-12-345    naturalizado
 *   8AV-12-345  registrado antes de la vigencia
 *   8PI-12-345  población indígena
 */
const PATRON = /^(?:(PE|E|N)|(\d{1,2})(AV|PI)?)-(\d{1,4})-(\d{1,6})$/;

export type ResultadoCedula = { valida: true; cedula: string } | { valida: false; error: string };

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

export function validarCedula(entrada: string): ResultadoCedula {
  const cedula = normalizarCedula(entrada);
  if (!cedula) return { valida: false, error: 'Ingresa un número de cédula.' };

  const partes = PATRON.exec(cedula);
  if (!partes) {
    return {
      valida: false,
      error: 'Formato no válido. Ejemplos: 8-123-456, PE-12-345, E-8-12345, 8AV-12-345.',
    };
  }

  const provincia = partes[2];
  if (provincia !== undefined) {
    const numero = Number(provincia);
    if (numero < 1 || numero > 13) {
      return { valida: false, error: 'La provincia debe estar entre 1 y 13.' };
    }
  }

  return { valida: true, cedula };
}
