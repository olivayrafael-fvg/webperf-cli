function pad(n) {
  return String(n).padStart(2, '0');
}

// Deriva los slugs de carpeta (fecha y hora) de un mismo Date, para que un run
// nunca quede partido entre dos carpetas por usar timestamps distintos.
export function buildRunPath(date) {
  const dateSlug = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
  const runSlug = [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('-');
  return { dateSlug, runSlug };
}
