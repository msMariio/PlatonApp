import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LogEntrenamiento, type Ejercicio } from "../../core/db";

export interface PuntoE1RM {
  fecha: Date;
  e1rm: number;
}

export interface E1RMData {
  puntos: PuntoE1RM[];
  actual: number | null;
  delta30dias: number | null;
}

/**
 * Fórmula de Brzycki: e1RM = w × (36 / (37 - r))
 * Válida para 1 ≤ r < 37. Más precisa para r ≤ 10.
 */
function brzycki(w: number, r: number): number {
  if (r <= 0 || r >= 37) return 0;
  return w * (36 / (37 - r));
}

/**
 * Calcula el e1RM estimado para un ejercicio en un log de entrenamiento.
 * Toma la serie con mayor e1RM estimado (mejor serie del día).
 */
function calcularE1RMPorLog(
  log: LogEntrenamiento,
  ejercicioId: string
): number {
  const ejercicio = log.ejercicios.find((e) => e.ejercicioId === ejercicioId);
  if (!ejercicio) return 0;

  let mejorE1RM = 0;
  for (const serie of ejercicio.series) {
    if (!serie.completado) continue;
    const peso = serie.peso ?? 0;
    const reps = serie.reps ?? 0;
    if (peso <= 0 || reps <= 0) continue;
    const e1rm = brzycki(peso, reps);
    if (e1rm > mejorE1RM) mejorE1RM = e1rm;
  }
  return mejorE1RM;
}

/**
 * Hook que devuelve los datos de progresión de e1RM para un ejercicio.
 * Calcula Brzycki e1RM para cada log de entrenamiento donde aparece el ejercicio.
 */
export function useE1RM(ejercicioId: string | null): E1RMData {
  const logs = useLiveQuery(() => db.logsEntrenamientos.toArray(), []) ?? [];

  if (!ejercicioId) {
    return { puntos: [], actual: 0, delta30dias: null };
  }

  // Filtrar logs que contengan el ejercicio y tengan al menos 1 serie completada
  const puntos: PuntoE1RM[] = [];
  for (const log of logs) {
    const e1rm = calcularE1RMPorLog(log, ejercicioId);
    if (e1rm > 0) {
      puntos.push({ fecha: new Date(log.fecha), e1rm });
    }
  }

  // Ordenar cronológicamente
  puntos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  const actual = puntos.length > 0 ? puntos[puntos.length - 1].e1rm : null;

  // Delta 30 días: comparar el último valor con el máximo de hace 30 días
  let delta30dias: number | null = null;
  if (puntos.length > 0) {
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    // Buscar el punto más reciente dentro de la ventana de hace 30±7 días
    const puntosVentana = puntos.filter((p) => {
      const diff = p.fecha.getTime() - hace30Dias.getTime();
      return diff >= -7 * 24 * 60 * 60 * 1000 && diff <= 7 * 24 * 60 * 60 * 1000;
    });

    if (puntosVentana.length > 0) {
      const ref = Math.max(...puntosVentana.map((p) => p.e1rm));
      delta30dias = actual - ref;
    } else if (puntos.length >= 2) {
      // Fallback: comparar con el punto más antiguo disponible
      delta30dias = actual - puntos[0].e1rm;
    }
  }

  return { puntos, actual, delta30dias };
}

/**
 * Obtiene los ejercicios de tipo "fuerza" o "calistenia" no archivados
 * que tienen al menos un log registrado.
 */
export function useEjerciciosConLogs(): Ejercicio[] {
  const ejercicios =
    useLiveQuery(
      () =>
        db.ejercicios
          .filter(
            (e) =>
              !e.isArchived &&
              (e.tipo === "fuerza" || e.tipo === "calistenia")
          )
          .toArray(),
      []
    ) ?? [];

  const logs = useLiveQuery(() => db.logsEntrenamientos.toArray(), []) ?? [];

  return useMemo(
    () =>
      ejercicios.filter((ej) =>
        logs.some((log) =>
          log.ejercicios.some(
            (e) =>
              e.ejercicioId === ej.id && e.series.some((s) => s.completado)
          )
        )
      ),
    [ejercicios, logs]
  );
}

/** Ejercicios principales predefinidos para los pills. */
export const MAIN_LIFT_KEYWORDS: string[] = [
  "banca",
  "sentadilla",
  "peso muerto",
  "press militar",
];
