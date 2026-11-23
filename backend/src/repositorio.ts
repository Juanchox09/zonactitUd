import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { carnetValido, cedulaValida } from './identificadores.ts';
import {
  ESTADOS_CARNET,
  TIPOS_TITULAR,
  type Criterio,
  type EstadoCarnet,
  type Fuente,
  type ResultadoBitacora,
  type Titular,
} from './tipos.ts';

/** Titular guardado en la base local: siempre tiene código de carnet y fecha de vigencia. */
export type TitularLocal = Titular & { carnet: string; vigenteHasta: string; fuente: 'local' };

interface FilaTitular {
  id: number;
  cedula: string;
  carnet: string;
  nombre: string;
  tipo: Titular['tipo'];
  unidad: string;
  programa: string | null;
  estado: EstadoCarnet;
  vigente_hasta: string;
  motivo: string | null;
}

export interface TitularEncontrado {
  id: number;
  titular: TitularLocal;
}

function aTitular(fila: FilaTitular): TitularLocal {
  return {
    nombre: fila.nombre,
    cedula: fila.cedula,
    carnet: fila.carnet,
    tipo: fila.tipo,
    unidad: fila.unidad,
    ...(fila.programa ? { programa: fila.programa } : {}),
    estado: fila.estado,
    vigenteHasta: fila.vigente_hasta,
    ...(fila.motivo ? { motivo: fila.motivo } : {}),
    fuente: 'local',
  };
}

export class RepositorioTitulares {
  private readonly db: DatabaseSync;
  private readonly porCedula: StatementSync;
  private readonly porCarnet: StatementSync;
  private readonly insertarValidacion: StatementSync;
  private readonly guardar: StatementSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.porCedula = db.prepare('SELECT * FROM titulares WHERE cedula = ?');
    this.porCarnet = db.prepare('SELECT * FROM titulares WHERE carnet = ?');
    this.insertarValidacion = db.prepare(
      'INSERT INTO validaciones (criterio, fuente, resultado, titular_id) VALUES (?, ?, ?, ?)',
    );
    this.guardar = db.prepare(`
      INSERT INTO titulares (cedula, carnet, nombre, tipo, unidad, programa, estado, vigente_hasta, motivo)
      VALUES (:cedula, :carnet, :nombre, :tipo, :unidad, :programa, :estado, :vigenteHasta, :motivo)
      ON CONFLICT (carnet) DO UPDATE SET
        cedula = excluded.cedula, nombre = excluded.nombre, tipo = excluded.tipo,
        unidad = excluded.unidad, programa = excluded.programa, estado = excluded.estado,
        vigente_hasta = excluded.vigente_hasta, motivo = excluded.motivo,
        actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    `);
  }

  /** El valor del criterio debe venir ya normalizado (cédula o código de carnet). */
  buscar(criterio: { tipo: 'cedula' | 'carnet'; valor: string }): TitularEncontrado | null {
    const consulta = criterio.tipo === 'cedula' ? this.porCedula : this.porCarnet;
    const fila = consulta.get(criterio.valor) as FilaTitular | undefined;
    return fila ? { id: fila.id, titular: aTitular(fila) } : null;
  }

  registrarValidacion(
    criterio: Criterio['tipo'],
    fuente: Fuente,
    resultado: ResultadoBitacora,
    titularId: number | null = null,
  ): void {
    this.insertarValidacion.run(criterio, fuente, resultado, titularId);
  }

  contar(): number {
    return (this.db.prepare('SELECT COUNT(*) AS total FROM titulares').get() as { total: number }).total;
  }

  /** Inserta o actualiza (por código de carnet) en una sola transacción. */
  guardarVarios(titulares: TitularLocal[]): void {
    this.db.exec('BEGIN');
    try {
      for (const t of titulares) {
        this.guardar.run({
          cedula: t.cedula,
          carnet: t.carnet,
          nombre: t.nombre,
          tipo: t.tipo,
          unidad: t.unidad,
          programa: t.programa ?? null,
          estado: t.estado,
          vigenteHasta: t.vigenteHasta,
          motivo: t.motivo ?? null,
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** Valida y normaliza un registro externo (JSON de importación). Lanza un Error descriptivo si no es válido. */
export function prepararTitular(dato: unknown, posicion: number): TitularLocal {
  const fallo = (mensaje: string) => new Error(`Registro ${posicion + 1}: ${mensaje}`);
  if (typeof dato !== 'object' || dato === null) throw fallo('no es un objeto');
  const d = dato as Record<string, unknown>;
  const texto = (campo: string, obligatorio = true): string | undefined => {
    const valor = d[campo];
    if (valor === undefined || valor === null || valor === '') {
      if (obligatorio) throw fallo(`falta "${campo}"`);
      return undefined;
    }
    if (typeof valor !== 'string') throw fallo(`"${campo}" debe ser texto`);
    return valor.trim();
  };

  const cedula = cedulaValida(texto('cedula')!);
  if (!cedula) throw fallo(`cédula con formato no válido (${String(d.cedula)})`);
  const carnet = carnetValido(texto('carnet')!);
  if (!carnet) throw fallo(`código de carnet no válido (${String(d.carnet)})`);
  const tipo = texto('tipo') as Titular['tipo'];
  if (!TIPOS_TITULAR.includes(tipo)) throw fallo(`tipo debe ser ${TIPOS_TITULAR.join(' | ')}`);
  const estado = texto('estado') as EstadoCarnet;
  if (!ESTADOS_CARNET.includes(estado)) throw fallo(`estado debe ser ${ESTADOS_CARNET.join(' | ')}`);
  const vigenteHasta = texto('vigenteHasta')!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigenteHasta) || Number.isNaN(Date.parse(vigenteHasta))) {
    throw fallo('vigenteHasta debe ser una fecha AAAA-MM-DD');
  }
  const programa = texto('programa', false);
  const motivo = texto('motivo', false);

  return {
    nombre: texto('nombre')!,
    cedula,
    carnet,
    tipo,
    unidad: texto('unidad')!,
    ...(programa ? { programa } : {}),
    estado,
    vigenteHasta,
    ...(motivo ? { motivo } : {}),
    fuente: 'local',
  };
}
