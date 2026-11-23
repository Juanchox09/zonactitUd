import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { IconoAlerta, IconoImagen, IconoQr, IconoX } from './Iconos';

const REGION_CAMARA = 'qr-region-camara';
const REGION_ARCHIVO = 'qr-region-archivo';
const CONFIGURACION = { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] };

interface Props {
  onDetectado: (texto: string) => void;
  deshabilitado?: boolean;
  /** Cada vez que cambia, se enciende la cámara (p. ej. al tocar "Escanear siguiente"). */
  senalInicio?: number;
}

export function EscanerQr({ onDetectado, deshabilitado, senalInicio = 0 }: Props) {
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onDetectadoRef = useRef(onDetectado);

  useEffect(() => {
    onDetectadoRef.current = onDetectado;
  }, [onDetectado]);

  useEffect(() => {
    if (senalInicio > 0) {
      setError(null);
      setCamaraActiva(true);
    }
  }, [senalInicio]);

  useEffect(() => {
    if (!camaraActiva) return;

    const lector = new Html5Qrcode(REGION_CAMARA, CONFIGURACION);
    let terminado = false;

    // Sin qrbox: se analiza todo el cuadro, así el QR se lee aunque no esté perfectamente centrado.
    const inicio = lector.start(
      { facingMode: 'environment' },
      { fps: 12, aspectRatio: 1 },
      (texto) => {
        if (terminado) return;
        terminado = true;
        setCamaraActiva(false);
        onDetectadoRef.current(texto);
      },
      () => {},
    );

    inicio.catch((causa) => {
      if (terminado) return;
      setError(describirErrorCamara(causa));
      setCamaraActiva(false);
    });

    return () => {
      terminado = true;
      inicio
        .then(() => lector.stop())
        .then(() => lector.clear())
        .catch(() => {});
    };
  }, [camaraActiva]);

  async function escanearImagen(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;

    setError(null);
    setCamaraActiva(false);
    const lector = new Html5Qrcode(REGION_ARCHIVO, CONFIGURACION);
    try {
      onDetectado(await lector.scanFile(archivo, false));
    } catch {
      setError('No se encontró un código QR legible en la foto. Intenta con una imagen más nítida.');
    } finally {
      lector.clear();
    }
  }

  function encender() {
    setError(null);
    setCamaraActiva(true);
  }

  return (
    <div className="escaner">
      <div className={`visor${camaraActiva ? ' visor-activo' : ''}`}>
        <div id={REGION_CAMARA} className="visor-video" hidden={!camaraActiva} />

        {camaraActiva ? (
          <>
            <div className="visor-marco" aria-hidden="true">
              <span className="esquina sup-izq" />
              <span className="esquina sup-der" />
              <span className="esquina inf-izq" />
              <span className="esquina inf-der" />
              <span className="laser" />
            </div>
            <p className="visor-instruccion">Centra el QR del carnet en el recuadro</p>
            <button
              type="button"
              className="visor-cerrar"
              onClick={() => setCamaraActiva(false)}
              aria-label="Detener cámara"
            >
              <IconoX width={20} height={20} />
            </button>
          </>
        ) : (
          <button type="button" className="visor-inicio" onClick={encender} disabled={deshabilitado}>
            <span className="visor-icono">
              <IconoQr width={44} height={44} />
            </span>
            <span className="visor-titulo">Escanear carnet</span>
            <span className="visor-texto">Toca aquí para abrir la cámara</span>
          </button>
        )}
      </div>
      <div id={REGION_ARCHIVO} hidden />

      {error && (
        <p className="aviso-linea aviso-error" role="alert">
          <IconoAlerta width={18} height={18} />
          {error}
        </p>
      )}

      <label className={`boton boton-fantasma boton-ancho${deshabilitado ? ' deshabilitado' : ''}`}>
        <IconoImagen width={20} height={20} />
        Subir foto del QR
        <input
          type="file"
          accept="image/*"
          className="visualmente-oculto"
          disabled={deshabilitado}
          onChange={escanearImagen}
        />
      </label>
    </div>
  );
}

function describirErrorCamara(causa: unknown): string {
  const texto = String(causa);
  if (/NotAllowed|Permission/i.test(texto)) {
    return 'Se denegó el permiso de la cámara. Habilítalo en el navegador o sube una foto del QR.';
  }
  if (/NotFound|Requested device not found/i.test(texto)) {
    return 'Este equipo no tiene cámara. Sube una foto del QR o valida con la cédula.';
  }
  if (/NotReadable|Could not start/i.test(texto)) {
    return 'La cámara está siendo usada por otra aplicación.';
  }
  if (!window.isSecureContext) {
    return 'La cámara solo funciona con HTTPS o en localhost.';
  }
  return 'No se pudo abrir la cámara. Intenta de nuevo o sube una foto del QR.';
}
