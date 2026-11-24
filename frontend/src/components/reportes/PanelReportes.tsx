import { useEffect, useState } from 'react';
import { fmt, obtenerReporte, type Reporte } from '../../services/reportes';
import { ErrorSesion } from '../../services/sesion';
import { IconoAlerta, IconoReintentar } from '../Iconos';
import { BarrasHorizontales, GraficoLinea, MapaCalor, TarjetaGrafico } from './Graficos';
import '../../reportes.css';

export const RANGOS = [
  { dias: 7, texto: '7 días' },
  { dias: 30, texto: '30 días' },
  { dias: 90, texto: '90 días' },
];

const corto = (facultad: string) => facultad.replace(/^Facultad de /, '').replace(/^Ingeniería (de )?/, 'Ing. ');

export function descargarCsv(nombre: string, columnas: string[], filas: (string | number)[][]) {
  const celda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const contenido = [columnas, ...filas].map((f) => f.map(celda).join(',')).join('\r\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8' }));
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

/** Botones de periodo (7, 30, 90 días) compartidos por las pestañas del panel. */
export function SelectorPeriodo({ dias, onCambiar }: { dias: number; onCambiar: (dias: number) => void }) {
  return (
    <div className="segmentado segmentado-compacto" role="group" aria-label="Periodo">
      {RANGOS.map((r) => (
        <button key={r.dias} type="button" className="segmento" aria-pressed={dias === r.dias} onClick={() => onCambiar(r.dias)}>
          {r.texto}
        </button>
      ))}
    </div>
  );
}

/** Aviso de error con botón para reintentar. */
export function ErrorPanel({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div className="aviso-linea aviso-error panel-error" role="alert">
      <IconoAlerta width={18} height={18} />
      {mensaje}
      <button type="button" className="boton-texto" onClick={onReintentar}>
        <IconoReintentar width={16} height={16} /> Reintentar
      </button>
    </div>
  );
}

interface Props {
  token: string;
  onSesionVencida: (aviso: string) => void;
}

/** Pestaña "Uso del programa" del administrador: canjes, horarios, tiendas, facultades y descuentos. */
export function PanelReportes({ token, onSesionVencida }: Props) {
  const [dias, setDias] = useState(30);
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    setError(null);
    obtenerReporte(dias, token, control.signal)
      .then(setReporte)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (e instanceof ErrorSesion) return onSesionVencida(e.message);
        setError(e instanceof Error ? e.message : 'No se pudo cargar el reporte.');
      });
    return () => control.abort();
  }, [dias, intento, token, onSesionVencida]);

  return (
    <>
      <div className="filtros">
        <SelectorPeriodo dias={dias} onCambiar={setDias} />
        {reporte && (
          <span className="filtros-periodo">
            {fmt.fecha(reporte.periodo.desde)} – {fmt.fecha(reporte.periodo.hasta)}
          </span>
        )}
        <span className="etiqueta-simulado" title="Generados con scripts/sembrar_reporteria.py">
          Datos simulados
        </span>
      </div>

      {error && <ErrorPanel mensaje={error} onReintentar={() => setIntento((n) => n + 1)} />}
      {!reporte && !error && <EsqueletoPanel />}
      {reporte && <Contenido reporte={reporte} />}
    </>
  );
}

function Contenido({ reporte }: { reporte: Reporte }) {
  const r = reporte.resumen;
  const dias = reporte.periodo.dias;
  const facultadesVisibles = reporte.facultades.filter((f) => f.porCada100 !== null);
  const agrupadas = reporte.facultades.find((f) => f.agrupado);

  return (
    <>
      <section className="indicadores" aria-label="Indicadores principales">
        <Indicador
          titulo="Descuentos aplicados"
          valor={fmt.numero(r.canjes)}
          cambio={r.variacionCanjes}
          nota={`vs. ${dias} días anteriores`}
          destacado
        />
        <Indicador titulo="Estudiantes únicos" valor={fmt.numero(r.estudiantesUnicos)} nota={`${r.canjesPorEstudiante ?? '—'} canjes por estudiante`} />
        <Indicador titulo="Ahorro entregado" valor={fmt.dinero(r.ahorroTotal)} nota={`en ${fmt.numero(r.canjesConMonto)} compras con monto`} />
        <Indicador titulo="Descuento promedio" valor={fmt.pct(r.descuentoPromedio)} nota="2x1 cuenta como 50 %" />
        <Indicador titulo="Ticket promedio" valor={r.ticketPromedio === null ? '—' : fmt.dinero(r.ticketPromedio)} nota="monto de compra" />
        <Indicador titulo="Recurrencia" valor={fmt.pct(r.recurrencia)} nota="volvieron a canjear" />
        <Indicador titulo="Conversión" valor={fmt.pct(r.conversion)} nota="validaciones activas que canjearon" />
        <Indicador titulo="Rechazos" valor={fmt.pct(r.tasaRechazo)} nota={`inactivos o no registrados · ${r.noVerificadas} sin respuesta UTP`} />
      </section>

      <div className="rejilla-graficos">
        <TarjetaGrafico
          className="ancho-completo"
          titulo="Descuentos por día"
          subtitulo={`${fmt.numero(r.canjes)} en ${dias} días`}
          tabla={{ columnas: ['Fecha', 'Canjes'], filas: reporte.porDia.map((d) => [fmt.fecha(d.fecha, true), d.canjes]) }}
        >
          <GraficoLinea
            unidad="canjes"
            datos={reporte.porDia.map((d) => ({ etiqueta: fmt.fecha(d.fecha), etiquetaLarga: fmt.fecha(d.fecha, true), valor: d.canjes }))}
          />
        </TarjetaGrafico>

        <TarjetaGrafico
          className="ancho-completo"
          titulo="¿A qué hora se usan los descuentos?"
          subtitulo={
            reporte.horario.pico
              ? `Hora pico: ${reporte.horario.pico.dia.toLowerCase()} de ${reporte.horario.pico.hora}:00 a ${reporte.horario.pico.hora + 1}:00 (${reporte.horario.pico.canjes} canjes)`
              : 'Sin canjes en el periodo'
          }
          tabla={{
            columnas: ['Día', ...Array.from({ length: 12 }, (_, i) => `${i + 10}:00`)],
            filas: reporte.horario.dias.map((d, i) => [d, ...reporte.horario.matriz[i]!.slice(10, 22)]),
          }}
        >
          <MapaCalor dias={reporte.horario.dias} matriz={reporte.horario.matriz} />
        </TarjetaGrafico>

        <TarjetaGrafico
          titulo="Tiendas con más descuentos"
          subtitulo="Ranking por canjes"
          tabla={{
            columnas: ['Tienda', 'Categoría', 'Canjes', 'Estudiantes', 'Desc. prom.', 'Ahorro'],
            filas: reporte.tiendas.map((t) => [t.nombre, t.categoria, t.canjes, t.estudiantes, fmt.pct(t.descuentoPromedio), fmt.dinero(t.ahorro)]),
          }}
          acciones={
            <button
              type="button"
              className="boton-texto"
              onClick={() =>
                descargarCsv(
                  `actitud-tiendas-${reporte.periodo.desde}_${reporte.periodo.hasta}.csv`,
                  ['Tienda', 'Categoría', 'Canjes', 'Estudiantes únicos', 'Descuento promedio %', 'Ahorro entregado'],
                  reporte.tiendas.map((t) => [t.nombre, t.categoria, t.canjes, t.estudiantes, t.descuentoPromedio, t.ahorro.toFixed(2)]),
                )
              }
            >
              Exportar CSV
            </button>
          }
        >
          <BarrasHorizontales
            items={reporte.tiendas.slice(0, 10).map((t) => ({
              nombre: t.nombre,
              detalle: t.categoria,
              valor: t.canjes,
              textoValor: fmt.numero(t.canjes),
              tooltip: (
                <>
                  <span className="tooltip-titulo">{t.nombre}</span>
                  <b>{fmt.numero(t.canjes)}</b> canjes · {fmt.numero(t.estudiantes)} estudiantes
                  <br />
                  Descuento prom. {fmt.pct(t.descuentoPromedio)} · ahorro {fmt.dinero(t.ahorro)}
                </>
              ),
            }))}
          />
        </TarjetaGrafico>

        <TarjetaGrafico
          titulo="Uso por facultad"
          subtitulo="Estudiantes que usaron el programa por cada 100 matriculados"
          tabla={{
            columnas: ['Facultad', 'Estudiantes', 'Matrícula', 'Por cada 100', 'Canjes'],
            filas: reporte.facultades.map((f) => [f.nombre, f.estudiantes, f.matricula ?? '—', f.porCada100 ?? '—', f.canjes]),
          }}
        >
          <BarrasHorizontales
            tono="utp"
            items={[...facultadesVisibles]
              .sort((a, b) => b.porCada100! - a.porCada100!)
              .map((f) => ({
                nombre: corto(f.nombre),
                detalle: `${fmt.numero(f.estudiantes)} de ${fmt.numero(f.matricula ?? 0)}`,
                valor: f.porCada100!,
                textoValor: f.porCada100!.toLocaleString('es-PA'),
                tooltip: (
                  <>
                    <span className="tooltip-titulo">{f.nombre}</span>
                    <b>{f.porCada100!.toLocaleString('es-PA')}</b> de cada 100 estudiantes · {fmt.numero(f.canjes)} canjes
                  </>
                ),
              }))}
          />
          <p className="grafico-nota">
            Comparar por cada 100 matriculados evita que siempre gane la facultad más grande.
            {agrupadas && ` ${agrupadas.estudiantes} estudiantes de grupos con menos de ${reporte.minimoGrupo} se muestran juntos en la tabla.`}
          </p>
        </TarjetaGrafico>

        <TarjetaGrafico
          titulo="Tipos de descuento"
          subtitulo="Participación en el total de canjes"
          tabla={{
            columnas: ['Tipo', 'Canjes', 'Participación', 'Estudiantes'],
            filas: reporte.descuentos.map((d) => [d.tipo, d.canjes, fmt.pct(d.participacion), d.estudiantes]),
          }}
        >
          <BarrasHorizontales
            items={reporte.descuentos.map((d) => ({
              nombre: d.tipo,
              valor: d.canjes,
              textoValor: fmt.pct(d.participacion),
              tooltip: (
                <>
                  <span className="tooltip-titulo">Descuentos {d.tipo}</span>
                  <b>{fmt.numero(d.canjes)}</b> canjes · {fmt.numero(d.estudiantes)} estudiantes
                </>
              ),
            }))}
          />
        </TarjetaGrafico>

        <TarjetaGrafico
          titulo="Carreras que más usan el programa"
          subtitulo={`Solo grupos de ${reporte.minimoGrupo} estudiantes o más`}
          tabla={{ columnas: ['Carrera', 'Estudiantes', 'Canjes'], filas: reporte.carreras.map((c) => [c.nombre, c.estudiantes, c.canjes]) }}
        >
          <BarrasHorizontales
            tono="utp"
            items={[...reporte.carreras]
              .filter((c) => !c.agrupado)
              .sort((a, b) => b.estudiantes - a.estudiantes)
              .slice(0, 8)
              .map((c) => ({
                nombre: c.nombre.replace(/^Licenciatura en /, ''),
                valor: c.estudiantes,
                textoValor: fmt.numero(c.estudiantes),
                tooltip: (
                  <>
                    <span className="tooltip-titulo">{c.nombre}</span>
                    <b>{fmt.numero(c.estudiantes)}</b> estudiantes · {fmt.numero(c.canjes)} canjes
                  </>
                ),
              }))}
          />
        </TarjetaGrafico>

        <section className="tarjeta tarjeta-grafico ancho-completo">
          <header className="grafico-cabecera">
            <div>
              <h2>Alertas para revisar</h2>
              <p>Patrones poco comunes. No acusan a nadie: el personal del mall decide si investigar.</p>
            </div>
            <span className="contador-alertas">{reporte.alertas.length}</span>
          </header>
          {reporte.alertas.length === 0 ? (
            <p className="grafico-nota">Sin alertas en el periodo.</p>
          ) : (
            <ul className="alertas">
              {reporte.alertas.slice(0, 8).map((a, i) => (
                <li key={i} className="alerta">
                  <span className="alerta-icono" aria-hidden="true">
                    <IconoAlerta width={18} height={18} />
                  </span>
                  <div>
                    <p className="alerta-titulo">{a.tipo === 'simultaneo' ? 'Mismo carnet en dos tiendas casi a la vez' : 'Muchos canjes el mismo día'}</p>
                    <p className="alerta-detalle">
                      {a.detalle} <span>{a.estudiante} · {a.fecha.replace('T', ' ')}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

export function Indicador({ titulo, valor, nota, cambio, destacado }: { titulo: string; valor: string; nota: string; cambio?: number | null; destacado?: boolean }) {
  return (
    <div className={`indicador${destacado ? ' indicador-destacado' : ''}`}>
      <p className="indicador-titulo">{titulo}</p>
      <p className="indicador-valor">{valor}</p>
      <p className="indicador-nota">
        {cambio !== undefined && cambio !== null && (
          <span className={`cambio ${cambio >= 0 ? 'sube' : 'baja'}`}>
            {cambio >= 0 ? '▲' : '▼'} {Math.abs(cambio).toLocaleString('es-PA')} %
          </span>
        )}{' '}
        {nota}
      </p>
    </div>
  );
}

export function EsqueletoPanel() {
  return (
    <div className="indicadores" aria-busy="true" aria-label="Cargando reportes">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="indicador esqueleto-indicador" />
      ))}
    </div>
  );
}
