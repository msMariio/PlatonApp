/**
 * Utilidades de fecha y hora en horario LOCAL del dispositivo.
 *
 * Regla del proyecto: la fecha "de hoy" del Coach y los valores por defecto de
 * sus herramientas NUNCA se derivan de `toISOString()`, porque eso devuelve la
 * fecha en UTC y desfasaba un día entre las 00:00 y las 02:00 en España.
 */

/** Fecha local en formato YYYY-MM-DD. */
export function fechaLocalISO(fecha: Date = new Date()): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/** Hora local en formato HH:MM (24 h). */
export function horaLocalHHMM(fecha: Date = new Date()): string {
  const horas = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

/**
 * Devuelve la parte de día (YYYY-MM-DD) de una fecha date-only o ISO completa.
 * Los logs de entrenamiento conviven en ambos formatos, así que nunca se debe
 * comparar `fecha` por igualdad exacta.
 */
export function diaDeFecha(valor: string): string {
  return valor.slice(0, 10);
}

/** Comprueba que el valor es una fecha válida en formato YYYY-MM-DD. */
export function esFechaISO(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  return (
    fecha.getFullYear() === anio &&
    fecha.getMonth() === mes - 1 &&
    fecha.getDate() === dia
  );
}
