import type { ResultadoValidacion } from '../types';
import { formatearHora } from '../utils/formato';
import { iniciales } from '../utils/retroalimentacion';
import { IconoReloj } from './Iconos';
import { describirCriterio } from './Resultado';

interface Props {
  items: ResultadoValidacion[];
  onSeleccionar: (resultado: ResultadoValidacion) => void;
}

const ETIQUETAS = { ACTIVO: 'Activo', INACTIVO: 'Inactivo', NO_REGISTRADO: 'No encontrado' } as const;

export function Historial({ items, onSeleccionar }: Props) {
  const activos = items.filter((i) => i.titular?.estado === 'ACTIVO').length;

  return (
    <section className="historial" aria-labelledby="titulo-historial">
      <div className="historial-cabecera">
        <h2 id="titulo-historial">Validaciones de esta sesión</h2>
        {items.length > 0 && (
          <div className="contadores">
            <span className="contador">
              <b>{items.length}</b> total
            </span>
            <span className="contador contador-activo">
              <b>{activos}</b> activos
            </span>
            <span className="contador contador-inactivo">
              <b>{items.length - activos}</b> sin descuento
            </span>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="historial-vacio">
          <IconoReloj width={18} height={18} />
          Aún no hay validaciones. Se borran al cerrar la página.
        </p>
      ) : (
        <ul className="historial-lista">
          {items.map((item) => {
            const estado = item.titular?.estado ?? 'NO_REGISTRADO';
            const clase = estado.toLowerCase().replace('_', '-');
            return (
              <li key={item.consultadoEn.getTime()}>
                <button type="button" className="historial-item" onClick={() => onSeleccionar(item)}>
                  <span className={`avatar avatar-chico avatar-${clase}`} aria-hidden="true">
                    {item.titular ? iniciales(item.titular.nombre) : '?'}
                  </span>
                  <span className="historial-texto">
                    <strong>{item.titular?.nombre ?? 'No encontrado'}</strong>
                    <small>
                      {describirCriterio(item.criterio)} · {formatearHora(item.consultadoEn)}
                    </small>
                  </span>
                  <span className={`pastilla pastilla-${clase}`}>{ETIQUETAS[estado]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
