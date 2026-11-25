import { useState } from 'react';
import { reporteriaDisponible } from '../../services/reportes';
import { esCajero, textoRol, type Sesion } from '../../services/sesion';
import { IconoCheck, IconoQr, IconoSalir } from '../Iconos';
import { LoginAdmin } from '../reportes/LoginAdmin';
import { PanelReportes } from '../reportes/PanelReportes';
import { GestionComercios } from './GestionComercios';
import { GestionUsuarios } from './GestionUsuarios';
import { MetricasComercio } from './MetricasComercio';
import { OfertasComercio } from './OfertasComercio';
import { ReporteValidacion } from './ReporteValidacion';
import '../../reportes.css';
import '../../panel.css';

type PestanaAdmin = 'uso' | 'validacion' | 'comercios' | 'usuarios';
type PestanaComercio = 'ofertas' | 'metricas' | 'equipo';

const PESTANAS_ADMIN: { id: PestanaAdmin; texto: string; descripcion: string }[] = [
  { id: 'uso', texto: 'Uso del programa', descripcion: 'Cómo se usa el programa: horarios, tiendas, facultades y descuentos.' },
  { id: 'validacion', texto: 'Validación', descripcion: 'Tasa de validaciones exitosas y tiempos de respuesta del sistema.' },
  { id: 'comercios', texto: 'Comercios', descripcion: 'Tiendas afiliadas, sus ofertas y sus usuarios.' },
  { id: 'usuarios', texto: 'Usuarios', descripcion: 'Quién entra al sistema y con qué permiso: administradores de tienda y cajeros.' },
];

const PESTANAS_COMERCIO: { id: PestanaComercio; texto: string; descripcion: string }[] = [
  { id: 'ofertas', texto: 'Mis ofertas', descripcion: 'Publica tus ofertas y configura el descuento que se aplica al validar.' },
  { id: 'metricas', texto: 'Métricas', descripcion: 'Cuántos estudiantes usaron tus descuentos y cuándo.' },
  { id: 'equipo', texto: 'Equipo', descripcion: 'Los cajeros de tu tienda: solo validan carnets, no entran al panel.' },
];

interface Props {
  sesion: Sesion | null;
  /** Motivo por el que se volvió a pedir la sesión (p. ej. venció). */
  aviso: string | null;
  onIniciar: (sesion: Sesion) => void;
  onSalir: (aviso?: string | null) => void;
}

/**
 * Panel administrativo (objetivo 5 del anteproyecto). Lo que muestra depende del usuario:
 * - Administración de ActitUd: reportes del programa, reporte de validación, comercios y usuarios.
 * - Administrador de tienda: ofertas, métricas y cajeros de su tienda.
 * - Cajero: no entra al panel; su sesión solo fija la tienda en el validador.
 */
export function Panel({ sesion, aviso, onIniciar, onSalir }: Props) {
  const [pestanaAdmin, setPestanaAdmin] = useState<PestanaAdmin>('uso');
  const [pestanaComercio, setPestanaComercio] = useState<PestanaComercio>('ofertas');
  // Confirmación visible justo después de iniciar sesión.
  const [recienEntrado, setRecienEntrado] = useState(false);
  const sesionVencida = onSalir;

  if (!reporteriaDisponible) {
    return (
      <div className="panel-vacio tarjeta">
        <h2>El panel necesita el servidor</h2>
        <p>
          Configura <code>VITE_API_URL=/api</code> en <code>frontend/.env</code>, levanta <code>docker compose up</code> y carga
          datos de ejemplo con <code>docker compose exec api python -m scripts.sembrar_reporteria</code>.
        </p>
      </div>
    );
  }

  if (!sesion) {
    return (
      <LoginAdmin
        aviso={aviso}
        onIniciar={(nueva) => {
          setRecienEntrado(true);
          onIniciar(nueva);
        }}
      />
    );
  }

  const { usuario } = sesion;

  if (esCajero(sesion)) {
    return (
      <section className="tarjeta sesion-caja" aria-labelledby="caja-titulo">
        <div className="login-icono" aria-hidden="true">
          <IconoQr width={26} height={26} />
        </div>
        <h1 id="caja-titulo">Sesión de caja</h1>
        <p>
          Entraste como <b>{usuario.nombre}</b>, cajero de <b>{usuario.comercio ?? 'tu tienda'}</b>. Tu usuario solo valida carnets: las
          ofertas, las métricas y los usuarios los gestiona el administrador de la tienda.
        </p>
        <div className="sesion-caja-acciones">
          <a href="#/" className="boton boton-primario boton-grande">
            <IconoQr width={20} height={20} /> Ir a validar
          </a>
          <button type="button" className="boton boton-fantasma" onClick={() => onSalir()}>
            <IconoSalir width={18} height={18} /> Cerrar sesión
          </button>
        </div>
      </section>
    );
  }

  const esAdmin = usuario.rol === 'admin';
  const pestanas = esAdmin ? PESTANAS_ADMIN : PESTANAS_COMERCIO;
  const activa = esAdmin ? pestanaAdmin : pestanaComercio;
  const descripcion = pestanas.find((p) => p.id === activa)?.descripcion;
  const comercioId = usuario.comercioId ?? null;

  return (
    <div className="panel-reportes">

      <div className="saludo saludo-reportes panel-encabezado">
        <div>
          <h1>{esAdmin ? 'Panel administrativo' : usuario.comercio ?? 'Mi tienda'}</h1>
          <p>{descripcion}</p>
        </div>
      </div>

      <div className="pestanas-panel" role="tablist" aria-label="Secciones del panel">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={activa === p.id}
            className="pestana-panel"
            onClick={() => {
              setRecienEntrado(false);
              if (esAdmin) setPestanaAdmin(p.id as PestanaAdmin);
              else setPestanaComercio(p.id as PestanaComercio);
            }}
          >
            {p.texto}
          </button>
        ))}
      </div>
      {recienEntrado && (
        <div className="bienvenida-sesion" role="status">
          <IconoCheck width={20} height={20} />
          <span>
            <b>Sesión iniciada.</b> Hola, {usuario.nombre}:{' '}
            {esAdmin ? 'entraste a la administración de ActitUd.' : `entraste como ${textoRol(usuario).toLowerCase()} de ${usuario.comercio ?? 'tu tienda'}.`}
          </span>
          <button type="button" className="boton-texto" onClick={() => setRecienEntrado(false)} aria-label="Cerrar aviso">
            Entendido
          </button>
        </div>
      )}

      {esAdmin && pestanaAdmin === 'uso' && <PanelReportes token={sesion.token} onSesionVencida={sesionVencida} />}
      {esAdmin && pestanaAdmin === 'validacion' && <ReporteValidacion token={sesion.token} onSesionVencida={sesionVencida} />}
      {esAdmin && pestanaAdmin === 'comercios' && <GestionComercios token={sesion.token} onSesionVencida={sesionVencida} />}
      {esAdmin && pestanaAdmin === 'usuarios' && (
        <GestionUsuarios esAdmin token={sesion.token} onSesionVencida={sesionVencida} usuarioActual={usuario.usuario} />
      )}

      {!esAdmin && comercioId && pestanaComercio === 'ofertas' && (
        <OfertasComercio comercioId={comercioId} token={sesion.token} onSesionVencida={sesionVencida} />
      )}
      {!esAdmin && comercioId && pestanaComercio === 'metricas' && (
        <MetricasComercio comercioId={comercioId} token={sesion.token} onSesionVencida={sesionVencida} />
      )}
      {!esAdmin && comercioId && pestanaComercio === 'equipo' && (
        <GestionUsuarios esAdmin={false} comercioId={comercioId} token={sesion.token} onSesionVencida={sesionVencida} usuarioActual={usuario.usuario} />
      )}
    </div>
  );
}
