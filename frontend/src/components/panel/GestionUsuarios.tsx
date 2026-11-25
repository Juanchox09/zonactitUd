import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react';
import { panel, type CambioUsuario, type ComercioPanel, type UsuarioComercio } from '../../services/panel';
import { ErrorSesion, TEXTO_PERMISO, textoRol, type Permiso } from '../../services/sesion';
import { IconoAlerta, IconoCheck } from '../Iconos';
import { ErrorPanel } from '../reportes/PanelReportes';

interface Props {
  token: string;
  onSesionVencida: (aviso: string) => void;
  /** Administración de ActitUd: crea cualquier permiso y, sin comercioId, ve a todos los usuarios. */
  esAdmin: boolean;
  /** Limita la vista a una tienda (equipo de la tienda). */
  comercioId?: number;
  /** Usuario de la sesión, para no ofrecer acciones sobre sí mismo. */
  usuarioActual?: string;
}

const PATRON_USUARIO = /^[A-Za-z0-9._-]{3,40}$/;

const DESCRIPCION_PERMISO: Record<Permiso, string> = {
  cajero: 'Solo valida carnets en su tienda. No entra al panel.',
  administrador: 'Valida, publica y configura las ofertas, ve las métricas y gestiona a los cajeros de su tienda.',
};

/** Contraseña aleatoria legible (sin 0/O ni 1/l) para entregar al usuario. */
function generarContrasena(): string {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const azar = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(azar, (n) => letras[n % letras.length]).join('');
}

function textoAcceso(iso: string | null): string {
  if (!iso) return 'Nunca';
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? iso : fecha.toLocaleString('es-PA', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Gestión de usuarios (objetivo 5).
 * - Admin de ActitUd: todos los usuarios, de cualquier tienda y permiso.
 * - Administrador de tienda: solo los cajeros de su tienda (crear, renombrar, cambiar contraseña, activar, eliminar).
 */
export function GestionUsuarios({ token, onSesionVencida, esAdmin, comercioId, usuarioActual = '' }: Props) {
  const [usuarios, setUsuarios] = useState<UsuarioComercio[] | null>(null);
  const [comercios, setComercios] = useState<ComercioPanel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [filtroTienda, setFiltroTienda] = useState('');
  const [filtroPermiso, setFiltroPermiso] = useState('');
  const global = esAdmin && comercioId === undefined;

  const cargar = useCallback(
    (senal?: AbortSignal) =>
      (comercioId === undefined ? panel.usuarios(token, senal) : panel.equipo(comercioId, token, senal)).then(setUsuarios),
    [token, comercioId],
  );

  useEffect(() => {
    const control = new AbortController();
    setError(null);
    cargar(control.signal).catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (e instanceof ErrorSesion) return onSesionVencida(e.message);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los usuarios.');
    });
    if (global) panel.comercios(token, control.signal).then(setComercios).catch(() => undefined);
    return () => control.abort();
  }, [cargar, global, token, intento, onSesionVencida]);

  /** Ejecuta una acción, recarga la lista y muestra el resultado. */
  async function accion(hacer: () => Promise<unknown>, mensaje: string): Promise<boolean> {
    setAviso(null);
    try {
      await hacer();
      await cargar();
      setAviso({ ok: true, texto: mensaje });
      return true;
    } catch (e) {
      if (e instanceof ErrorSesion) onSesionVencida(e.message);
      else setAviso({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo guardar.' });
      return false;
    }
  }

  const cambiar = (u: UsuarioComercio, cambio: CambioUsuario, mensaje: string) =>
    accion(
      () => (esAdmin ? panel.cambiarUsuario(u.id, cambio, token) : panel.cambiarCajero(comercioId!, u.id, cambio, token)),
      mensaje,
    );

  function eliminar(u: UsuarioComercio) {
    if (!window.confirm(`¿Eliminar al usuario «${u.usuario}»? No podrá volver a entrar. Los descuentos registrados se conservan.`)) return;
    void accion(
      () => (esAdmin ? panel.eliminarUsuario(u.id, token) : panel.eliminarCajero(comercioId!, u.id, token)),
      `Usuario «${u.usuario}» eliminado.`,
    );
  }

  if (error) return <ErrorPanel mensaje={error} onReintentar={() => setIntento((n) => n + 1)} />;
  if (!usuarios) return <div className="tarjeta ofertas-cargando" aria-busy="true">Cargando usuarios…</div>;

  /** El admin gestiona a todo el personal de tienda; el administrador de tienda, solo a sus cajeros y no a sí mismo. */
  const gestionable = (u: UsuarioComercio) =>
    u.rol === 'comercio' && u.usuario !== usuarioActual && (esAdmin || u.permiso === 'cajero');

  const busqueda = texto.trim().toLowerCase();
  const visibles = usuarios.filter(
    (u) =>
      (!busqueda || [u.usuario, u.nombre, u.comercio ?? ''].some((v) => v.toLowerCase().includes(busqueda))) &&
      (!filtroTienda || String(u.comercioId) === filtroTienda) &&
      (!filtroPermiso || (filtroPermiso === 'admin' ? u.rol === 'admin' : u.permiso === filtroPermiso)),
  );
  const cuenta = (p: Permiso) => usuarios.filter((u) => u.rol === 'comercio' && u.permiso === p).length;
  const inactivos = usuarios.filter((u) => !u.activo).length;
  const columnas = global ? 6 : 5;

  return (
    <div className="ofertas">
      <NuevoUsuario
        esAdmin={esAdmin}
        comercioId={comercioId}
        comercios={comercios}
        onCrear={(tienda, datos) =>
          accion(
            () => (esAdmin ? panel.crearUsuario(tienda, datos, token) : panel.crearCajero(tienda, datos, token)),
            `Usuario «${datos.usuario.toLowerCase()}» creado como ${TEXTO_PERMISO[datos.permiso].toLowerCase()}. Contraseña: ${datos.contrasena} (entrégala por un medio seguro; no se vuelve a mostrar).`,
          )
        }
      />

      {aviso && (
        <p className={`aviso-linea ${aviso.ok ? 'aviso-ok' : 'aviso-error'}`} role="status">
          {aviso.ok ? <IconoCheck width={18} height={18} /> : <IconoAlerta width={18} height={18} />}
          {aviso.texto}
        </p>
      )}

      <section className="tarjeta tarjeta-grafico">
        <header className="grafico-cabecera">
          <div>
            <h2>{global ? 'Usuarios del sistema' : 'Equipo de la tienda'}</h2>
            <p>
              {usuarios.length} usuarios · {cuenta('administrador')} administradores de tienda · {cuenta('cajero')} cajeros
              {inactivos > 0 && ` · ${inactivos} desactivados`}
            </p>
          </div>
        </header>

        <div className="filtros-usuarios">
          <input
            className="login-campo campo-buscar"
            type="search"
            placeholder={global ? 'Buscar usuario, nombre o tienda' : 'Buscar usuario o nombre'}
            aria-label="Buscar usuario"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          {global && (
            <select className="login-campo" aria-label="Filtrar por tienda" value={filtroTienda} onChange={(e) => setFiltroTienda(e.target.value)}>
              <option value="">Todas las tiendas</option>
              {comercios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
          <select className="login-campo" aria-label="Filtrar por permiso" value={filtroPermiso} onChange={(e) => setFiltroPermiso(e.target.value)}>
            <option value="">Todos los permisos</option>
            {global && <option value="admin">Administración ActitUd</option>}
            <option value="administrador">Administrador de tienda</option>
            <option value="cajero">Cajero</option>
          </select>
        </div>

        <div className="tabla-contenedor">
          <table className="tabla-datos tabla-usuarios">
            <thead>
              <tr>
                <th>Usuario</th>
                {global && <th>Tienda</th>}
                <th>Permiso</th>
                <th>Último acceso</th>
                <th>Estado</th>
                <th>
                  <span className="visualmente-oculto">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((u) => (
                <Fragment key={u.id}>
                  <tr className={u.activo ? '' : 'usuario-inactivo'}>
                    <td className="celda-usuario">
                      <b>
                        {u.nombre}
                        {u.usuario === usuarioActual && <span className="texto-tenue"> (tú)</span>}
                      </b>
                      <span className="texto-tenue">{u.usuario}</span>
                    </td>
                    {global && <td>{u.comercio ?? <span className="texto-tenue">—</span>}</td>}
                    <td>
                      <span className={`chip ${u.rol === 'admin' ? 'chip-admin' : u.permiso === 'administrador' ? 'chip-principal' : 'chip-cajero'}`}>
                        {textoRol(u)}
                      </span>
                    </td>
                    <td className="celda-fecha">{textoAcceso(u.ultimoAcceso)}</td>
                    <td>
                      <span className={`chip ${u.activo ? 'chip-hoy' : 'chip-apagado'}`}>{u.activo ? 'Activo' : 'Desactivado'}</span>
                    </td>
                    <td className="celda-acciones">
                      {gestionable(u) ? (
                        <span className="acciones-fila">
                          <button type="button" className="boton-texto" onClick={() => setEditando(editando === u.id ? null : u.id)} aria-expanded={editando === u.id}>
                            Editar
                          </button>
                          <button
                            type="button"
                            className="boton-texto"
                            onClick={() => void cambiar(u, { activo: !u.activo }, u.activo ? `«${u.usuario}» desactivado: ya no puede entrar.` : `«${u.usuario}» activado.`)}
                          >
                            {u.activo ? 'Desactivar' : 'Activar'}
                          </button>
                          <button type="button" className="boton-texto boton-peligro" onClick={() => eliminar(u)}>
                            Eliminar
                          </button>
                        </span>
                      ) : (
                        <span className="texto-tenue">—</span>
                      )}
                    </td>
                  </tr>
                  {editando === u.id && (
                    <tr className="fila-edicion">
                      <td colSpan={columnas}>
                        <EditarUsuario
                          usuario={u}
                          puedeCambiarPermiso={esAdmin}
                          onCancelar={() => setEditando(null)}
                          onGuardar={async (cambio, mensaje) => {
                            if (await cambiar(u, cambio, mensaje)) setEditando(null);
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {visibles.length === 0 && <p className="grafico-nota">Ningún usuario coincide con los filtros.</p>}
      </section>

      <section className="tarjeta leyenda-permisos" aria-label="Qué puede hacer cada permiso">
        <h3>Permisos</h3>
        <dl>
          {global && (
            <>
              <dt>Administración ActitUd</dt>
              <dd>Reportes del programa, reporte de validación, comercios y usuarios de todas las tiendas.</dd>
            </>
          )}
          <dt>Administrador de tienda</dt>
          <dd>{DESCRIPCION_PERMISO.administrador}</dd>
          <dt>Cajero</dt>
          <dd>{DESCRIPCION_PERMISO.cajero}</dd>
        </dl>
      </section>
    </div>
  );
}

interface PropsNuevo {
  esAdmin: boolean;
  comercioId?: number;
  comercios: ComercioPanel[];
  onCrear: (comercioId: number, datos: { usuario: string; nombre: string; contrasena: string; permiso: Permiso }) => Promise<boolean>;
}

function NuevoUsuario({ esAdmin, comercioId, comercios, onCrear }: PropsNuevo) {
  const [abierto, setAbierto] = useState(false);
  const [tienda, setTienda] = useState(comercioId ? String(comercioId) : '');
  const [permiso, setPermiso] = useState<Permiso>('cajero');
  const [usuario, setUsuario] = useState('');
  const [nombre, setNombre] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!tienda) return setError('Elige la tienda del usuario.');
    if (!PATRON_USUARIO.test(usuario.trim())) return setError('Usuario de 3 a 40 letras, números, punto, guion o guion bajo, sin espacios.');
    if (nombre.trim().length < 2) return setError('Escribe el nombre de la persona o de la caja.');
    if (contrasena.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    setError(null);
    setEnviando(true);
    const ok = await onCrear(Number(tienda), { usuario: usuario.trim(), nombre: nombre.trim(), contrasena, permiso: esAdmin ? permiso : 'cajero' });
    setEnviando(false);
    if (ok) {
      setUsuario('');
      setNombre('');
      setContrasena('');
      setAbierto(false);
    }
  }

  if (!abierto) {
    return (
      <div className="acciones-panel">
        <button type="button" className="boton boton-primario" onClick={() => setAbierto(true)}>
          {esAdmin ? 'Nuevo usuario' : 'Nuevo cajero'}
        </button>
      </div>
    );
  }

  return (
    <form className="tarjeta formulario-oferta formulario-suelto" onSubmit={enviar} noValidate>
      <h3>{esAdmin ? 'Nuevo usuario de tienda' : 'Nuevo cajero'}</h3>
      <div className="campos-oferta">
        {esAdmin && comercioId === undefined && (
          <label className="campo-panel">
            <span className="etiqueta">Tienda</span>
            <select className="login-campo" value={tienda} onChange={(e) => setTienda(e.target.value)} autoFocus>
              <option value="">Elige una tienda</option>
              {comercios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {!c.activo ? ' (inactiva)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {esAdmin && (
          <fieldset className="campo-panel campo-ancho opciones-permiso">
            <legend className="etiqueta">Permiso</legend>
            {(['cajero', 'administrador'] as Permiso[]).map((p) => (
              <label key={p} className={`opcion-permiso ${permiso === p ? 'elegida' : ''}`}>
                <input type="radio" name="permiso-nuevo" value={p} checked={permiso === p} onChange={() => setPermiso(p)} />
                <span>
                  <b>{TEXTO_PERMISO[p]}</b>
                  <small>{DESCRIPCION_PERMISO[p]}</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <label className="campo-panel">
          <span className="etiqueta">Usuario</span>
          <input className="login-campo" autoCapitalize="none" spellCheck={false} maxLength={40} placeholder="p. ej. bonage.caja1" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus={!esAdmin} />
        </label>
        <label className="campo-panel">
          <span className="etiqueta">Nombre</span>
          <input className="login-campo" maxLength={80} placeholder="Persona o caja" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="campo-panel campo-ancho">
          <span className="etiqueta">Contraseña inicial</span>
          <span className="campo-con-boton">
            <input className="login-campo" type="text" autoComplete="new-password" spellCheck={false} placeholder="8 caracteres o más" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
            <button type="button" className="boton boton-fantasma" onClick={() => setContrasena(generarContrasena())}>
              Generar
            </button>
          </span>
        </label>
      </div>
      {error && (
        <p className="aviso-linea aviso-error" role="alert">
          <IconoAlerta width={18} height={18} />
          {error}
        </p>
      )}
      <div className="formulario-acciones">
        <button type="button" className="boton boton-fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={enviando}>
          {enviando ? 'Creando…' : 'Crear usuario'}
        </button>
      </div>
    </form>
  );
}

interface PropsEditar {
  usuario: UsuarioComercio;
  puedeCambiarPermiso: boolean;
  onCancelar: () => void;
  onGuardar: (cambio: CambioUsuario, mensaje: string) => Promise<void>;
}

function EditarUsuario({ usuario, puedeCambiarPermiso, onCancelar, onGuardar }: PropsEditar) {
  const [nombre, setNombre] = useState(usuario.nombre);
  const [permiso, setPermiso] = useState<Permiso>(usuario.permiso ?? 'cajero');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (nombre.trim().length < 2) return setError('Escribe el nombre.');
    if (contrasena && contrasena.length < 8) return setError('La contraseña nueva debe tener al menos 8 caracteres.');
    const cambio: CambioUsuario = {};
    if (nombre.trim() !== usuario.nombre) cambio.nombre = nombre.trim();
    if (puedeCambiarPermiso && permiso !== usuario.permiso) cambio.permiso = permiso;
    if (contrasena) cambio.contrasena = contrasena;
    if (Object.keys(cambio).length === 0) return onCancelar();
    setError(null);
    const partes = [
      cambio.nombre && 'nombre',
      cambio.permiso && `permiso (${TEXTO_PERMISO[cambio.permiso].toLowerCase()})`,
      cambio.contrasena && `contraseña (nueva: ${cambio.contrasena})`,
    ].filter(Boolean);
    await onGuardar(cambio, `«${usuario.usuario}»: se cambió ${partes.join(', ')}.`);
  }

  return (
    <form className="editar-usuario" onSubmit={guardar} noValidate>
      <label className="campo-panel">
        <span className="etiqueta">Nombre</span>
        <input className="login-campo" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </label>
      {puedeCambiarPermiso && (
        <label className="campo-panel">
          <span className="etiqueta">Permiso</span>
          <select className="login-campo" value={permiso} onChange={(e) => setPermiso(e.target.value as Permiso)}>
            <option value="cajero">Cajero (solo valida)</option>
            <option value="administrador">Administrador de tienda</option>
          </select>
        </label>
      )}
      <label className="campo-panel">
        <span className="etiqueta">Nueva contraseña (opcional)</span>
        <span className="campo-con-boton">
          <input className="login-campo" type="text" autoComplete="new-password" spellCheck={false} placeholder="Dejar vacío para no cambiarla" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
          <button type="button" className="boton boton-fantasma" onClick={() => setContrasena(generarContrasena())}>
            Generar
          </button>
        </span>
      </label>
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
        <button type="submit" className="boton boton-primario">
          Guardar cambios
        </button>
      </div>
    </form>
  );
}
