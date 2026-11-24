import { useState, type FormEvent } from 'react';
import { iniciarSesion, type Sesion } from '../../services/sesion';
import { IconoAlerta, IconoCandado, IconoFlecha } from '../Iconos';

interface Props {
  onIniciar: (sesion: Sesion) => void;
  /** Motivo por el que se volvió a pedir la sesión (p. ej. venció). */
  aviso?: string | null;
}

export function LoginAdmin({ onIniciar, aviso }: Props) {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!usuario.trim() || !contrasena) {
      setError('Escribe tu usuario y tu contraseña.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      onIniciar(await iniciarSesion(usuario.trim(), contrasena));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
      setContrasena('');
    } finally {
      setEnviando(false);
    }
  }

  const mensaje = error ?? aviso;

  return (
    <section className="login tarjeta" aria-labelledby="login-titulo">
      <div className="login-icono" aria-hidden="true">
        <IconoCandado width={26} height={26} />
      </div>
      <h1 id="login-titulo">Acceso al panel</h1>
      <p className="login-texto">Para la administración de ActitUd y para el personal de los comercios afiliados.</p>

      <form className="login-formulario" onSubmit={enviar} noValidate>
        <label className="etiqueta" htmlFor="login-usuario">
          Usuario
        </label>
        <input
          id="login-usuario"
          className="login-campo"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={usuario}
          autoFocus
          onChange={(e) => setUsuario(e.target.value)}
        />
        <label className="etiqueta" htmlFor="login-contrasena">
          Contraseña
        </label>
        <input
          id="login-contrasena"
          className="login-campo"
          type="password"
          autoComplete="current-password"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
        />
        {mensaje && (
          <p className="aviso-linea aviso-error" role="alert">
            <IconoAlerta width={18} height={18} />
            {mensaje}
          </p>
        )}
        <button type="submit" className="boton boton-primario boton-grande boton-ancho" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
          {!enviando && <IconoFlecha width={20} height={20} />}
        </button>
      </form>
    </section>
  );
}
