import { useEffect, useState } from 'react';
import { ms, panel, type ReporteValidacion as Reporte } from '../../services/panel';
import { fmt } from '../../services/reportes';
import { ErrorSesion } from '../../services/sesion';
import { BarrasHorizontales, GraficoLinea, TarjetaGrafico } from '../reportes/Graficos';
import { descargarCsv, ErrorPanel, EsqueletoPanel, Indicador, SelectorPeriodo } from '../reportes/PanelReportes';

interface Props {
  token: string;
  onSesionVencida: (aviso: string) => void;
}

const NOMBRE_RESULTADO = {
  ACTIVO: 'Activo (descuento aprobado)',
  INACTIVO: 'Inactivo (no matriculado)',
  NO_ENCONTRADO: 'No registrado en la UTP',
  NO_VERIFICADO: 'Sin respuesta de la UTP',
} as const;

/**
 * Reporte de validación (objetivo 6 del anteproyecto): tasa de validaciones exitosas y tiempos de respuesta.
 * Es la evidencia para el capítulo V (evaluación del prototipo).
 */
export function ReporteValidacion({ token, onSesionVencida }: Props) {
  const [dias, setDias] = useState(30);
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    setError(null);
    panel
      .reporteValidacion(dias, token, control.signal)
      .then(setReporte)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (e instanceof ErrorSesion) return onSesionVencida(e.message);
        setError(e instanceof Error ? e.message : 'No se pudo cargar el reporte de validación.');
      });
    return () => control.abort();
  }, [dias, token, intento, onSesionVencida]);

  function exportar(r: Reporte) {
    const t = r.tiempos;
    descargarCsv(
      `actitud-validacion-${r.periodo.desde}_${r.periodo.hasta}.csv`,
      ['Indicador', 'Valor'],
      [
        ['Periodo', `${r.periodo.desde} a ${r.periodo.hasta}`],
        ['Validaciones', r.resumen.total],
        ['Exitosas (respuesta definitiva)', r.resumen.exitosas],
        ['Tasa de validaciones exitosas %', r.resumen.tasaExito ?? ''],
        ['Estudiantes activos', r.resumen.activos],
        ['Activos sobre exitosas %', r.resumen.tasaActivos ?? ''],
        ['Sin respuesta de la UTP', r.resumen.noVerificadas],
        ['Tiempo promedio ms', t.promedio ?? ''],
        ['Tiempo mediano ms', t.mediana ?? ''],
        ['Percentil 90 ms', t.p90 ?? ''],
        ['Percentil 95 ms', t.p95 ?? ''],
        ['Tiempo mínimo ms', t.minimo ?? ''],
        ['Tiempo máximo ms', t.maximo ?? ''],
        [`Dentro de la meta (<= ${r.metaMs} ms) %`, t.dentroMeta ?? ''],
        ...r.resultados.map((x) => [`Resultado ${x.resultado}`, x.validaciones] as (string | number)[]),
        ...r.tramos.map((x) => [`Tiempo ${x.tramo}`, x.validaciones] as (string | number)[]),
        ...r.porCriterio.map((x) => [`Método ${x.nombre}: total / tasa éxito % / mediana ms`, `${x.total} / ${x.tasaExito ?? ''} / ${x.medianaMs ?? ''}`] as (string | number)[]),
        ...r.porDia.map((x) => [`Día ${x.fecha}: total / exitosas / activos / mediana ms`, `${x.total} / ${x.exitosas} / ${x.activos} / ${x.medianaMs ?? ''}`] as (string | number)[]),
      ],
    );
  }

  return (
    <>
      <div className="filtros">
        <SelectorPeriodo dias={dias} onCambiar={setDias} />
        {reporte && (
          <span className="filtros-periodo">
            {fmt.fecha(reporte.periodo.desde)} – {fmt.fecha(reporte.periodo.hasta)}
          </span>
        )}
        {reporte && (
          <button type="button" className="boton boton-secundario-claro" onClick={() => exportar(reporte)}>
            Exportar CSV
          </button>
        )}
      </div>
      {error && <ErrorPanel mensaje={error} onReintentar={() => setIntento((n) => n + 1)} />}
      {!reporte && !error && <EsqueletoPanel />}
      {reporte && <Contenido r={reporte} />}
    </>
  );
}

function Contenido({ r }: { r: Reporte }) {
  const t = r.tiempos;
  const diasConDatos = r.porDia.filter((d) => d.medianaMs !== null);

  return (
    <>
      <section className="indicadores" aria-label="Indicadores de validación">
        <Indicador titulo="Validaciones" valor={fmt.numero(r.resumen.total)} nota={`en ${r.periodo.dias} días`} destacado />
        <Indicador titulo="Tasa de éxito" valor={fmt.pct(r.resumen.tasaExito)} nota={`${fmt.numero(r.resumen.noVerificadas)} sin respuesta de la UTP`} />
        <Indicador titulo="Tiempo mediano" valor={ms(t.mediana)} nota={`promedio ${ms(t.promedio)}`} />
        <Indicador titulo="Percentil 95" valor={ms(t.p95)} nota={`el 95 % respondió en menos · máx. ${ms(t.maximo)}`} />
        <Indicador titulo="Dentro de la meta" valor={fmt.pct(t.dentroMeta)} nota={`respondió en ${ms(r.metaMs)} o menos`} />
        <Indicador titulo="Estudiantes activos" valor={fmt.pct(r.resumen.tasaActivos)} nota={`${fmt.numero(r.resumen.activos)} de las respuestas definitivas`} />
        <Indicador titulo="Percentil 90" valor={ms(t.p90)} nota={`mínimo ${ms(t.minimo)}`} />
        <Indicador
          titulo="Con tiempo medido"
          valor={fmt.numero(t.medidas)}
          nota={t.medidas < r.resumen.total ? `${fmt.numero(r.resumen.total - t.medidas)} anteriores a la medición` : 'todas las validaciones'}
        />
      </section>

      <div className="rejilla-graficos">
        <TarjetaGrafico
          className="ancho-completo"
          titulo="Validaciones por día"
          subtitulo={`${fmt.numero(r.resumen.total)} en ${r.periodo.dias} días`}
          tabla={{
            columnas: ['Fecha', 'Total', 'Exitosas', 'Activos', 'Mediana'],
            filas: r.porDia.map((d) => [fmt.fecha(d.fecha, true), d.total, d.exitosas, d.activos, ms(d.medianaMs)]),
          }}
        >
          <GraficoLinea unidad="validaciones" datos={r.porDia.map((d) => ({ etiqueta: fmt.fecha(d.fecha), etiquetaLarga: fmt.fecha(d.fecha, true), valor: d.total }))} />
        </TarjetaGrafico>

        <TarjetaGrafico
          className="ancho-completo"
          titulo="Tiempo de respuesta mediano por día"
          subtitulo="Desde que llega la consulta hasta que se responde, incluida la consulta a la UTP (ms)"
          tabla={{ columnas: ['Fecha', 'Mediana', 'Validaciones'], filas: diasConDatos.map((d) => [fmt.fecha(d.fecha, true), ms(d.medianaMs), d.total]) }}
        >
          {diasConDatos.length === 0 ? (
            <p className="grafico-nota">Todavía no hay validaciones con tiempo medido en este periodo.</p>
          ) : (
            <GraficoLinea unidad="ms" datos={diasConDatos.map((d) => ({ etiqueta: fmt.fecha(d.fecha), etiquetaLarga: fmt.fecha(d.fecha, true), valor: d.medianaMs! }))} />
          )}
        </TarjetaGrafico>

        <TarjetaGrafico
          titulo="Resultado de las validaciones"
          subtitulo="Qué respondió el sistema"
          tabla={{ columnas: ['Resultado', 'Validaciones', 'Participación'], filas: r.resultados.map((x) => [NOMBRE_RESULTADO[x.resultado], x.validaciones, fmt.pct(x.participacion)]) }}
        >
          <BarrasHorizontales
            items={r.resultados.map((x) => ({
              nombre: NOMBRE_RESULTADO[x.resultado],
              valor: x.validaciones,
              textoValor: fmt.pct(x.participacion),
              tooltip: (
                <>
                  <span className="tooltip-titulo">{NOMBRE_RESULTADO[x.resultado]}</span>
                  <b>{fmt.numero(x.validaciones)}</b> validaciones
                </>
              ),
            }))}
          />
        </TarjetaGrafico>

        <TarjetaGrafico
          titulo="Distribución de los tiempos"
          subtitulo={`${fmt.numero(t.medidas)} validaciones con tiempo medido`}
          tabla={{ columnas: ['Tramo', 'Validaciones'], filas: r.tramos.map((x) => [x.tramo, x.validaciones]) }}
        >
          <BarrasHorizontales
            tono="utp"
            items={r.tramos.map((x) => ({
              nombre: x.tramo,
              valor: x.validaciones,
              textoValor: fmt.numero(x.validaciones),
              tooltip: (
                <>
                  <span className="tooltip-titulo">{x.tramo}</span>
                  <b>{fmt.numero(x.validaciones)}</b> validaciones
                </>
              ),
            }))}
          />
        </TarjetaGrafico>

        <TarjetaGrafico
          titulo="Por método de validación"
          subtitulo="QR, cédula escrita o foto del QR"
          tabla={{
            columnas: ['Método', 'Total', 'Tasa de éxito', 'Mediana', 'P95'],
            filas: r.porCriterio.map((x) => [x.nombre, x.total, fmt.pct(x.tasaExito), ms(x.medianaMs), ms(x.p95Ms)]),
          }}
        >
          <BarrasHorizontales
            items={r.porCriterio.map((x) => ({
              nombre: x.nombre,
              detalle: `éxito ${fmt.pct(x.tasaExito)} · mediana ${ms(x.medianaMs)}`,
              valor: x.total,
              textoValor: fmt.numero(x.total),
              tooltip: (
                <>
                  <span className="tooltip-titulo">{x.nombre}</span>
                  <b>{fmt.numero(x.total)}</b> validaciones · éxito {fmt.pct(x.tasaExito)}
                  <br />
                  Mediana {ms(x.medianaMs)} · P95 {ms(x.p95Ms)}
                </>
              ),
            }))}
          />
        </TarjetaGrafico>

        <TarjetaGrafico
          titulo="Por tienda"
          subtitulo="Desde qué comercio se validó"
          tabla={{
            columnas: ['Tienda', 'Total', 'Activos', 'Tasa de éxito', 'Mediana', 'P95'],
            filas: r.porComercio.map((x) => [x.nombre, x.total, x.activos, fmt.pct(x.tasaExito), ms(x.medianaMs), ms(x.p95Ms)]),
          }}
        >
          <BarrasHorizontales
            items={r.porComercio.slice(0, 10).map((x) => ({
              nombre: x.nombre,
              detalle: `${fmt.numero(x.activos)} activos · mediana ${ms(x.medianaMs)}`,
              valor: x.total,
              textoValor: fmt.numero(x.total),
              tooltip: (
                <>
                  <span className="tooltip-titulo">{x.nombre}</span>
                  <b>{fmt.numero(x.total)}</b> validaciones · {fmt.numero(x.activos)} activos
                </>
              ),
            }))}
          />
        </TarjetaGrafico>

        <section className="tarjeta tarjeta-grafico ancho-completo definiciones">
          <h2>Cómo se calcula</h2>
          <dl>
            <dt>Validación exitosa</dt>
            <dd>El sistema dio una respuesta definitiva: activo, inactivo o no registrado. Rechazar a un inactivo también es un éxito del sistema.</dd>
            <dt>Validación fallida</dt>
            <dd>La API de la UTP no respondió a tiempo (5 s) o dio error, y no se pudo decidir. Nunca se informa como «inactivo».</dd>
            <dt>Tiempo de respuesta</dt>
            <dd>
              Lo mide la API desde que recibe la consulta hasta que responde, incluida la consulta a la UTP y la lectura de la foto del QR. No incluye la red del
              celular. Mediana = la mitad respondió en menos; percentil 95 = el 95 % respondió en menos.
            </dd>
            <dt>Meta</dt>
            <dd>{ms(r.metaMs)} por validación, configurable con META_RESPUESTA_MS. Se reporta el porcentaje que la cumple.</dd>
          </dl>
        </section>
      </div>
    </>
  );
}
