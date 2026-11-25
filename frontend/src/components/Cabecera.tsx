import { textoRol, type Sesion } from '../services/sesion';
import { IconoSalir, IconoSilencio, IconoVolumen } from './Iconos';

export type Conexion = 'demo' | 'en-linea' | 'sin-conexion' | 'comprobando';

const TEXTO_CONEXION: Record<Conexion, string> = {
  demo: 'Demo',
  'en-linea': 'En línea',
  'sin-conexion': 'Sin conexión',
  comprobando: 'Conectando',
};

export type Vista = 'validar' | 'reportes';

interface Props {
  vista: Vista;
  conexion: Conexion;
  sonido: boolean;
  onCambiarSonido: () => void;
  sesion: Sesion | null;
  onSalir: () => void;
}

const iniciales = (nombre: string) =>
  nombre
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

export function Cabecera({ vista, conexion, sonido, onCambiarSonido, sesion, onSalir }: Props) {
  return (
    <header className="cabecera">
      <div className="cabecera-interior">
        <div className="marca">
          <div className="marca-texto">
            <span className="logotipo" aria-label="Con actitUd">
              <span className="logotipo-con" aria-hidden="true">
                CON
              </span>
              <span className="logotipo-nombre" aria-hidden="true">
                actit<span className="marca-u">U</span><span className="marca-d">d</span>
              </span>
            </span>
            <span className="marca-lema">
              Solo para universitarios<span className="solo-escritorio"> · Altaplaza Mall</span>
            </span>
          </div>
        </div>

        <nav className="navegacion" aria-label="Secciones">
          <a href="#/" className="nav-enlace" aria-current={vista === 'validar' ? 'page' : undefined}>
            Validar
          </a>
          <a href="#/reportes" className="nav-enlace" aria-current={vista === 'reportes' ? 'page' : undefined}>
            Panel
          </a>
        </nav>

        <div className="cabecera-acciones">
          {sesion && (
            <span className="sesion-cabecera" title={`${sesion.usuario.nombre} (${sesion.usuario.usuario}) · ${textoRol(sesion.usuario)}${sesion.usuario.comercio ? ` · ${sesion.usuario.comercio}` : ''}`}>
              <span className="sesion-avatar" aria-hidden="true">
                {iniciales(sesion.usuario.nombre)}
              </span>
              <span className="sesion-datos">
                <span className="sesion-quien">{sesion.usuario.nombre}</span>
                <span className="sesion-que">
                  {textoRol(sesion.usuario)}
                  {sesion.usuario.comercio ? ` · ${sesion.usuario.comercio}` : ''}
                </span>
              </span>
              <span className="visualmente-oculto">
                Sesión de {sesion.usuario.nombre}, {textoRol(sesion.usuario)}
              </span>
              <button type="button" className="sesion-salir" onClick={onSalir} aria-label="Cerrar sesión" title="Cerrar sesión">
                <IconoSalir width={18} height={18} />
              </button>
            </span>
          )}
          <span className={`estado-conexion ${conexion}`}>
            <span className="estado-punto" aria-hidden="true" />
            <span className="estado-texto">{TEXTO_CONEXION[conexion]}</span>
          </span>
          <button
            type="button"
            className="boton-icono"
            onClick={onCambiarSonido}
            aria-pressed={sonido}
            aria-label={sonido ? 'Silenciar sonidos' : 'Activar sonidos'}
            title={sonido ? 'Silenciar sonidos' : 'Activar sonidos'}
          >
            {sonido ? <IconoVolumen width={20} height={20} /> : <IconoSilencio width={20} height={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}
