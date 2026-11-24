import { useCallback, useState } from 'react';
import { reporteriaDisponible } from '../../services/reportes';
import { cerrarSesion, sesionGuardada, type Sesion } from '../../services/sesion';
import { IconoSalir } from '../Iconos';
import { LoginAdmin } from '../reportes/LoginAdmin';
import { PanelReportes } from '../reportes/PanelReportes';
import { GestionComercios } from './GestionComercios';
import { MetricasComercio } from './MetricasComercio';
import { OfertasComercio } from './OfertasComercio';
import { ReporteValidacion } from './ReporteValidacion';
import '../../reportes.css';
import '../../panel.css';

type PestanaAdmin = 'uso' | 'validacion' | 'comercios';
type PestanaComercio = 'ofertas' | 'metricas';

const PESTANAS_ADMIN: { id: PestanaAdmin; texto: string; descripcion: string }[] = [
  { id: 'uso', texto: 'Uso del programa', descripcion: 'Cómo se usa el programa: horarios, tiendas, facultades y descuentos.' },
  { id: 'validacion', texto: 'Validación', descripcion: 'Tasa de validaciones exitosas y tiempos de respuesta del sistema.' },
  { id: 'comercios', texto: 'Comercios', descripcion: 'Tiendas afiliadas, sus ofertas y sus usuarios.' },
];

const PESTANAS_COMERCIO: { id: PestanaComercio; texto: string; descripcion: string }[] = [
  { id: 'ofertas', texto: 'Mis ofertas', descripcion: 'Publica tus ofertas y configura el descuento que se aplica al validar.' },
  { id: 'metricas', texto: 'Métricas', descripcion: 'Cuántos estudiantes usaron tus descuentos y cuándo.' },
];

/**
 * Panel administrativo. Con rol admin: reportes del programa, reporte de validación y gestión de comercios.
 * Con rol comercio: las ofertas y las métricas de su propia tienda (objetivo 5 del anteproyecto).
 */
export function Panel() {
  const [sesion, setSesion] = useState<Sesion | null>(sesionGuardada);
  const [avisoSesion, setAvisoSesion] = useState<string | null>(null);
  const [pestanaAdmin, setPestanaAdmin] = useState<PestanaAdmin>('uso');
  const [pestanaComercio, setPestanaComercio] = useState<PestanaComercio>('ofertas');

  const salir = useCallback((aviso: string | null = null) => {
    cerrarSesion();
    setSesion(null);
    setAvisoSesion(aviso);
  }, []);
  const sesionVencida = useCallback((aviso: string) => salir(aviso), [salir]);

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
        aviso={avisoSesion}
        onIniciar={(nueva) => {
          setAvisoSesion(null);
          setSesion(nueva);
        }}
      />
    );
  }

  const esAdmin = sesion.usuario.rol === 'admin';
  const pestanas = esAdmin ? PESTANAS_ADMIN : PESTANAS_COMERCIO;
  const activa = esAdmin ? pestanaAdmin : pestanaComercio;
  const descripcion = pestanas.find((p) => p.id === activa)?.descripcion;

  return (
    <div className="panel-reportes">
      <div className="saludo saludo-reportes panel-encabezado">
        <div>
          <h1>{esAdmin ? 'Panel administrativo' : sesion.usuario.comercio ?? 'Mi tienda'}</h1>
          <p>{descripcion}</p>
        </div>
        <span className="sesion-admin">
          <span className="sesion-nombre" title={`Usuario: ${sesion.usuario.usuario}`}>
            {sesion.usuario.nombre}
            {!esAdmin && <span className="sesion-rol"> · Comercio</span>}
          </span>
          <button type="button" className="boton-texto" onClick={() => salir()}>
            <IconoSalir width={16} height={16} /> Cerrar sesión
          </button>
        </span>
      </div>

      <div className="pestanas-panel" role="tablist" aria-label="Secciones del panel">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={activa === p.id}
            className="pestana-panel"
            onClick={() => (esAdmin ? setPestanaAdmin(p.id as PestanaAdmin) : setPestanaComercio(p.id as PestanaComercio))}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {esAdmin && pestanaAdmin === 'uso' && <PanelReportes token={sesion.token} onSesionVencida={sesionVencida} />}
      {esAdmin && pestanaAdmin === 'validacion' && <ReporteValidacion token={sesion.token} onSesionVencida={sesionVencida} />}
      {esAdmin && pestanaAdmin === 'comercios' && <GestionComercios token={sesion.token} onSesionVencida={sesionVencida} />}

      {!esAdmin && sesion.usuario.comercioId && pestanaComercio === 'ofertas' && (
        <OfertasComercio comercioId={sesion.usuario.comercioId} token={sesion.token} onSesionVencida={sesionVencida} />
      )}
      {!esAdmin && sesion.usuario.comercioId && pestanaComercio === 'metricas' && (
        <MetricasComercio comercioId={sesion.usuario.comercioId} token={sesion.token} onSesionVencida={sesionVencida} />
      )}
    </div>
  );
}
