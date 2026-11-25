import { useCallback, useEffect, useRef, useState } from 'react';
import { AvisoDemo } from './components/AvisoDemo';
import { Bienvenida } from './components/Bienvenida';
import { Cabecera, type Conexion, type Vista } from './components/Cabecera';
import { Panel } from './components/panel/Panel';
import { EscanerQr } from './components/EscanerQr';
import { FormularioCedula } from './components/FormularioCedula';
import { Historial } from './components/Historial';
import { IconoCheck, IconoQr, IconoTeclado } from './components/Iconos';
import { OfertasDeHoy } from './components/OfertasDeHoy';
import { LoginAdmin } from './components/reportes/LoginAdmin';
import { Resultado, type EstadoConsulta } from './components/Resultado';
import { SelectorTienda } from './components/SelectorTienda';
import {
  guardarTienda,
  listarComercios,
  tiendaDeValidacion,
  tiendaGuardada,
  tiendasDisponibles,
  type Comercio,
  type TiendaValidacion,
} from './services/comercios';
import { cerrarSesion, ErrorSesion, esCajero, sesionGuardada, textoRol, type Sesion } from './services/sesion';
import { ErrorValidacion, servicioValidacion } from './services/validacion';
import type { Criterio, ResultadoValidacion } from './types';
import { interpretarQr } from './utils/qr';
import { avisar, guardarSonido, sonidoActivado } from './utils/retroalimentacion';

type Modo = 'qr' | 'cedula';

const MAX_HISTORIAL = 20;

const vistaDesdeUrl = (): Vista => (/^#\/(reportes|panel)/.test(window.location.hash) ? 'reportes' : 'validar');

/** Si el personal de una tienda (cajero o administrador) inició sesión, el validador usa su tienda y no se puede cambiar. */
function tiendaDeSesion(sesion: Sesion | null): { id: number; nombre: string } | null {
  return sesion?.usuario.rol === 'comercio' && sesion.usuario.comercioId
    ? {
        id: sesion.usuario.comercioId,
        nombre: sesion.usuario.comercio ?? 'tu tienda',
      }
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
  const [sesion, setSesion] = useState<Sesion | null>(sesionGuardada);
  const [avisoSesion, setAvisoSesion] = useState<string | null>(null);
  const [avisoValidador, setAvisoValidador] = useState<string | null>(null);
  // Con servidor, validar exige sesión: cada validación registra la tienda y el descuento aplicado.
  const requiereSesion = servicioValidacion.modo === 'api';
  const esAdminSesion = sesion?.usuario.rol === 'admin';
  const tiendaSesion = tiendaDeSesion(sesion);
  // Personal de tienda: su tienda. Admin (sin tienda propia): la que elija.
  const tiendaEfectiva = tiendaSesion?.id ?? (esAdminSesion ? tienda : null);
  const [tiendaHoy, setTiendaHoy] = useState<TiendaValidacion | null>(null);
  const [errorTienda, setErrorTienda] = useState<string | null>(null);
  const [intentoTienda, setIntentoTienda] = useState(0);
  const sinOfertaHoy = tiendaHoy !== null && tiendaHoy.aplicada === null;
  const consultaActual = useRef(0);
  const sonidoRef = useRef(sonido);
  sonidoRef.current = sonido;
  // La validación lee la tienda vigente sin recrear los callbacks del escáner.
  const tiendaRef = useRef({
    tienda: tiendaEfectiva,
    requiere: requiereSesion,
    sinOferta: sinOfertaHoy,
  });
  tiendaRef.current = {
    tienda: tiendaEfectiva,
    requiere: requiereSesion,
    sinOferta: sinOfertaHoy,
  };

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

  const validar = useCallback(
    async (criterio: Criterio) => {
      const { tienda: tiendaActual, requiere, sinOferta } = tiendaRef.current;
      if (requiere && sinOferta) {
        setEstado({
          fase: 'error',
          tipo: 'solicitud',
          mensaje: 'Tu tienda no tiene ofertas vigentes hoy: no hay descuento que aplicar.',
        });
        avisar('aviso', sonidoRef.current);
        return;
      }
      if (requiere && !tiendaActual) {
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
        // Sin sesión o vencida: se vuelve a pedir el inicio de sesión.
        if (causa instanceof ErrorSesion) {
          cerrarSesion();
          setSesion(null);
          setAvisoSesion(causa.message);
          setEstado({ fase: 'inicial' });
          avisar('aviso', sonidoRef.current);
          return;
        }
        // La tienda cambió en el servidor (se desactivó o se quedó sin ofertas): se recargan sus datos.
        if (causa instanceof ErrorValidacion && causa.tipo === 'solicitud' && /tienda/i.test(causa.message)) {
          void cargarComercios();
          setIntentoTienda((n) => n + 1);
        }
        setEstado({
          fase: 'error',
          mensaje: causa instanceof Error ? causa.message : 'Ocurrió un error inesperado.',
          tipo: causa instanceof ErrorValidacion ? causa.tipo : 'no-verificado',
          criterio,
        });
        avisar('aviso', sonidoRef.current);
      }
    },
    [cargarComercios],
  );

  const alDetectarQr = useCallback(
    (texto: string) => {
      const criterio = interpretarQr(texto);
      if (!criterio) {
        setEstado({
          fase: 'error',
          tipo: 'solicitud',
          mensaje: 'Ese código QR no es de un carnet UTP.',
        });
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
      setSesion(sesionGuardada());
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

  function iniciar(nueva: Sesion, desde: 'panel' | 'validar' = 'panel') {
    setSesion(nueva);
    setAvisoSesion(null);
    // El cajero solo valida: después de entrar va directo al validador, ya con su tienda.
    if (esCajero(nueva) || desde === 'validar') {
      const { nombre, comercio, rol } = nueva.usuario;
      setAvisoValidador(
        rol === 'admin'
          ? `Sesión iniciada. Hola, ${nombre}: elige la tienda en la que validas.`
          : `Sesión iniciada. Hola, ${nombre}: validas para ${comercio ?? 'tu tienda'} como ${textoRol(nueva.usuario).toLowerCase()}. El descuento se aplica automáticamente.`,
      );
      window.location.hash = '#/';
    }
  }

  const salir = useCallback((aviso: string | null = null) => {
    cerrarSesion();
    setSesion(null);
    setAvisoSesion(aviso);
    setAvisoValidador(null);
  }, []);

  // Ofertas de hoy de la tienda que valida (y cuál se aplicará). Se recargan al volver al validador,
  // por si el administrador de la tienda cambió sus ofertas en el panel.
  const token = sesion?.token;
  useEffect(() => {
    setTiendaHoy(null);
    setErrorTienda(null);
    if (!requiereSesion || !token || !tiendaEfectiva || vista !== 'validar') return;
    const control = new AbortController();
    tiendaDeValidacion(token, esAdminSesion ? tiendaEfectiva : undefined, control.signal)
      .then(setTiendaHoy)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (e instanceof ErrorSesion) return salir(e.message);
        setErrorTienda(e instanceof Error ? e.message : 'error desconocido');
      });
    return () => control.abort();
  }, [requiereSesion, token, tiendaEfectiva, esAdminSesion, vista, intentoTienda, salir]);

  const quienValida = sesion ? `Validando como ${sesion.usuario.nombre} · ${textoRol(sesion.usuario)}` : '';
  const puedeValidar = !requiereSesion || (Boolean(tiendaEfectiva) && tiendaHoy?.aplicada != null);

  return (
    <div className="app">
      {bienvenida && <Bienvenida tarea={comprobarConexion} onTerminar={() => setBienvenida(false)} />}
      <Cabecera vista={vista} conexion={conexion} sonido={sonido} onCambiarSonido={cambiarSonido} sesion={sesion} onSalir={() => salir()} />

      {vista === 'reportes' ? (
        <main className="layout">
          <Panel sesion={sesion} aviso={avisoSesion} onIniciar={iniciar} onSalir={salir} />
        </main>
      ) : (
        <main className="layout">
          <div className="saludo">
            <h1>Validar estudiante</h1>
            <p>Confirma que el estudiante está matriculado antes de aplicar el descuento.</p>
          </div>
          {avisoValidador && (
            <div className="bienvenida-sesion" role="status">
              <IconoCheck width={20} height={20} />
              <span>{avisoValidador}</span>
              <button type="button" className="boton-texto" onClick={() => setAvisoValidador(null)}>
                Entendido
              </button>
            </div>
          )}

          {requiereSesion && !sesion ? (
            <div className="columna-principal columna-login">
              <LoginAdmin
                titulo="Inicia sesión para validar"
                texto="Cada validación registra la tienda y el descuento aplicado. Entra con el usuario de tu tienda."
                aviso={avisoSesion}
                onIniciar={(nueva) => iniciar(nueva, 'validar')}
              />
            </div>
          ) : (
            <>
              <div className="columna-principal">
                <section className="tarjeta panel-validacion">
                  {requiereSesion && esAdminSesion && (
                    <SelectorTienda comercios={comercios} seleccion={tienda} onElegir={elegirTienda} falta={faltaTienda} />
                  )}
                  {requiereSesion && tiendaEfectiva && (
                    <OfertasDeHoy
                      tienda={tiendaHoy}
                      quien={quienValida}
                      error={errorTienda}
                      onReintentar={() => setIntentoTienda((n) => n + 1)}
                    />
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
                      <EscanerQr onDetectado={alDetectarQr} deshabilitado={cargando || !puedeValidar} senalInicio={senalCamara} />
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
            </>
          )}
        </main>
      )}
    </div>
  );
}
