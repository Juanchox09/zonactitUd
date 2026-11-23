import { CEDULA_DEMO_SIN_SERVICIO, TITULARES_DEMO } from '../services/validacion';

export function AvisoDemo({ onProbar }: { onProbar: (cedula: string) => void }) {
  const ejemplos = [
    ...TITULARES_DEMO.map((t) => ({ cedula: t.cedula, estado: t.estado === 'ACTIVO' ? 'activo' : 'inactivo' })),
    { cedula: '8-999-999', estado: 'no-registrado' },
    { cedula: CEDULA_DEMO_SIN_SERVICIO, estado: 'aviso' },
  ];

  return (
    <aside className="aviso-demo">
      <p>
        <b>Modo demostración.</b> Datos ficticios, sin conexión al servidor. Prueba un caso:
      </p>
      <div className="ejemplos">
        {ejemplos.map((e) => (
          <button key={e.cedula} type="button" className="ejemplo" onClick={() => onProbar(e.cedula)}>
            <span className={`punto punto-${e.estado}`} aria-hidden="true" />
            {e.cedula}
          </button>
        ))}
      </div>
    </aside>
  );
}
