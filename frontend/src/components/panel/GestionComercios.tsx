import { useEffect, useState, type FormEvent } from 'react';
import { panel, type ComercioPanel } from '../../services/panel';
import { ErrorSesion } from '../../services/sesion';
import { IconoAlerta, IconoCheck } from '../Iconos';
import { ErrorPanel } from '../reportes/PanelReportes';
import { MetricasComercio } from './MetricasComercio';
import { OfertasComercio, textoValor } from './OfertasComercio';

interface Props {
  token: string;
  onSesionVencida: (aviso: string) => void;
}

// Categorías del arte oficial de ActitUd (anexo del anteproyecto).
const CATEGORIAS = ['Shopping', 'Restaurantes', 'Entretenimiento'];

/** Administración de comercios afiliados: afiliar tiendas, activarlas, crear sus usuarios y ver sus ofertas. */
export function GestionComercios({ token, onSesionVencida }: Props) {
  const [comercios, setComercios] = useState<ComercioPanel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    const control = new AbortController();
    setError(null);
    panel
      .comercios(token, control.signal)
      .then(setComercios)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (e instanceof ErrorSesion) return onSesionVencida(e.message);
        setError(e instanceof Error ? e.message : 'No se pudieron cargar los comercios.');
      });
    return () => control.abort();
  }, [token, intento, onSesionVencida]);

  const reemplazar = (nuevo: ComercioPanel) =>
    setComercios((lista) => {
      const sin = (lista ?? []).filter((c) => c.id !== nuevo.id);
      return [...sin, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    });

  if (error) return <ErrorPanel mensaje={error} onReintentar={() => setIntento((n) => n + 1)} />;
  if (!comercios) return <div className="tarjeta ofertas-cargando" aria-busy="true">Cargando comercios…</div>;

  const elegido = comercios.find((c) => c.id === abierto);
  if (elegido) {
    return (
      <DetalleComercio
        comercio={elegido}
        token={token}
        onSesionVencida={onSesionVencida}
        onCambio={reemplazar}
        onVolver={() => setAbierto(null)}
      />
    );
  }

  const texto = filtro.trim().toLowerCase();
  const visibles = comercios.filter((c) => !texto || c.nombre.toLowerCase().includes(texto) || c.categoria.toLowerCase().includes(texto));
  const activos = comercios.filter((c) => c.activo).length;
  const conOferta = comercios.filter((c) => c.descuentoHoy !== null).length;

  return (
    <div className="ofertas">
      <NuevoComercio token={token} onSesionVencida={onSesionVencida} onCreado={(c) => { reemplazar(c); setAbierto(c.id); }} />

      <section className="tarjeta tarjeta-grafico">
        <header className="grafico-cabecera">
          <div>
            <h2>Comercios afiliados</h2>
            <p>
              {comercios.length} tiendas · {activos} activas · {conOferta} con descuento vigente hoy
            </p>
          </div>
          <input
            className="login-campo campo-buscar"
            type="search"
            placeholder="Buscar tienda o categoría"
            aria-label="Buscar tienda o categoría"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </header>
        <div className="tabla-contenedor">
          <table className="tabla-datos tabla-comercios">
            <thead>
              <tr>
                <th>Tienda</th>
                <th>Categoría</th>
                <th>Hoy se aplica</th>
                <th>Ofertas</th>
                <th>Usuarios</th>
                <th>Estado</th>
                <th>
                  <span className="visualmente-oculto">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => {
                const hoy = c.descuentos.find((d) => d.id === c.descuentoHoy);
                return (
                  <tr key={c.id}>
                    <td className="celda-nombre">{c.nombre}</td>
                    <td>{c.categoria}</td>
                    <td>{hoy ? `${textoValor(hoy)} · ${hoy.descripcion}` : <span className="texto-tenue">Ninguno</span>}</td>
                    <td>{c.descuentos.filter((d) => d.activo).length} activas</td>
                    <td>{c.usuarios.filter((u) => u.activo).length}</td>
                    <td>
                      <span className={`chip ${c.activo ? 'chip-hoy' : 'chip-apagado'}`}>{c.activo ? 'Activa' : 'Inactiva'}</span>
                    </td>
                    <td>
                      <button type="button" className="boton-texto" onClick={() => setAbierto(c.id)}>
                        Gestionar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibles.length === 0 && <p className="grafico-nota">Ninguna tienda coincide con la búsqueda.</p>}
      </section>
    </div>
  );
}

function NuevoComercio({ token, onSesionVencida, onCreado }: { token: string; onSesionVencida: (a: string) => void; onCreado: (c: ComercioPanel) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState(CATEGORIAS[0]!);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (nombre.trim().length < 2) return setError('Escribe el nombre de la tienda.');
    setEnviando(true);
    setError(null);
    try {
      onCreado(await panel.crearComercio({ nombre: nombre.trim(), categoria: categoria.trim(), activo: true }, token));
    } catch (er) {
      if (er instanceof ErrorSesion) onSesionVencida(er.message);
      else setError(er instanceof Error ? er.message : 'No se pudo afiliar la tienda.');
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <div className="acciones-panel">
        <button type="button" className="boton boton-primario" onClick={() => setAbierto(true)}>
          Afiliar tienda
        </button>
      </div>
    );
  }

  return (
    <form className="tarjeta formulario-oferta formulario-suelto" onSubmit={enviar} noValidate>
      <h3>Afiliar tienda</h3>
      <div className="campos-oferta">
        <label className="campo-panel campo-ancho">
          <span className="etiqueta">Nombre</span>
          <input className="login-campo" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </label>
        <label className="campo-panel">
          <span className="etiqueta">Categoría</span>
          <input className="login-campo" list="categorias-actitud" maxLength={40} value={categoria} onChange={(e) => setCategoria(e.target.value)} />
          <datalist id="categorias-actitud">
            {CATEGORIAS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
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
          {enviando ? 'Afiliando…' : 'Afiliar'}
        </button>
      </div>
    </form>
  );
}

interface PropsDetalle {
  comercio: ComercioPanel;
  token: string;
  onSesionVencida: (aviso: string) => void;
  onCambio: (c: ComercioPanel) => void;
  onVolver: () => void;
}

function DetalleComercio({ comercio, token, onSesionVencida, onCambio, onVolver }: PropsDetalle) {
  const [vista, setVista] = useState<'ofertas' | 'metricas'>('ofertas');
  const [aviso, setAviso] = useState<string | null>(null);

  async function accion(promesa: Promise<ComercioPanel>, mensaje: string) {
    setAviso(null);
    try {
      onCambio(await promesa);
      setAviso(mensaje);
      return true;
    } catch (e) {
      if (e instanceof ErrorSesion) onSesionVencida(e.message);
      else setAviso(`⚠ ${e instanceof Error ? e.message : 'No se pudo guardar.'}`);
      return false;
    }
  }

  return (
    <div className="ofertas">
      <div className="detalle-cabecera">
        <button type="button" className="boton boton-secundario-claro" onClick={onVolver}>
          ← Todos los comercios
        </button>
        <h2 className="detalle-titulo">{comercio.nombre}</h2>
        <span className="detalle-categoria">{comercio.categoria}</span>
      </div>

      {aviso && (
        <p className={`aviso-linea ${aviso.startsWith('⚠') ? 'aviso-error' : 'aviso-ok'}`} role="status">
          {aviso.startsWith('⚠') ? <IconoAlerta width={18} height={18} /> : <IconoCheck width={18} height={18} />}
          {aviso.replace(/^⚠ /, '')}
        </p>
      )}

      <section className="tarjeta tarjeta-grafico">
        <header className="grafico-cabecera">
          <div>
            <h2>Tienda</h2>
            <p>{comercio.activo ? 'Activa: aparece en el validador si tiene una oferta vigente hoy.' : 'Inactiva: no aparece en el validador.'}</p>
          </div>
          <button
            type="button"
            className="boton boton-fantasma"
            onClick={() =>
              void accion(
                panel.editarComercio(comercio.id, { nombre: comercio.nombre, categoria: comercio.categoria, activo: !comercio.activo }, token),
                comercio.activo ? 'Tienda desactivada.' : 'Tienda activada.',
              )
            }
          >
            {comercio.activo ? 'Desactivar tienda' : 'Activar tienda'}
          </button>
        </header>
        <UsuariosComercio comercio={comercio} onAccion={accion} token={token} />
      </section>

      <div className="pestanas-panel pestanas-secundarias" role="tablist" aria-label="Vista de la tienda">
        <button type="button" role="tab" className="pestana-panel" aria-selected={vista === 'ofertas'} onClick={() => setVista('ofertas')}>
          Ofertas
        </button>
        <button type="button" role="tab" className="pestana-panel" aria-selected={vista === 'metricas'} onClick={() => setVista('metricas')}>
          Métricas
        </button>
      </div>
      {vista === 'ofertas' ? (
        <OfertasComercio comercioId={comercio.id} token={token} onSesionVencida={onSesionVencida} onCambio={onCambio} />
      ) : (
        <MetricasComercio comercioId={comercio.id} token={token} onSesionVencida={onSesionVencida} />
      )}
    </div>
  );
}

function UsuariosComercio({ comercio, token, onAccion }: { comercio: ComercioPanel; token: string; onAccion: (p: Promise<ComercioPanel>, m: string) => Promise<boolean> }) {
  const [usuario, setUsuario] = useState('');
  const [nombre, setNombre] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(usuario.trim())) return setError('Usuario de 3 a 40 letras, números, punto, guion o guion bajo.');
    if (nombre.trim().length < 2) return setError('Escribe el nombre de la persona o caja.');
    if (contrasena.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    setError(null);
    const ok = await onAccion(
      panel.crearUsuario(comercio.id, { usuario: usuario.trim(), nombre: nombre.trim(), contrasena }, token),
      `Usuario «${usuario.trim().toLowerCase()}» creado. Entrégale la contraseña por un medio seguro.`,
    );
    if (ok) {
      setUsuario('');
      setNombre('');
      setContrasena('');
    }
  }

  function cambiarContrasena(id: number, alias: string) {
    const nueva = window.prompt(`Nueva contraseña para «${alias}» (mínimo 8 caracteres):`);
    if (nueva === null) return;
    if (nueva.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    void onAccion(panel.cambiarUsuario(id, { contrasena: nueva }, token), `Contraseña de «${alias}» cambiada.`);
  }

  return (
    <div className="usuarios-comercio">
      <h3>Usuarios de la tienda</h3>
      {comercio.usuarios.length === 0 ? (
        <p className="grafico-nota">Sin usuarios: crea uno para que la tienda entre a su panel.</p>
      ) : (
        <ul className="lista-usuarios">
          {comercio.usuarios.map((u) => (
            <li key={u.id} className={u.activo ? '' : 'usuario-inactivo'}>
              <span>
                <b>{u.usuario}</b> · {u.nombre}
                {!u.activo && <span className="chip chip-apagado">Desactivado</span>}
              </span>
              <span>
                <button type="button" className="boton-texto" onClick={() => cambiarContrasena(u.id, u.usuario)}>
                  Cambiar contraseña
                </button>
                <button
                  type="button"
                  className="boton-texto"
                  onClick={() => void onAccion(panel.cambiarUsuario(u.id, { activo: !u.activo }, token), u.activo ? 'Usuario desactivado.' : 'Usuario activado.')}
                >
                  {u.activo ? 'Desactivar' : 'Activar'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form className="campos-usuario" onSubmit={crear} noValidate>
        <input className="login-campo" placeholder="usuario" aria-label="Usuario" autoCapitalize="none" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        <input className="login-campo" placeholder="Nombre (p. ej. Caja 1)" aria-label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input
          className="login-campo"
          type="password"
          placeholder="Contraseña (8+)"
          aria-label="Contraseña"
          autoComplete="new-password"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
        />
        <button type="submit" className="boton boton-primario">
          Crear usuario
        </button>
      </form>
      {error && (
        <p className="aviso-linea aviso-error" role="alert">
          <IconoAlerta width={18} height={18} />
          {error}
        </p>
      )}
    </div>
  );
}
