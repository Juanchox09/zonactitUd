import { textoOferta, type Comercio } from '../services/comercios';
import { IconoTienda } from './Iconos';

interface Props {
  comercios: Comercio[];
  seleccion: number | null;
  onElegir: (id: number | null) => void;
  /** Resalta el selector cuando se intentó validar sin elegir tienda. */
  falta: boolean;
}

/** Tienda desde la que se valida. Su descuento principal es el que se registra a los estudiantes activos. */
export function SelectorTienda({ comercios, seleccion, onElegir, falta }: Props) {
  const tienda = comercios.find((c) => c.id === seleccion) ?? null;
  const oferta = tienda?.descuentos[0];
  const categorias = [...new Set(comercios.map((c) => c.categoria))].sort((a, b) => a.localeCompare(b, 'es'));

  return (
    <div className={`selector-tienda${tienda ? ' elegida' : ''}${falta && !tienda ? ' falta' : ''}`}>
      <span className="selector-icono" aria-hidden="true">
        <IconoTienda width={20} height={20} />
      </span>
      <div className="selector-cuerpo">
        <label htmlFor="tienda" className="selector-etiqueta">
          {tienda ? 'Tienda' : 'Elige tu tienda para registrar el descuento'}
        </label>
        <select
          id="tienda"
          className="selector-campo"
          value={seleccion ?? ''}
          onChange={(e) => onElegir(e.target.value ? Number(e.target.value) : null)}
          aria-describedby={oferta ? 'tienda-oferta' : undefined}
        >
          <option value="" disabled>
            Seleccionar tienda…
          </option>
          {categorias.map((categoria) => (
            <optgroup key={categoria} label={categoria}>
              {comercios
                .filter((c) => c.categoria === categoria)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {oferta && (
          <span id="tienda-oferta" className="selector-oferta">
            {oferta.descripcion}
          </span>
        )}
      </div>
      {oferta && (
        <span className="selector-porcentaje" aria-label={`Descuento ${textoOferta(oferta)}`}>
          {textoOferta(oferta)}
        </span>
      )}
    </div>
  );
}
