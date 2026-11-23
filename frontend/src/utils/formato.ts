const fecha = new Intl.DateTimeFormat('es-PA', { day: '2-digit', month: 'short', year: 'numeric' });
const hora = new Intl.DateTimeFormat('es-PA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Formatea una fecha ISO (AAAA-MM-DD) sin desfase de zona horaria. */
export function formatearFecha(iso: string): string {
  const [anio, mes, dia] = iso.split('-').map(Number);
  if (!anio || !mes || !dia) return iso;
  return fecha.format(new Date(anio, mes - 1, dia));
}

const ROMANOS = ['', 'I', 'II'];

/** { anio: 2026, semestre: 2 } → "II semestre 2026" · semestre 3 → "Verano 2026". */
export function formatearPeriodo({ anio, semestre }: { anio: number; semestre: number }): string {
  if (semestre === 3) return `Verano ${anio}`;
  return `${ROMANOS[semestre] ?? semestre} semestre ${anio}`;
}

export function formatearHora(momento: Date): string {
  return hora.format(momento);
}
