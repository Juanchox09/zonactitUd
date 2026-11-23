/**
 * Gráficos del panel de reportes, en SVG/HTML sin librerías.
 * Reglas: una sola tonalidad por gráfico, marcas finas, rejilla tenue, detalle al pasar el mouse
 * (o al tocar en el celular) y una vista de tabla para cada gráfico.
 */
import { useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react';

// ---------------------------------------------------------------- utilidades

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observador = new ResizeObserver(([e]) => setAncho(Math.floor(e!.contentRect.width)));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  return [ref, ancho] as const;
}

interface EstadoTooltip {
  x: number;
  y: number;
  contenido: ReactNode;
}

function Tooltip({ estado }: { estado: EstadoTooltip | null }) {
  if (!estado) return null;
  return (
    <div className="grafico-tooltip" style={{ left: estado.x, top: estado.y }} role="status">
      {estado.contenido}
    </div>
  );
}

/** Escala "bonita" para el eje Y: 0, paso, 2·paso… hasta cubrir el máximo. */
function marcasEje(maximo: number, cantidad = 4): number[] {
  if (maximo <= 0) return [0, 1];
  const bruto = maximo / cantidad;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto;
  const marcas = [];
  for (let v = 0; v <= maximo + paso * 0.001; v += paso) marcas.push(Math.round(v * 100) / 100);
  if (marcas[marcas.length - 1]! < maximo) marcas.push(marcas[marcas.length - 1]! + paso);
  return marcas;
}

// ---------------------------------------------------------------- tarjeta con vista de tabla

interface PropsTarjeta {
  titulo: string;
  subtitulo?: string;
  tabla: { columnas: string[]; filas: (string | number)[][] };
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function TarjetaGrafico({ titulo, subtitulo, tabla, acciones, children, className = '' }: PropsTarjeta) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <section className={`tarjeta tarjeta-grafico ${className}`}>
      <header className="grafico-cabecera">
        <div>
          <h2>{titulo}</h2>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        <div className="grafico-acciones">
          {acciones}
          <button type="button" className="boton-texto" aria-pressed={verTabla} onClick={() => setVerTabla((v) => !v)}>
            {verTabla ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        </div>
      </header>
      {verTabla ? (
        <div className="tabla-contenedor">
          <table className="tabla-datos">
            <thead>
              <tr>
                {tabla.columnas.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla.filas.map((fila, i) => (
                <tr key={i}>
                  {fila.map((celda, j) => (
                    <td key={j}>{celda}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

// ---------------------------------------------------------------- línea (tendencia diaria)

interface PropsLinea {
  datos: { etiqueta: string; etiquetaLarga: string; valor: number }[];
  unidad: string;
}

export function GraficoLinea({ datos, unidad }: PropsLinea) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const alto = 220;
  const m = { izq: 36, der: 12, sup: 12, inf: 26 };
  const marcas = marcasEje(Math.max(...datos.map((d) => d.valor), 0));
  const maxY = marcas[marcas.length - 1]!;
  const anchoUtil = Math.max(ancho - m.izq - m.der, 1);
  const x = (i: number) => m.izq + (datos.length > 1 ? (i / (datos.length - 1)) * anchoUtil : anchoUtil / 2);
  const y = (v: number) => m.sup + (1 - v / maxY) * (alto - m.sup - m.inf);
  const trazo = datos.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.valor).toFixed(1)}`).join('');
  const area = `${trazo}L${x(datos.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const cadaEtiqueta = Math.max(1, Math.ceil(datos.length / Math.max(2, Math.floor(anchoUtil / 70))));

  function mover(clientX: number) {
    const caja = ref.current!.getBoundingClientRect();
    const i = Math.round(((clientX - caja.left - m.izq) / anchoUtil) * (datos.length - 1));
    setActivo(Math.min(Math.max(i, 0), datos.length - 1));
  }

  const punto = activo !== null ? datos[activo] : null;
  return (
    <div ref={ref} className="grafico" onMouseLeave={() => setActivo(null)}>
      {ancho > 0 && (
        <svg
          width={ancho}
          height={alto}
          role="img"
          aria-label={`Tendencia de ${unidad} por día`}
          onMouseMove={(e) => mover(e.clientX)}
          onTouchStart={(e) => mover(e.touches[0]!.clientX)}
          onTouchMove={(e) => mover(e.touches[0]!.clientX)}
        >
          {marcas.map((v) => (
            <g key={v}>
              <line className="rejilla" x1={m.izq} x2={ancho - m.der} y1={y(v)} y2={y(v)} />
              <text className="eje" x={m.izq - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
                {v}
              </text>
            </g>
          ))}
          {datos.map((d, i) =>
            i % cadaEtiqueta === 0 ? (
              <text key={d.etiquetaLarga} className="eje" x={x(i)} y={alto - 6} textAnchor="middle">
                {d.etiqueta}
              </text>
            ) : null,
          )}
          <path className="linea-area" d={area} />
          <path className="linea-trazo" d={trazo} />
          {punto && activo !== null && (
            <g>
              <line className="cruz" x1={x(activo)} x2={x(activo)} y1={m.sup} y2={y(0)} />
              <circle className="linea-punto" cx={x(activo)} cy={y(punto.valor)} r={5} />
            </g>
          )}
        </svg>
      )}
      <Tooltip
        estado={
          punto && activo !== null
            ? {
                x: Math.min(Math.max(x(activo), 70), ancho - 70),
                y: y(punto.valor) - 12,
                contenido: (
                  <>
                    <span className="tooltip-titulo">{punto.etiquetaLarga}</span>
                    <b>{punto.valor}</b> {unidad}
                  </>
                ),
              }
            : null
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------- mapa de calor (día × hora)

const PASOS = 6;

interface PropsMapa {
  dias: string[];
  matriz: number[][];
}

export function MapaCalor({ dias, matriz }: PropsMapa) {
  const [tooltip, setTooltip] = useState<EstadoTooltip | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const horasConDatos = matriz[0]!.map((_, h) => h).filter((h) => matriz.some((fila) => fila[h]! > 0));
  const desde = Math.min(...horasConDatos, 10);
  const hasta = Math.max(...horasConDatos, 21);
  const horas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  const maximo = Math.max(...matriz.flat(), 1);
  const paso = (v: number) => (v === 0 ? 0 : Math.min(PASOS, Math.ceil((v / maximo) * PASOS)));

  function mostrar(e: MouseEvent | FocusEvent, dia: string, hora: number, valor: number) {
    const celda = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const caja = contenedor.current!.getBoundingClientRect();
    setTooltip({
      x: celda.left - caja.left + celda.width / 2 + contenedor.current!.scrollLeft,
      y: celda.top - caja.top - 6,
      contenido: (
        <>
          <span className="tooltip-titulo">
            {dia}, {hora}:00 – {hora + 1}:00
          </span>
          <b>{valor}</b> canjes
        </>
      ),
    });
  }

  return (
    <div className="mapa-calor-envoltura">
      <div className="mapa-calor-desplazable" ref={contenedor} onMouseLeave={() => setTooltip(null)}>
        <div className="mapa-calor" style={{ gridTemplateColumns: `3.2rem repeat(${horas.length}, minmax(26px, 1fr))` }}>
          <span />
          {horas.map((h) => (
            <span key={h} className="mapa-hora">
              {h % 2 === 0 ? h : ''}
            </span>
          ))}
          {dias.map((dia, d) => (
            <div key={dia} className="mapa-fila" style={{ display: 'contents' }}>
              <span className="mapa-dia">{dia.slice(0, 3)}</span>
              {horas.map((h) => {
                const valor = matriz[d]![h]!;
                return (
                  <span
                    key={h}
                    className={`mapa-celda paso-${paso(valor)}`}
                    tabIndex={0}
                    aria-label={`${dia} ${h}:00, ${valor} canjes`}
                    onMouseEnter={(e) => mostrar(e, dia, h, valor)}
                    onFocus={(e) => mostrar(e, dia, h, valor)}
                    onBlur={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <Tooltip estado={tooltip} />
      </div>
      <div className="mapa-leyenda" aria-hidden="true">
        <span>Menos</span>
        {Array.from({ length: PASOS }, (_, i) => (
          <span key={i} className={`mapa-celda paso-${i + 1}`} />
        ))}
        <span>Más</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- barras horizontales (ranking)

interface ItemBarra {
  nombre: string;
  detalle?: string;
  valor: number;
  textoValor: string;
  tooltip: ReactNode;
}

export function BarrasHorizontales({ items, tono = 'rosa' }: { items: ItemBarra[]; tono?: 'rosa' | 'utp' }) {
  const [tooltip, setTooltip] = useState<EstadoTooltip | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const maximo = Math.max(...items.map((i) => i.valor), 1);

  function mostrar(e: MouseEvent | FocusEvent, item: ItemBarra) {
    const fila = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const caja = contenedor.current!.getBoundingClientRect();
    setTooltip({ x: Math.min(fila.width * 0.6, caja.width - 90), y: fila.top - caja.top - 4, contenido: item.tooltip });
  }

  return (
    <div className={`barras tono-${tono}`} ref={contenedor} onMouseLeave={() => setTooltip(null)}>
      {items.map((item) => (
        <div
          key={item.nombre}
          className="barra-fila"
          tabIndex={0}
          onMouseEnter={(e) => mostrar(e, item)}
          onFocus={(e) => mostrar(e, item)}
          onBlur={() => setTooltip(null)}
        >
          <div className="barra-etiqueta">
            <span className="barra-nombre">{item.nombre}</span>
            {item.detalle && <span className="barra-detalle">{item.detalle}</span>}
          </div>
          <div className="barra-pista">
            <span className="barra-relleno" style={{ width: `${(item.valor / maximo) * 100}%` }} />
          </div>
          <span className="barra-valor">{item.textoValor}</span>
        </div>
      ))}
      <Tooltip estado={tooltip} />
    </div>
  );
}
