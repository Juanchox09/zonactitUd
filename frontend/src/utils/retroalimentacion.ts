/**
 * Sonido y vibración al recibir un resultado: el cajero sabe la respuesta sin mirar la pantalla.
 * El sonido se puede apagar desde la cabecera (preferencia guardada en este navegador).
 */
export type Tono = 'exito' | 'rechazo' | 'aviso';

const CLAVE_SONIDO = 'actitud.sonido';

let contexto: AudioContext | null = null;

export function sonidoActivado(): boolean {
  try {
    return localStorage.getItem(CLAVE_SONIDO) !== 'no';
  } catch {
    return true;
  }
}

export function guardarSonido(activado: boolean): void {
  try {
    localStorage.setItem(CLAVE_SONIDO, activado ? 'si' : 'no');
  } catch {
    /* sin almacenamiento (modo privado): la preferencia dura hasta recargar */
  }
}

const NOTAS: Record<Tono, Array<[frecuencia: number, inicio: number, duracion: number]>> = {
  exito: [
    [880, 0, 0.09],
    [1320, 0.1, 0.14],
  ],
  rechazo: [
    [330, 0, 0.16],
    [220, 0.18, 0.24],
  ],
  aviso: [[520, 0, 0.18]],
};

const VIBRACION: Record<Tono, number[]> = {
  exito: [60],
  rechazo: [120, 80, 120],
  aviso: [200],
};

export function avisar(tono: Tono, conSonido: boolean): void {
  try {
    navigator.vibrate?.(VIBRACION[tono]);
  } catch {
    /* no disponible */
  }
  if (!conSonido) return;
  try {
    contexto ??= new AudioContext();
    const ahora = contexto.currentTime;
    for (const [frecuencia, inicio, duracion] of NOTAS[tono]) {
      const oscilador = contexto.createOscillator();
      const volumen = contexto.createGain();
      oscilador.type = tono === 'rechazo' ? 'square' : 'sine';
      oscilador.frequency.value = frecuencia;
      volumen.gain.setValueAtTime(0.0001, ahora + inicio);
      volumen.gain.exponentialRampToValueAtTime(tono === 'rechazo' ? 0.05 : 0.12, ahora + inicio + 0.015);
      volumen.gain.exponentialRampToValueAtTime(0.0001, ahora + inicio + duracion);
      oscilador.connect(volumen).connect(contexto.destination);
      oscilador.start(ahora + inicio);
      oscilador.stop(ahora + inicio + duracion + 0.02);
    }
  } catch {
    /* audio bloqueado por el navegador */
  }
}

/** "ANA MARÍA PÉREZ GÓMEZ" → "AP" (primer nombre y primer apellido; ignora "DE", "LA"…). */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter((p) => p.length > 2);
  const primera = partes[0]?.[0] ?? '?';
  const segunda = partes.length >= 4 ? partes[2]?.[0] : partes.length >= 2 ? partes[partes.length - 1]?.[0] : '';
  return (primera + (segunda ?? '')).toUpperCase();
}
