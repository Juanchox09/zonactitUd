import { IconoSilencio, IconoVolumen } from './Iconos';

export type Conexion = 'demo' | 'en-linea' | 'sin-conexion' | 'comprobando';

const TEXTO_CONEXION: Record<Conexion, string> = {
  demo: 'Demo',
  'en-linea': 'En línea',
  'sin-conexion': 'Sin conexión',
  comprobando: 'Conectando',
};

interface Props {
  conexion: Conexion;
  sonido: boolean;
  onCambiarSonido: () => void;
}

export function Cabecera({ conexion, sonido, onCambiarSonido }: Props) {
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

        <div className="cabecera-acciones">
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
