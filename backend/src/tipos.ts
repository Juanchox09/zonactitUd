/** Mismo contrato que frontend/src/types.ts. */
export type EstadoCarnet = 'ACTIVO' | 'INACTIVO';

export type TipoTitular = 'Estudiante' | 'Colaborador' | 'Egresado';

export type Fuente = 'local' | 'utp';

export interface Periodo {
  anio: number;
  /** 1, 2 o 3 (3 = verano). */
  semestre: number;
}

export interface Titular {
  nombre: string;
  cedula: string;
  /** Código del carnet. La API UTP no lo devuelve. */
  carnet?: string;
  tipo: TipoTitular;
  /** Facultad, centro regional o dirección a la que pertenece. */
  unidad: string;
  programa?: string;
  sede?: string;
  estado: EstadoCarnet;
  /** Fecha ISO (AAAA-MM-DD) hasta la que el carnet es válido (registros locales). */
  vigenteHasta?: string;
  /** Periodo académico consultado (API UTP). */
  periodo?: Periodo;
  motivo?: string;
  fuente: Fuente;
}

export interface Criterio {
  /** qr = contenido del QR del carné UTP (Base64 de "<cedula>@<sufijo>"), sin modificar. */
  tipo: 'cedula' | 'carnet' | 'qr';
  valor: string;
}

/** Resultado registrado en la bitácora. */
export type ResultadoBitacora = EstadoCarnet | 'NO_ENCONTRADO' | 'NO_VERIFICADO';

export const TIPOS_TITULAR: readonly TipoTitular[] = ['Estudiante', 'Colaborador', 'Egresado'];
export const ESTADOS_CARNET: readonly EstadoCarnet[] = ['ACTIVO', 'INACTIVO'];
