import { describe, expect, it } from 'vitest';
import { cedulaDeTokenQr, interpretarQr } from './qr';

describe('interpretarQr', () => {
  it('lee una cédula en texto plano', () => {
    expect(interpretarQr('8-123-456')).toEqual({ tipo: 'cedula', valor: '8-123-456' });
  });

  it('lee un código de carnet en texto plano', () => {
    expect(interpretarQr('2023-00451')).toEqual({ tipo: 'carnet', valor: '2023-00451' });
  });

  it('lee JSON con cédula o carnet', () => {
    expect(interpretarQr('{"cedula":"pe-12-345"}')).toEqual({ tipo: 'cedula', valor: 'PE-12-345' });
    expect(interpretarQr('{"carnet":"eg-2019-0332"}')).toEqual({ tipo: 'carnet', valor: 'EG-2019-0332' });
  });

  it('lee URLs con parámetro o con el código al final de la ruta', () => {
    expect(interpretarQr('https://ejemplo.pa/validar?cedula=8-123-456')).toEqual({
      tipo: 'cedula',
      valor: '8-123-456',
    });
    expect(interpretarQr('https://ejemplo.pa/carnet/C-000873')).toEqual({ tipo: 'carnet', valor: 'C-000873' });
  });

  it('reconoce el QR del carné UTP y lo conserva sin modificar', () => {
    expect(interpretarQr('OC0xMjMtNDU2QHV0cC5hYy5wYQ==')).toEqual({
      tipo: 'qr',
      valor: 'OC0xMjMtNDU2QHV0cC5hYy5wYQ==',
    });
    expect(cedulaDeTokenQr('RS04LTEyMzQ1QHV0cC5hYy5wYQ==')).toBe('E-8-12345');
  });

  it('no confunde Base64 sin "@cedula" con un carné UTP', () => {
    expect(cedulaDeTokenQr('aG9sYSBtdW5kbw==')).toBeNull(); // "hola mundo"
    expect(interpretarQr('2023-00451')).toEqual({ tipo: 'carnet', valor: '2023-00451' });
  });

  it('devuelve null para contenido irreconocible', () => {
    expect(interpretarQr('')).toBeNull();
    expect(interpretarQr('{json roto')).toBeNull();
    expect(interpretarQr('hola mundo')).toBeNull();
  });
});
