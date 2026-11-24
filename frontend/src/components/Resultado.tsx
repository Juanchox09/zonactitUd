import { useEffect, useRef, type ReactNode } from 'react';
import type { TipoError } from '../services/validacion';
import type { Criterio, DescuentoAplicado, ResultadoValidacion, Titular } from '../types';
import { formatearHora, formatearPeriodo } from '../utils/formato';
import { iniciales } from '../utils/retroalimentacion';
import {
  IconoAlerta,
  IconoBirrete,
  IconoCalendario,
  IconoCheck,
  IconoEscudo,
  IconoEtiqueta,
  IconoPregunta,
  IconoReintentar,
  IconoUbicacion,
  IconoX,
} from './Iconos';

export type EstadoConsulta =
  | { fase: 'inicial' }
  | { fase: 'cargando'; criterio: Criterio }
  | { fase: 'listo'; resultado: ResultadoValidacion }
  | { fase: 'error'; mensaje: string; tipo: TipoError; criterio?: Criterio };

export function describirCriterio({ tipo, valor }: Criterio): string {
  if (tipo === 'qr') return 'QR del carnet';
  return `${tipo === 'cedula' ? 'Cédula' : 'Carnet'} ${valor}`;
}

type Variante = 'activo' | 'inactivo' | 'no-encontrado' | 'aviso';

interface Props {
  estado: EstadoConsulta;
  /** Texto del botón principal tras un resultado: "Escanear siguiente" o "Validar otra cédula". */
  textoSiguiente: string;
  onSiguiente: () => void;
  onCerrar: () => void;
  onReintentar: () => void;
}

export function Resultado({ estado, textoSiguiente, onSiguiente, onCerrar, onReintentar }: Props) {
  const botonPrincipal = useRef<HTMLButtonElement>(null);
  const abierto = estado.fase !== 'inicial';

  useEffect(() => {
    if (estado.fase === 'listo' || estado.fase === 'error') botonPrincipal.current?.focus({ preventScroll: true });
  }, [estado]);

  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierto, onCerrar]);

  return (
    <>
      <div className={`hoja-fondo${abierto ? ' visible' : ''}`} onClick={onCerrar} aria-hidden="true" />
      <section
        className={`resultado fase-${estado.fase}`}
        aria-live="polite"
        aria-busy={estado.fase === 'cargando'}
        aria-label="Resultado de la validación"
      >
        {estado.fase === 'inicial' && <Indicaciones />}
        {estado.fase === 'cargando' && <Cargando />}
        {estado.fase === 'error' && (
          <Tarjeta
            variante="aviso"
            icono={<IconoAlerta />}
            etiqueta={estado.tipo === 'solicitud' ? 'Revisa el código' : 'Sin respuesta'}
            titulo={TITULOS_ERROR[estado.tipo]}
            texto={estado.mensaje}
            nota={NOTAS_ERROR[estado.tipo]}
            acciones={
              estado.tipo === 'solicitud' ? (
                <button ref={botonPrincipal} type="button" className="boton boton-primario boton-grande boton-ancho" onClick={onSiguiente}>
                  {textoSiguiente}
                </button>
              ) : (
                <>
                  <button ref={botonPrincipal} type="button" className="boton boton-primario boton-grande boton-ancho" onClick={onReintentar}>
                    <IconoReintentar width={20} height={20} />
                    Reintentar
                  </button>
                  <button type="button" className="boton boton-fantasma boton-ancho" onClick={onCerrar}>
                    Cancelar
                  </button>
                </>
              )
            }
          />
        )}
        {estado.fase === 'listo' && (
          <TarjetaResultado
            resultado={estado.resultado}
            acciones={
              <>
                <button ref={botonPrincipal} type="button" className="boton boton-primario boton-grande boton-ancho" onClick={onSiguiente}>
                  {textoSiguiente}
                </button>
                <button type="button" className="boton boton-fantasma boton-ancho solo-movil" onClick={onCerrar}>
                  Cerrar
                </button>
              </>
            }
          />
        )}
      </section>
    </>
  );
}

const TITULOS_ERROR: Record<TipoError, string> = {
  'no-verificado': 'No se pudo verificar',
  limite: 'Espera un momento',
  solicitud: 'Código no válido',
};

const NOTAS_ERROR: Record<TipoError, string> = {
  'no-verificado': 'Esto no significa que el estudiante esté inactivo. Reintenta en unos segundos.',
  limite: 'Se hicieron muchas consultas seguidas desde este equipo.',
  solicitud: 'Pide al estudiante el QR de su carnet UTP, o valida con su cédula.',
};

function TarjetaResultado({ resultado, acciones }: { resultado: ResultadoValidacion; acciones: ReactNode }) {
  const { titular, consultadoEn } = resultado;

  if (!titular) {
    return (
      <Tarjeta
        variante="no-encontrado"
        icono={<IconoPregunta />}
        etiqueta="Sin registro"
        titulo="Estudiante no encontrado"
        texto="No aparece en el sistema de matrícula de la UTP."
        nota="No apliques el descuento."
        pie={`Consultado a las ${formatearHora(consultadoEn)}`}
        acciones={acciones}
      />
    );
  }

  const activo = titular.estado === 'ACTIVO';
  const descuento = activo ? titular.descuento : undefined;
  return (
    <Tarjeta
      variante={activo ? 'activo' : 'inactivo'}
      icono={activo ? <IconoCheck /> : <IconoX />}
      etiqueta={activo ? 'Verificado' : 'No elegible'}
      titulo={activo ? 'Estudiante activo' : 'Estudiante inactivo'}
      texto={
        descuento
          ? 'Aplica el descuento de tu tienda.'
          : activo
            ? 'Puede recibir el descuento ActitUd.'
            : `${titular.motivo ?? 'Sin matrícula vigente'}. No apliques el descuento.`
      }
      sello={
        <span className="sello-utp">
          <IconoEscudo width={16} height={16} />
          {titular.fuente === 'utp' ? 'Verificado por la UTP' : 'Registro local'} · {formatearHora(consultadoEn)}
        </span>
      }
      acciones={acciones}
    >
      {descuento && <BloqueDescuento descuento={descuento} />}
      <FichaEstudiante titular={titular} />
    </Tarjeta>
  );
}

function BloqueDescuento({ descuento }: { descuento: DescuentoAplicado }) {
  const valor = descuento.tipo === '2x1' ? '2x1' : `${descuento.porcentaje} %`;
  return (
    <div className="descuento-aplicado" role="status">
      <span className="descuento-valor">{valor}</span>
      <div className="descuento-detalle">
        <span className="descuento-etiqueta">
          <IconoEtiqueta width={14} height={14} />
          Descuento a aplicar
        </span>
        <b>{descuento.descripcion}</b>
        <span className="descuento-registro">
          {descuento.comercio} · {descuento.yaRegistrado ? 'ya estaba registrado hace un momento' : 'registrado'}
        </span>
      </div>
    </div>
  );
}

function FichaEstudiante({ titular }: { titular: Titular }) {
  return (
    <div className="ficha">
      <div className="ficha-cabecera">
        <span className="avatar" aria-hidden="true">
          {iniciales(titular.nombre)}
        </span>
        <div className="ficha-nombre">
          <h3>{titular.nombre}</h3>
          <p>{titular.programa ?? titular.tipo}</p>
        </div>
      </div>
      <dl className="ficha-datos">
        <Dato icono={<IconoBirrete />} titulo="Facultad" valor={titular.unidad} />
        {titular.sede && <Dato icono={<IconoUbicacion />} titulo="Sede" valor={titular.sede} />}
        {titular.periodo && <Dato icono={<IconoCalendario />} titulo="Periodo" valor={formatearPeriodo(titular.periodo)} />}
      </dl>
      <p className="ficha-cedula">
        Cédula <b>{titular.cedula}</b>
      </p>
    </div>
  );
}

function Dato({ icono, titulo, valor }: { icono: ReactNode; titulo: string; valor: string }) {
  return (
    <div className="dato">
      <span className="dato-icono" aria-hidden="true">
        {icono}
      </span>
      <div>
        <dt>{titulo}</dt>
        <dd>{valor}</dd>
      </div>
    </div>
  );
}

interface PropsTarjeta {
  variante: Variante;
  icono: ReactNode;
  etiqueta: string;
  titulo: string;
  texto: string;
  nota?: string;
  pie?: ReactNode;
  /** Sello de verificación (p. ej. "Verificado por la UTP"). */
  sello?: ReactNode;
  acciones: ReactNode;
  children?: ReactNode;
}

function Tarjeta({ variante, icono, etiqueta, titulo, texto, nota, pie, sello, acciones, children }: PropsTarjeta) {
  return (
    <article className={`tarjeta-resultado variante-${variante}`}>
      <span className="hoja-asa solo-movil" aria-hidden="true" />
      <header className="sello">
        <span className="sello-icono">{icono}</span>
        <span className="sello-etiqueta">{etiqueta}</span>
        <h2 className="sello-titulo">{titulo}</h2>
        <p className="sello-texto">{texto}</p>
      </header>
      <div className="tarjeta-cuerpo">
        {nota && <p className="nota">{nota}</p>}
        {children}
        {sello}
        {pie && <p className="pie">{pie}</p>}
        <div className="acciones">{acciones}</div>
      </div>
    </article>
  );
}

function Cargando() {
  return (
    <article className="tarjeta-resultado variante-cargando">
      <span className="hoja-asa solo-movil" aria-hidden="true" />
      <div className="cargando">
        <span className="anillo" aria-hidden="true" />
        <p className="cargando-titulo">Verificando…</p>
        <p className="cargando-texto">Consultando el sistema de matrícula de la UTP</p>
      </div>
      <div className="esqueleto" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

function Indicaciones() {
  return (
    <div className="indicaciones">
      <div className="indicaciones-ilustracion" aria-hidden="true">
        <IconoEscudo width={40} height={40} />
      </div>
      <h2>El resultado aparecerá aquí</h2>
      <p>Escanea el QR del carnet o escribe la cédula del estudiante.</p>
      <ul className="leyenda">
        <li>
          <span className="punto punto-activo" /> Activo: aplica el descuento
        </li>
        <li>
          <span className="punto punto-inactivo" /> Inactivo o no encontrado: no aplica
        </li>
        <li>
          <span className="punto punto-aviso" /> No verificado: reintenta
        </li>
      </ul>
    </div>
  );
}
