import type { TiendaValidacion } from '../services/comercios';
import { textoDias } from '../services/panel';
import { IconoAlerta, IconoCheck, IconoTienda } from './Iconos';
import { textoValor } from './panel/OfertasComercio';

interface Props {
  tienda: TiendaValidacion | null;
  /** Quién valida (nombre y permiso), para dejar claro con qué sesión se registran los descuentos. */
  quien: string;
  error: string | null;
  onReintentar: () => void;
}

/**
 * Tienda de la sesión y sus ofertas disponibles hoy. El cajero no elige el descuento: el servidor aplica
 * automáticamente la oferta principal vigente hoy (o, si no aplica, la primera vigente) y la registra.
 */
export function OfertasDeHoy({ tienda, quien, error, onReintentar }: Props) {
  if (error) {
    return (
      <div className="ofertas-hoy ofertas-hoy-error" role="alert">
        <IconoAlerta width={18} height={18} />
        <span>No se pudieron cargar las ofertas de la tienda: {error}</span>
        <button type="button" className="boton-texto" onClick={onReintentar}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!tienda) return <div className="ofertas-hoy ofertas-hoy-cargando" aria-busy="true">Cargando las ofertas de tu tienda…</div>;

  const aplicada = tienda.ofertas.find((o) => o.id === tienda.aplicada) ?? null;
  const otras = tienda.ofertas.filter((o) => o.id !== tienda.aplicada);

  return (
    <section className={`ofertas-hoy${aplicada ? '' : ' sin-oferta'}`} aria-labelledby="ofertas-hoy-titulo">
      <header className="ofertas-hoy-cabecera">
        <span className="selector-icono" aria-hidden="true">
          <IconoTienda width={20} height={20} />
        </span>
        <div>
          <h2 id="ofertas-hoy-titulo">{tienda.nombre}</h2>
          <p>{quien}</p>
        </div>
      </header>

      {aplicada ? (
        <>
          <div className="oferta-aplicada">
            <span className="oferta-aplicada-valor">{textoValor(aplicada)}</span>
            <span className="oferta-aplicada-texto">
              <span className="oferta-aplicada-etiqueta">
                <IconoCheck width={14} height={14} /> Se aplica automáticamente hoy
              </span>
              <b>{aplicada.descripcion}</b>
              <small>
                {textoDias(aplicada.diasSemana)}
                {aplicada.vigenteHasta ? ` · hasta el ${new Date(`${aplicada.vigenteHasta}T12:00`).toLocaleDateString('es-PA', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              </small>
            </span>
          </div>
          {aplicada.condiciones && <p className="oferta-condiciones">{aplicada.condiciones}</p>}
          {otras.length > 0 && (
            <details className="otras-ofertas">
              <summary>
                Otras {otras.length === 1 ? 'oferta disponible' : `${otras.length} ofertas disponibles`} hoy
              </summary>
              <ul>
                {otras.map((o) => (
                  <li key={o.id}>
                    <b>{textoValor(o)}</b> {o.descripcion}
                  </li>
                ))}
              </ul>
              <p>Para aplicar otra, el administrador de la tienda la marca como principal en el panel.</p>
            </details>
          )}
        </>
      ) : (
        <p className="oferta-ninguna">
          <IconoAlerta width={18} height={18} />
          {tienda.activo
            ? 'Tu tienda no tiene ofertas vigentes hoy, así que no se puede validar. El administrador de la tienda debe publicar o activar una en el panel.'
            : 'Tu tienda no está activa en el programa ActitUd. Comunícate con la administración del mall.'}
        </p>
      )}
    </section>
  );
}
