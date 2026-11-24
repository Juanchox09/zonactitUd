export type EstadoCarnet = 'ACTIVO' | 'INACTIVO';

export type TipoTitular = 'Estudiante' | 'Colaborador' | 'Egresado';

export interface Periodo {
  anio: number;
  /** 1, 2 o 3 (3 = verano). */
  semestre: number;
}

export interface DescuentoAplicado {
  canjeId: number;
  comercio: string;
  descripcion: string;
  tipo: 'porcentaje' | '2x1' | 'otro';
  porcentaje: number;
  /** true si ya se había registrado hace pocos minutos (no se duplica). */
  yaRegistrado: boolean;
}

export interface Titular {
  nombre: string;
  cedula: string;
  /** Código del carnet. No viene cuando el estado sale de la API de la UTP. */
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
  /** Razón del estado inactivo, si aplica. */
  motivo?: string;
  /** De dónde salió el estado: base local del backend o API de la UTP. */
  fuente?: 'local' | 'utp';
  /** Descuento de la tienda que validó. Solo si el estudiante está activo; ya quedó registrado. */
  descuento?: DescuentoAplicado;
}

export interface Criterio {
  /** qr = contenido del QR del carné UTP (Base64 de "<cedula>@<sufijo>"), sin modificar. */
  tipo: 'cedula' | 'carnet' | 'qr';
  valor: string;
}

export interface ResultadoValidacion {
  criterio: Criterio;
  /** null cuando no existe un carnet asociado al criterio. */
  titular: Titular | null;
  consultadoEn: Date;
}
