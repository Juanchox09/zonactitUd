import { useEffect, useState } from 'react';

interface Props {
  /** Tarea a esperar mientras se muestra la animación (p. ej. comprobar la conexión). */
  tarea: () => Promise<unknown>;
  onTerminar: () => void;
}

/** Duración mínima para que la animación del logo se vea completa. */
const MINIMO_MS = 3000;
/** Si la tarea tarda más, se entra igual: la app avisa en la cabecera si no hay conexión. */
const MAXIMO_MS = 6000;
const SALIDA_MS = 450;

export function Bienvenida({ tarea, onTerminar }: Props) {
  const [saliendo, setSaliendo] = useState(false);
  const [mensaje, setMensaje] = useState('Preparando el validador…');

  useEffect(() => {
    let vigente = true;
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const minimo = new Promise((r) => setTimeout(r, reducido ? 500 : MINIMO_MS));
    const maximo = new Promise((r) => setTimeout(r, MAXIMO_MS));
    const temporizador = setTimeout(() => vigente && setMensaje('Conectando con el sistema de la UTP…'), 700);

    void Promise.race([Promise.all([minimo, tarea().catch(() => undefined)]), maximo]).then(() => {
      if (!vigente) return;
      setSaliendo(true);
      setTimeout(() => vigente && onTerminar(), SALIDA_MS);
    });

    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
    // Solo al montar: la bienvenida se muestra una vez por carga de la página.
  }, []);

  return (
    <div className={`bienvenida${saliendo ? ' saliendo' : ''}`} role="status" aria-live="polite" aria-label="Cargando ActitUd">
      <span className="bienvenida-franja franja-rosa" aria-hidden="true" />
      <span className="bienvenida-franja franja-lima" aria-hidden="true" />

      <div className="bienvenida-centro">
        <div className="bienvenida-logo" aria-hidden="true">
          <span className="bienvenida-con">CON</span>
          <span className="bienvenida-nombre">
            {'actit'.split('').map((letra, i) => (
              <span key={i} className="letra" style={{ animationDelay: `${0.35 + i * 0.06}s` }}>
                {letra}
              </span>
            ))}
            <span className="letra letra-u">U</span>
            <span className="letra letra-d" style={{ animationDelay: '0.8s' }}>
              d
            </span>
          </span>
        </div>
        <p className="bienvenida-lema">Solo para universitarios</p>

        <div className="bienvenida-barra" aria-hidden="true">
          <span />
        </div>
        <p className="bienvenida-mensaje">{mensaje}</p>
      </div>

      <p className="bienvenida-pie">Altaplaza Mall · Universidad Tecnológica de Panamá</p>
    </div>
  );
}
