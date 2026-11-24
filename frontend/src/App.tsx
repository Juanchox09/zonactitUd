import { useCallback, useEffect, useRef, useState } from 'react';
import { AvisoDemo } from './components/AvisoDemo';
import { Bienvenida } from './components/Bienvenida';
import { Cabecera, type Conexion, type Vista } from './components/Cabecera';
import { Panel } from './components/panel/Panel';
import { EscanerQr } from './components/EscanerQr';
import { FormularioCedula } from './components/FormularioCedula';
import { Historial } from './components/Historial';
import { IconoQr, IconoTeclado } from './components/Iconos';
import { Resultado, type EstadoConsulta } from './components/Resultado';
import { SelectorTienda } from './components/SelectorTienda';
import { guardarTienda, listarComercios, tiendaGuardada, tiendasDisponibles, type Comercio } from './services/comercios';
import { sesionGuardada } from './services/sesion';
import { ErrorValidacion, servicioValidacion } from './services/validacion';
import type { Criterio, ResultadoValidacion } from './types';
import { interpretarQr } from './utils/qr';
import { avisar, guardarSonido, sonidoActivado } from './utils/retroalimentacion';

type Modo = 'qr' | 'cedula';

const MAX_HISTORIAL = 20;

const vistaDesdeUrl = (): Vista => (/^#\/(reportes|panel)/.test(window.location.hash) ? 'reportes' : 'validar');

/** Si el personal de una tienda inició sesión en el panel, el validador usa su tienda y no se puede cambiar. */
function tiendaDeSesion(): { id: number; nombre: string } | null {
  const sesion = sesionGuardada();
  return sesion?.usuario.rol === 'comercio' && sesion.usuario.comercioId
    ? { id: sesion.usuario.comercioId, nombre: sesion.usuario.comercio ?? 'tu tienda' }
    : null;
}

export default function App() {
  const [modo, setModo] = useState<Modo>('qr');
  const [estado, setEstado] = useState<EstadoConsulta>({ fase: 'inicial' });
  const [historial, setHistorial] = useState<ResultadoValidacion[]>([]);
  const [cedulaPrecargada, setCedulaPrecargada] = useState('');
  const [sonido, setSonido] = useState(sonidoActivado);
  const [senalCamara, setSenalCamara] = useState(0);
  const [bienvenida, setBienvenida] = useState(true);
  const [vista, setVista] = useState<Vista>(vistaDesdeUrl);
  const [conexion, setConexion] = useState<Conexion>(servicioValidacion.modo === 'demo' ? 'demo' : 'comprobando');
  const [comercios, setComercios] = useState<Comercio[]>([]);
  const [tienda, setTienda] = useState<number | null>(tiendaGuardada);
  const [faltaTienda, setFaltaTienda] = useState(false);
  const [tiendaSesion, setTiendaSesion] = useState(tiendaDeSesion);
  const tiendaEfectiva = tiendaSesion?.id ?? tienda;
  const consultaActual = useRef(0);
  const sonidoRef = useRef(sonido);
  sonidoRef.current = sonido;
  // La validación lee la tienda y la lista vigentes sin recrear los callbacks del escáner.
  const tiendaRef = useRef({ tienda, hayTiendas: false });
  tiendaRef.current = { tienda: tiendaEfectiva, hayTiendas: comercios.length > 0 };

  const cargarComercios = useCallback(async () => {
    if (!tiendasDisponibles) return;
    try {
      const lista = await listarComercios();
      setComercios(lista);
      // La tienda recordada pudo dejar de existir (p. ej. al recargar los datos simulados).
      setTienda((actual) => {
        if (actual && !lista.some((c) => c.id === actual)) {
          guardarTienda(null);
          return null;
        }
        return actual;
      });
    } catch {
      /* sin lista de tiendas se valida igual, pero sin registrar descuento */
    }
  }, []);

  function elegirTienda(id: number | null) {
    setTienda(id);
    guardarTienda(id);
    if (id) setFaltaTienda(false);
  }

  const validar = useCallback(async (criterio: Criterio) => {
    const { tienda: tiendaActual, hayTiendas } = tiendaRef.current;
    if (hayTiendas && !tiendaActual) {
      setFaltaTienda(true);
      setEstado({ fase: 'inicial' });
      const selector = document.getElementById('tienda');
      selector?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      selector?.focus({ preventScroll: true });
      avisar('aviso', sonidoRef.current);
      return;
    }
    const id = ++consultaActual.current;
    setEstado({ fase: 'cargando', criterio });
    try {
      const resultado = await servicioValidacion.validar(criterio, tiendaActual ?? undefined);
      if (id !== consultaActual.current) return;
      setEstado({ fase: 'listo', resultado });
      setHistorial((previo) => [resultado, ...previo].slice(0, MAX_HISTORIAL));
      if (servicioValidacion.modo === 'api') setConexion('en-linea');
      avisar(resultado.titular?.estado === 'ACTIVO' ? 'exito' : 'rechazo', sonidoRef.current);
    } catch (causa) {
      if (id !== consultaActual.current) return;
      // La tienda elegida ya no existe en el servidor: se vuelve a pedir.
      if (causa instanceof ErrorValidacion && causa.tipo === 'solicitud' && /tienda/i.test(causa.message)) void cargarComercios();
      setEstado({
        fase: 'error',
        mensaje: causa instanceof Error ? causa.message : 'Ocurrió un error inesperado.',
        tipo: causa instanceof ErrorValidacion ? causa.tipo : 'no-verificado',
        criterio,
      });
      avisar('aviso', sonidoRef.current);
    }
  }, [cargarComercios]);

  const alDetectarQr = useCallback(
    (texto: string) => {
      const criterio = interpretarQr(texto);
      if (!criterio) {
        setEstado({ fase: 'error', tipo: 'solicitud', mensaje: 'Ese código QR no es de un carnet UTP.' });
        avisar('aviso', sonidoRef.current);
        return;
      }
      void validar(criterio);
    },
    [validar],
  );

  const cerrar = useCallback(() => {
    consultaActual.current++; // descarta una consulta en curso
    setEstado({ fase: 'inicial' });
  }, []);

  function siguiente() {
    cerrar();
    if (modo === 'qr') setSenalCamara((n) => n + 1);
    else setCedulaPrecargada(`nueva-${Date.now()}`);
  }

  function reintentar() {
    if (estado.fase === 'error' && estado.criterio) void validar(estado.criterio);
    else cerrar();
  }

  function probarDemo(cedula: string) {
    setModo('cedula');
    setCedulaPrecargada(cedula);
    void validar({ tipo: 'cedula', valor: cedula });
  }

  function cambiarSonido() {
    setSonido((actual) => {
      guardarSonido(!actual);
      return !actual;
    });
  }

  useEffect(() => {
    const alCambiar = () => {
      setVista(vistaDesdeUrl());
      setTiendaSesion(tiendaDeSesion());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  const comprobarConexion = useCallback(async () => {
    if (servicioValidacion.modo === 'demo') return;
    const enLinea = await servicioValidacion.comprobarConexion();
    setConexion(enLinea ? 'en-linea' : 'sin-conexion');
    if (enLinea) await cargarComercios();
  }, [cargarComercios]);

  const cargando = estado.fase === 'cargando';

  return (
    <div className="app">
      {bienvenida && <Bienvenida tarea={comprobarConexion} onTerminar={() => setBienvenida(false)} />}
      <Cabecera vista={vista} conexion={conexion} sonido={sonido} onCambiarSonido={cambiarSonido} />

      {vista === 'reportes' ? (
        <main className="layout">
          <Panel />
        </main>
      ) : (
        <main className="layout">
          <div className="saludo">
            <h1>Validar estudiante</h1>
            <p>Confirma que el estudiante está matriculado antes de aplicar el descuento.</p>
          </div>
  
          <div className="columna-principal">
            <section className="tarjeta panel-validacion">
              {comercios.length > 0 && tiendaSesion && (
                <p className="tienda-fija">
                  Validando para <b>{tiendaSesion.nombre}</b> (sesión de la tienda)
                </p>
              )}
              {comercios.length > 0 && !tiendaSesion && (
                <SelectorTienda comercios={comercios} seleccion={tienda} onElegir={elegirTienda} falta={faltaTienda} />
              )}
              <div className="segmentado" role="tablist" aria-label="Método de validación">
                <button
                  type="button"
                  role="tab"
                  id="pestana-qr"
                  aria-selected={modo === 'qr'}
                  aria-controls="panel-qr"
                  className="segmento"
                  onClick={() => setModo('qr')}
                >
                  <IconoQr width={18} height={18} />
                  Escanear QR
                </button>
                <button
                  type="button"
                  role="tab"
                  id="pestana-cedula"
                  aria-selected={modo === 'cedula'}
                  aria-controls="panel-cedula"
                  className="segmento"
                  onClick={() => setModo('cedula')}
                >
                  <IconoTeclado width={18} height={18} />
                  Escribir cédula
                </button>
                <span className={`segmento-indicador ${modo}`} aria-hidden="true" />
              </div>
  
              {modo === 'qr' ? (
                <div role="tabpanel" id="panel-qr" aria-labelledby="pestana-qr">
                  <EscanerQr onDetectado={alDetectarQr} deshabilitado={cargando || (comercios.length > 0 && !tiendaEfectiva)} senalInicio={senalCamara} />
                </div>
              ) : (
                <div role="tabpanel" id="panel-cedula" aria-labelledby="pestana-cedula">
                  <FormularioCedula
                    key={cedulaPrecargada}
                    valorInicial={cedulaPrecargada.startsWith('nueva-') ? '' : cedulaPrecargada}
                    cargando={cargando}
                    onValidar={(cedula) => void validar({ tipo: 'cedula', valor: cedula })}
                  />
                </div>
              )}
            </section>
  
            {servicioValidacion.modo === 'demo' && <AvisoDemo onProbar={probarDemo} />}
          </div>
  
          <div className="columna-lateral">
            <Resultado
              estado={estado}
              textoSiguiente={modo === 'qr' ? 'Escanear siguiente' : 'Validar otra cédula'}
              onSiguiente={siguiente}
              onCerrar={cerrar}
              onReintentar={reintentar}
            />
            <Historial items={historial} onSeleccionar={(resultado) => setEstado({ fase: 'listo', resultado })} />
          </div>
        </main>
      )}
    </div>
  );
}
