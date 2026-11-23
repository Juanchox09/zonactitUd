import type { TitularLocal } from './repositorio.ts';

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria indicada. */
export function fechaHoy(zonaHoraria: string, ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/**
 * El backend decide el estado que ve el usuario. Un carnet local marcado ACTIVO cuya
 * vigencia ya pasó se informa como INACTIVO, aunque nadie haya actualizado el registro.
 * Las fechas ISO se comparan como texto (AAAA-MM-DD ordena cronológicamente).
 */
export function aplicarVigencia(titular: TitularLocal, hoy: string): TitularLocal {
  if (titular.estado === 'ACTIVO' && titular.vigenteHasta < hoy) {
    return { ...titular, estado: 'INACTIVO', motivo: 'Carnet vencido' };
  }
  return titular;
}
