import { useEffect, useState } from 'react';
import { panel, type MetricasComercio as Metricas } from '../../services/panel';
import { fmt } from '../../services/reportes';
import { ErrorSesion } from '../../services/sesion';
import { BarrasHorizontales, GraficoLinea, MapaCalor, TarjetaGrafico } from '../reportes/Graficos';
import { ErrorPanel, EsqueletoPanel, Indicador, SelectorPeriodo } from '../reportes/PanelReportes';

interface Props {
  comercioId: number;
  token: string;
  onSesionVencida: (aviso: string) => void;
}

const corto = (facultad: string) => facultad.replace(/^Facultad de /, '').replace(/^Ingeniería (de )?/, 'Ing. ');

/** Métricas básicas de uso de una tienda (objetivo 5): sin datos de otras tiendas ni de estudiantes. */
export function MetricasComercio({ comercioId, token, onSesionVencida }: Props) {
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState<Metricas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    setError(null);
    panel
      .metricas(comercioId, dias, token, control.signal)
      .then(setDatos)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (e instanceof ErrorSesion) return onSesionVencida(e.message);
        setError(e instanceof Error ? e.message : 'No se pudieron cargar las métricas.');
      });
    return () => control.abort();
  }, [comercioId, dias, token, intento, onSesionVencida]);

  return (
    <>
      <div className="filtros">
        <SelectorPeriodo dias={dias} onCambiar={setDias} />
        {datos && (
          <span className="filtros-periodo">
            {fmt.fecha(datos.periodo.desde)} – {fmt.fecha(datos.periodo.hasta)}
          </span>
        )}
      </div>
      {error && <ErrorPanel mensaje={error} onReintentar={() => setIntento((n) => n + 1)} />}
      {!datos && !error && <EsqueletoPanel />}
      {datos && <Contenido datos={datos} />}
    </>
  );
}

function Contenido({ datos }: { datos: Metricas }) {
  const r = datos.resumen;
  const v = datos.validacion;
  const facultades = datos.facultades.filter((f) => !f.agrupado);

  return (
    <>
      <section className="indicadores" aria-label="Indicadores de la tienda">
        <Indicador titulo="Descuentos aplicados" valor={fmt.numero(r.canjes)} cambio={r.variacionCanjes} nota={`vs. ${datos.periodo.dias} días anteriores`} destacado />
        <Indicador titulo="Estudiantes únicos" valor={fmt.numero(r.estudiantesUnicos)} nota={`${r.canjesPorEstudiante ?? '—'} canjes por estudiante`} />
        <Indicador titulo="Validaciones" valor={fmt.numero(v.total)} nota={`${fmt.numero(v.activos)} estudiantes activos`} />
        <Indicador titulo="Rechazados" valor={fmt.numero(v.exitosas - v.activos)} nota="inactivos o no registrados: sin descuento" />
        <Indicador titulo="Recurrencia" valor={fmt.pct(r.recurrencia)} nota="volvieron a usar el descuento" />
        <Indicador titulo="Ahorro entregado" valor={fmt.dinero(r.ahorroTotal)} nota={`en ${fmt.numero(r.canjesConMonto)} compras con monto`} />
        <Indicador titulo="Descuento promedio" valor={fmt.pct(r.descuentoPromedio)} nota="2x1 cuenta como 50 %" />
        <Indicador titulo="Ticket promedio" valor={r.ticketPromedio === null ? '—' : fmt.dinero(r.ticketPromedio)} nota="monto de compra" />
      </section>

      <div className="rejilla-graficos">
        <TarjetaGrafico
          className="ancho-completo"
          titulo="Descuentos por día"
          subtitulo={`${fmt.numero(r.canjes)} en ${datos.periodo.dias} días`}
          tabla={{ columnas: ['Fecha', 'Canjes'], filas: datos.porDia.map((d) => [fmt.fecha(d.fecha, true), d.canjes]) }}
        >
          <GraficoLinea unidad="canjes" datos={datos.porDia.map((d) => ({ etiqueta: fmt.fecha(d.fecha), etiquetaLarga: fmt.fecha(d.fecha, true), valor: d.canjes }))} />
        </TarjetaGrafico>

        <TarjetaGrafico
          className="ancho-completo"
          titulo="¿A qué hora vienen los estudiantes?"
          subtitulo={
            datos.horario.pico
              ? `Hora pico: ${datos.horario.pico.dia.toLowerCase()} de ${datos.horario.pico.hora}:00 a ${datos.horario.pico.hora + 1}:00`
              : 'Sin canjes en el periodo'
          }
          tabla={{
            columnas: ['Día', ...Array.from({ length: 12 }, (_, i) => `${i + 10}:00`)],
            filas: datos.horario.dias.map((d, i) => [d, ...datos.horario.matriz[i]!.slice(10, 22)]),
          }}
        >
          <MapaCalor dias={datos.horario.dias} matriz={datos.horario.matriz} />
        </TarjetaGrafico>

        <TarjetaGrafico
          titulo="Tus ofertas más usadas"
          subtitulo="Canjes por oferta"
          tabla={{ columnas: ['Oferta', 'Canjes'], filas: datos.ofertas.map((o) => [o.descripcion, o.canjes]) }}
        >
          {datos.ofertas.length === 0 ? (
            <p className="grafico-nota">Sin canjes en el periodo.</p>
          ) : (
            <BarrasHorizontales
              items={datos.ofertas.map((o) => ({
                nombre: o.descripcion,
                valor: o.canjes,
                textoValor: fmt.numero(o.canjes),
                tooltip: (
                  <>
                    <span className="tooltip-titulo">{o.descripcion}</span>
                    <b>{fmt.numero(o.canjes)}</b> canjes
                  </>
                ),
              }))}
            />
          )}
        </TarjetaGrafico>

        <TarjetaGrafico
          titulo="Estudiantes por facultad"
          subtitulo={`Solo grupos de ${datos.minimoGrupo} estudiantes o más`}
          tabla={{ columnas: ['Facultad', 'Estudiantes', 'Canjes'], filas: datos.facultades.map((f) => [f.nombre, f.estudiantes, f.canjes]) }}
        >
          {facultades.length === 0 ? (
            <p className="grafico-nota">Aún no hay grupos suficientemente grandes para mostrarlos sin identificar a nadie.</p>
          ) : (
            <BarrasHorizontales
              tono="utp"
              items={facultades.map((f) => ({
                nombre: corto(f.nombre),
                valor: f.estudiantes,
                textoValor: fmt.numero(f.estudiantes),
                tooltip: (
                  <>
                    <span className="tooltip-titulo">{f.nombre}</span>
                    <b>{fmt.numero(f.estudiantes)}</b> estudiantes · {fmt.numero(f.canjes)} canjes
                  </>
                ),
              }))}
            />
          )}
        </TarjetaGrafico>
      </div>
    </>
  );
}
