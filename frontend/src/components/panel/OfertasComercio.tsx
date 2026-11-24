import { useEffect, useState, type FormEvent } from 'react';
import { DIAS_CORTOS, DIAS_LARGOS, panel, textoDias, type ComercioPanel, type DatosOferta, type OfertaPanel, type TipoOferta } from '../../services/panel';
import { fmt } from '../../services/reportes';
import { ErrorSesion } from '../../services/sesion';
import { IconoAlerta, IconoCheck, IconoEtiqueta } from '../Iconos';
import { ErrorPanel } from '../reportes/PanelReportes';

interface Props {
  comercioId: number;
  token: string;
  onSesionVencida: (aviso: string) => void;
  /** Se avisa cuando cambian las ofertas (la lista de comercios del admin se refresca). */
  onCambio?: (comercio: ComercioPanel) => void;
}

const OFERTA_NUEVA: DatosOferta = {
  tipo: 'porcentaje',
  porcentaje: 10,
  descripcion: '',
  activo: true,
  principal: false,
  vigenteDesde: null,
  vigenteHasta: '2026-12-31',
  diasSemana: '01234',
  condiciones: 'Descuento sobre mercancía a precio regular. No aplica con otras promociones.',
};

export const textoValor = (o: { tipo: TipoOferta; porcentaje: number }) => (o.tipo === '2x1' ? '2x1' : `${o.porcentaje} %`);

function textoVigencia(o: DatosOferta): string {
  if (o.vigenteDesde && o.vigenteHasta) return `Del ${fmt.fecha(o.vigenteDesde, true)} al ${fmt.fecha(o.vigenteHasta, true)}`;
  if (o.vigenteHasta) return `Hasta el ${fmt.fecha(o.vigenteHasta, true)}`;
  if (o.vigenteDesde) return `Desde el ${fmt.fecha(o.vigenteDesde, true)}`;
  return 'Sin fecha de vencimiento';
}

/** Ofertas de una tienda: publicarlas, editarlas, activarlas y elegir la que se aplica al validar. */
export function OfertasComercio({ comercioId, token, onSesionVencida, onCambio }: Props) {
  const [comercio, setComercio] = useState<ComercioPanel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [editando, setEditando] = useState<OfertaPanel | 'nueva' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();
    setError(null);
    panel
      .comercio(comercioId, token, control.signal)
      .then(setComercio)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (e instanceof ErrorSesion) return onSesionVencida(e.message);
        setError(e instanceof Error ? e.message : 'No se pudo cargar la tienda.');
      });
    return () => control.abort();
  }, [comercioId, token, intento, onSesionVencida]);

  function actualizar(nuevo: ComercioPanel, mensaje: string) {
    setComercio(nuevo);
    setAviso(mensaje);
    onCambio?.(nuevo);
  }

  async function accion(promesa: Promise<ComercioPanel>, mensaje: string) {
    setAviso(null);
    try {
      actualizar(await promesa, mensaje);
      return true;
    } catch (e) {
      if (e instanceof ErrorSesion) onSesionVencida(e.message);
      else setAviso(`⚠ ${e instanceof Error ? e.message : 'No se pudo guardar.'}`);
      return false;
    }
  }

  const datosDe = (o: OfertaPanel): DatosOferta => ({
    tipo: o.tipo,
    porcentaje: o.porcentaje,
    descripcion: o.descripcion,
    activo: o.activo,
    principal: o.principal,
    vigenteDesde: o.vigenteDesde,
    vigenteHasta: o.vigenteHasta,
    diasSemana: o.diasSemana,
    condiciones: o.condiciones,
  });

  async function eliminar(o: OfertaPanel) {
    if (!window.confirm(`¿Eliminar la oferta «${o.descripcion}»?`)) return;
    setAviso(null);
    try {
      await panel.eliminarOferta(comercioId, o.id, token);
      const nuevo = await panel.comercio(comercioId, token);
      actualizar(nuevo, 'Oferta eliminada.');
    } catch (e) {
      if (e instanceof ErrorSesion) onSesionVencida(e.message);
      else setAviso(`⚠ ${e instanceof Error ? e.message : 'No se pudo eliminar.'}`);
    }
  }

  if (error) return <ErrorPanel mensaje={error} onReintentar={() => setIntento((n) => n + 1)} />;
  if (!comercio) return <div className="tarjeta ofertas-cargando" aria-busy="true">Cargando ofertas…</div>;

  const hoy = comercio.descuentos.find((d) => d.id === comercio.descuentoHoy);

  return (
    <div className="ofertas">
      <section className={`tarjeta oferta-hoy${hoy ? '' : ' sin-oferta'}`} aria-live="polite">
        <span className="oferta-hoy-icono" aria-hidden="true">
          {hoy ? <IconoEtiqueta width={22} height={22} /> : <IconoAlerta width={22} height={22} />}
        </span>
        <div>
          <p className="oferta-hoy-titulo">{hoy ? 'Hoy se aplica al validar' : 'Hoy no se aplica ningún descuento'}</p>
          <p className="oferta-hoy-detalle">
            {hoy ? (
              <>
                <b>{textoValor(hoy)}</b> · {hoy.descripcion}
              </>
            ) : (
              'Ninguna oferta está activa y vigente hoy: los estudiantes de esta tienda no recibirán descuento.'
            )}
          </p>
        </div>
        {!comercio.activo && <span className="chip chip-apagado">Tienda inactiva</span>}
      </section>

      {aviso && (
        <p className={`aviso-linea ${aviso.startsWith('⚠') ? 'aviso-error' : 'aviso-ok'}`} role="status">
          {aviso.startsWith('⚠') ? <IconoAlerta width={18} height={18} /> : <IconoCheck width={18} height={18} />}
          {aviso.replace(/^⚠ /, '')}
        </p>
      )}

      <section className="tarjeta tarjeta-grafico">
        <header className="grafico-cabecera">
          <div>
            <h2>Ofertas</h2>
            <p>La marcada como principal es la que se aplica al validar, si está vigente ese día.</p>
          </div>
          {editando === null && (
            <button type="button" className="boton boton-primario" onClick={() => setEditando('nueva')}>
              Nueva oferta
            </button>
          )}
        </header>

        {editando === 'nueva' && (
          <FormularioOferta
            inicial={{ ...OFERTA_NUEVA, principal: comercio.descuentos.length === 0 }}
            titulo="Nueva oferta"
            onCancelar={() => setEditando(null)}
            onGuardar={async (datos) => {
              if (await accion(panel.crearOferta(comercioId, datos, token), 'Oferta publicada.')) setEditando(null);
            }}
          />
        )}

        {comercio.descuentos.length === 0 && editando === null && <p className="grafico-nota">Esta tienda aún no tiene ofertas.</p>}

        <ul className="lista-ofertas">
          {comercio.descuentos.map((o) =>
            editando !== 'nueva' && editando?.id === o.id ? (
              <li key={o.id}>
                <FormularioOferta
                  inicial={datosDe(o)}
                  titulo="Editar oferta"
                  onCancelar={() => setEditando(null)}
                  onGuardar={async (datos) => {
                    if (await accion(panel.editarOferta(comercioId, o.id, datos, token), 'Cambios guardados.')) setEditando(null);
                  }}
                />
              </li>
            ) : (
              <li key={o.id} className={`oferta${o.activo ? '' : ' oferta-inactiva'}`}>
                <span className="oferta-valor">{textoValor(o)}</span>
                <div className="oferta-cuerpo">
                  <p className="oferta-descripcion">{o.descripcion}</p>
                  <p className="oferta-reglas">
                    {textoDias(o.diasSemana)} · {textoVigencia(o)}
                  </p>
                  {o.condiciones && <p className="oferta-condiciones">{o.condiciones}</p>}
                  <p className="oferta-chips">
                    {o.principal && <span className="chip chip-principal">Principal</span>}
                    {o.id === comercio.descuentoHoy && <span className="chip chip-hoy">Se aplica hoy</span>}
                    {o.activo && !o.aplicaHoy && <span className="chip chip-apagado">No vigente hoy</span>}
                    {!o.activo && <span className="chip chip-apagado">Desactivada</span>}
                  </p>
                </div>
                <div className="oferta-acciones">
                  <button type="button" className="boton-texto" onClick={() => setEditando(o)} disabled={editando !== null}>
                    Editar
                  </button>
                  {!o.principal && o.activo && (
                    <button
                      type="button"
                      className="boton-texto"
                      onClick={() => void accion(panel.editarOferta(comercioId, o.id, { ...datosDe(o), principal: true }, token), 'Ahora es la oferta principal.')}
                    >
                      Hacer principal
                    </button>
                  )}
                  <button
                    type="button"
                    className="boton-texto"
                    onClick={() =>
                      void accion(
                        panel.editarOferta(comercioId, o.id, { ...datosDe(o), activo: !o.activo, principal: o.activo ? false : o.principal }, token),
                        o.activo ? 'Oferta desactivada.' : 'Oferta activada.',
                      )
                    }
                  >
                    {o.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button type="button" className="boton-texto boton-peligro" onClick={() => void eliminar(o)}>
                    Eliminar
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}

interface PropsFormulario {
  inicial: DatosOferta;
  titulo: string;
  onGuardar: (datos: DatosOferta) => Promise<void>;
  onCancelar: () => void;
}

function FormularioOferta({ inicial, titulo, onGuardar, onCancelar }: PropsFormulario) {
  const [datos, setDatos] = useState<DatosOferta>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cambiar = <K extends keyof DatosOferta>(campo: K, valor: DatosOferta[K]) => setDatos((d) => ({ ...d, [campo]: valor }));

  function alternarDia(dia: number) {
    const actual = new Set(datos.diasSemana.split('').map(Number));
    if (actual.has(dia)) actual.delete(dia);
    else actual.add(dia);
    cambiar('diasSemana', [...actual].sort().join(''));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (datos.descripcion.trim().length < 3) return setError('Escribe una descripción de la oferta.');
    if (!datos.diasSemana) return setError('Elige al menos un día de la semana.');
    if (datos.tipo !== '2x1' && (datos.porcentaje < 1 || datos.porcentaje > 100)) return setError('El porcentaje va de 1 a 100.');
    if (datos.vigenteDesde && datos.vigenteHasta && datos.vigenteHasta < datos.vigenteDesde)
      return setError('La vigencia termina antes de empezar.');
    setError(null);
    setGuardando(true);
    await onGuardar({ ...datos, porcentaje: datos.tipo === '2x1' ? 50 : datos.porcentaje, condiciones: datos.condiciones?.trim() || null });
    setGuardando(false);
  }

  return (
    <form className="formulario-oferta" onSubmit={enviar} noValidate>
      <h3>{titulo}</h3>
      <div className="campos-oferta">
        <fieldset className="campo-panel">
          <legend className="etiqueta">Tipo</legend>
          <div className="opciones-tipo">
            {(['porcentaje', '2x1', 'otro'] as TipoOferta[]).map((t) => (
              <button key={t} type="button" className="chip-boton" aria-pressed={datos.tipo === t} onClick={() => cambiar('tipo', t)}>
                {t === 'porcentaje' ? 'Porcentaje' : t === '2x1' ? '2x1' : 'Otro'}
              </button>
            ))}
          </div>
        </fieldset>

        {datos.tipo !== '2x1' && (
          <label className="campo-panel">
            <span className="etiqueta">{datos.tipo === 'otro' ? 'Equivale a (%)' : 'Porcentaje'}</span>
            <input
              className="login-campo campo-corto"
              type="number"
              min={1}
              max={100}
              inputMode="numeric"
              value={datos.porcentaje}
              onChange={(e) => cambiar('porcentaje', Number(e.target.value))}
            />
          </label>
        )}

        <label className="campo-panel campo-ancho">
          <span className="etiqueta">Descripción</span>
          <input
            className="login-campo"
            maxLength={120}
            placeholder="p. ej. 15 % en mercancía a precio regular"
            value={datos.descripcion}
            onChange={(e) => cambiar('descripcion', e.target.value)}
          />
        </label>

        <fieldset className="campo-panel campo-ancho">
          <legend className="etiqueta">Días en que aplica</legend>
          <div className="opciones-dias">
            {DIAS_CORTOS.map((d, i) => (
              <button
                key={d}
                type="button"
                className="chip-boton chip-dia"
                aria-pressed={datos.diasSemana.includes(String(i))}
                aria-label={DIAS_LARGOS[i]}
                title={DIAS_LARGOS[i]}
                onClick={() => alternarDia(i)}
              >
                {d}
              </button>
            ))}
            <button type="button" className="boton-texto" onClick={() => cambiar('diasSemana', '01234')}>
              Lunes a viernes
            </button>
            <button type="button" className="boton-texto" onClick={() => cambiar('diasSemana', '0123456')}>
              Todos
            </button>
          </div>
        </fieldset>

        <label className="campo-panel">
          <span className="etiqueta">Vigente desde</span>
          <input className="login-campo" type="date" value={datos.vigenteDesde ?? ''} onChange={(e) => cambiar('vigenteDesde', e.target.value || null)} />
        </label>
        <label className="campo-panel">
          <span className="etiqueta">Vigente hasta</span>
          <input className="login-campo" type="date" value={datos.vigenteHasta ?? ''} onChange={(e) => cambiar('vigenteHasta', e.target.value || null)} />
        </label>

        <label className="campo-panel campo-ancho">
          <span className="etiqueta">Condiciones (opcional)</span>
          <textarea
            className="login-campo campo-texto"
            maxLength={300}
            rows={2}
            value={datos.condiciones ?? ''}
            onChange={(e) => cambiar('condiciones', e.target.value)}
          />
        </label>

        <div className="campo-panel campo-ancho casillas">
          <label className="casilla">
            <input type="checkbox" checked={datos.principal} onChange={(e) => cambiar('principal', e.target.checked)} />
            Principal: es la que se aplica al validar
          </label>
          <label className="casilla">
            <input type="checkbox" checked={datos.activo} onChange={(e) => cambiar('activo', e.target.checked)} />
            Activa
          </label>
        </div>
      </div>

      {error && (
        <p className="aviso-linea aviso-error" role="alert">
          <IconoAlerta width={18} height={18} />
          {error}
        </p>
      )}
      <div className="formulario-acciones">
        <button type="button" className="boton boton-fantasma" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
