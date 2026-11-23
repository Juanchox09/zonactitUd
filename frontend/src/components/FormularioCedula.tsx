import { useState, type FormEvent } from 'react';
import { validarCedula } from '../utils/cedula';
import { IconoAlerta, IconoBorrar, IconoFlecha } from './Iconos';

interface Props {
  onValidar: (cedula: string) => void;
  cargando: boolean;
  /** Valor externo para precargar el campo (p. ej. desde el modo demo). */
  valorInicial?: string;
}

export function FormularioCedula({ onValidar, cargando, valorInicial = '' }: Props) {
  const [valor, setValor] = useState(valorInicial);
  const [error, setError] = useState<string | null>(null);

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const resultado = validarCedula(valor);
    if (!resultado.valida) {
      setError(resultado.error);
      return;
    }
    setError(null);
    setValor(resultado.cedula);
    onValidar(resultado.cedula);
  }

  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      <label htmlFor="cedula" className="etiqueta">
        Cédula del estudiante
      </label>
      <div className={`campo-grupo${error ? ' campo-invalido' : ''}`}>
        <input
          id="cedula"
          className="campo"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="8-123-456"
          value={valor}
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'cedula-error' : 'cedula-ayuda'}
          onChange={(e) => {
            setValor(e.target.value);
            if (error) setError(null);
          }}
        />
        {valor && (
          <button
            type="button"
            className="campo-limpiar"
            aria-label="Borrar"
            onClick={() => {
              setValor('');
              setError(null);
              document.getElementById('cedula')?.focus();
            }}
          >
            <IconoBorrar width={20} height={20} />
          </button>
        )}
      </div>
      {error ? (
        <p id="cedula-error" className="aviso-linea aviso-error" role="alert">
          <IconoAlerta width={18} height={18} />
          {error}
        </p>
      ) : (
        <p id="cedula-ayuda" className="ayuda">
          Con guiones, como aparece en el carnet: <b>8-123-456</b>, <b>E-8-12345</b>, <b>PE-12-345</b>
        </p>
      )}
      <button type="submit" className="boton boton-primario boton-grande boton-ancho" disabled={cargando || !valor.trim()}>
        {cargando ? 'Consultando…' : 'Validar estudiante'}
        {!cargando && <IconoFlecha width={20} height={20} />}
      </button>
    </form>
  );
}
