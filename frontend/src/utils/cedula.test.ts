import { describe, expect, it } from 'vitest';
import { normalizarCedula, validarCedula } from './cedula';

describe('normalizarCedula', () => {
  it('quita espacios, unifica guiones y pasa a mayúsculas', () => {
    expect(normalizarCedula(' 8 - 123 – 456 ')).toBe('8-123-456');
    expect(normalizarCedula('pe-12-345')).toBe('PE-12-345');
    expect(normalizarCedula('8 123 456')).toBe('8-123-456');
  });

  it('quita ceros a la izquierda como la API de la UTP', () => {
    expect(normalizarCedula('08-0123-00456')).toBe('8-123-456');
    expect(normalizarCedula('e-08-012345')).toBe('E-8-12345');
  });
});

describe('validarCedula', () => {
  it.each(['8-123-456', 'PE-12-345', 'E-8-12345', 'N-12-345', '8AV-12-345', '8PI-12-345', '13-1-1'])(
    'acepta %s',
    (cedula) => {
      expect(validarCedula(cedula)).toEqual({ valida: true, cedula });
    },
  );

  it.each(['', 'abc', '8-123', '14-123-456', '0-1-1', 'X-1-1', '8-12345-1'])('rechaza "%s"', (cedula) => {
    expect(validarCedula(cedula).valida).toBe(false);
  });
});
