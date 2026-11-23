import { useCallback, useRef, useState } from 'react';
import { AvisoDemo } from './components/AvisoDemo';
import { Bienvenida } from './components/Bienvenida';
import { Cabecera, type Conexion } from './components/Cabecera';
import { EscanerQr } from './components/EscanerQr';
import { FormularioCedula } from './components/FormularioCedula';
import { Historial } from './components/Historial';
import { IconoQr, IconoTeclado } from './components/Iconos';
import { Resultado, type EstadoConsulta } from './components/Resultado';
import { ErrorValidacion, servicioValidacion } from './services/validacion';
import type { Criterio, ResultadoValidacion } from './types';
import { interpretarQr } from './utils/qr';
import { avisar, guardarSonido, sonidoActivado } from './utils/retroalimentacion';

type Modo = 'qr' | 'cedula';

const MAX_HISTORIAL = 20;

export default function App() {
  const [modo, setModo] = useState<Modo>('qr');
  const [estado, setEstado] = useState<EstadoConsulta>({ fase: 'inicial' });
  const [historial, setHistorial] = useState<ResultadoValidacion[]>([]);
  const [cedulaPrecargada, setCedulaPrecargada] = useState('');
  const [sonido, setSonido] = useState(sonidoActivado);
  const [senalCamara, setSenalCamara] = useState(0);
  const [bienvenida, setBienvenida] = useState(true);
  const [conexion, setConexion] = useState<Conexion>(servicioValidacion.modo === 'demo' ? 'demo' : 'comprobando');
  const consultaActual = useRef(0);
  const sonidoRef = useRef(sonido);
  sonidoRef.current = sonido;

  const validar = useCallback(async (criterio: Criterio) => {
    const id = ++consultaActual.current;
    setEstado({ fase: 'cargando', criterio });
    try {
      const resultado = await servicioValidacion.validar(criterio);
      if (id !== consultaActual.current) return;
      setEstado({ fase: 'listo', resultado });
      setHistorial((previo) => [resultado, ...previo].slice(0, MAX_HISTORIAL));
      if (servicioValidacion.modo === 'api') setConexion('en-linea');
      avisar(resultado.titular?.estado === 'ACTIVO' ? 'exito' : 'rechazo', sonidoRef.current);
    } catch (causa) {
      if (id !== consultaActual.current) return;
      setEstado({
        fase: 'error',
        mensaje: causa instanceof Error ? causa.message : 'Ocurrió un error inesperado.',
        tipo: causa instanceof ErrorValidacion ? causa.tipo : 'no-verificado',
        criterio,
      });
      avisar('aviso', sonidoRef.current);
    }
  }, []);

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

  const comprobarConexion = useCallback(async () => {
    if (servicioValidacion.modo === 'demo') return;
    setConexion((await servicioValidacion.comprobarConexion()) ? 'en-linea' : 'sin-conexion');
  }, []);

  const cargando = estado.fase === 'cargando';

  return (
    <div className="app">
      {bienvenida && <Bienvenida tarea={comprobarConexion} onTerminar={() => setBienvenida(false)} />}
      <Cabecera conexion={conexion} sonido={sonido} onCambiarSonido={cambiarSonido} />

      <main className="layout">
        <div className="saludo">
          <h1>Validar estudiante</h1>
          <p>Confirma que el estudiante está matriculado antes de aplicar el descuento.</p>
        </div>

        <div className="columna-principal">
          <section className="tarjeta panel-validacion">
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
                <EscanerQr onDetectado={alDetectarQr} deshabilitado={cargando} senalInicio={senalCamara} />
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
    </div>
  );
}
