// Fechas en hora LOCAL (no UTC).
// Argentina es UTC-3: usar toISOString() cerca de medianoche devuelve el día
// equivocado. Estos helpers siempre trabajan con el día local.

/** Fecha de hoy como 'YYYY-MM-DD' en hora local. */
export function getToday(): string {
  return toDateStr(new Date());
}

/** Convierte un Date a 'YYYY-MM-DD' en hora local. */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
