import {
  db,
  type LogEntrenamiento,
  type EjercicioReal,
  type SerieReal,
  type Rutina,
} from "../../core/db";

/** ID de rutina especial para entrenamientos libres (sin plantilla). */
export const CUSTOM_LIBRE_ID = "custom-libre";

export async function getUltimoLogDeRutina(
  rutinaId: string
): Promise<LogEntrenamiento | undefined> {
  const logs = await db.logsEntrenamientos
    .where("rutinaId")
    .equals(rutinaId)
    .sortBy("fecha");
  return logs.length > 0 ? logs[logs.length - 1] : undefined;
}

export async function guardarLogEntrenamiento(
  rutinaId: string,
  ejercicios: EjercicioReal[],
  rutinaSnapshot?: string,
  notas?: string,
  fecha?: string
): Promise<number> {
  const log: LogEntrenamiento = {
    fecha: fecha ?? new Date().toISOString(),
    rutinaId,
    rutinaSnapshot,
    completado: ejercicios.every((ej) =>
      ej.series.every((s) => s.completado)
    ),
    ejercicios,
    notas,
  };
  return db.logsEntrenamientos.add(log);
}

export function buildEjerciciosRealesDesdeRutina(
  rutina: Rutina,
  ultimoLog?: LogEntrenamiento
): EjercicioReal[] {
  return rutina.ejercicios.map((ej) => {
    const logEj = ultimoLog?.ejercicios.find(
      (e) => e.ejercicioId === ej.ejercicioId
    );

    return {
      ejercicioId: ej.ejercicioId,
      series: ej.series.map((s, idx) => {
        const logSerie = logEj?.series[idx];
        return {
          // Copiar valores objetivo de la rutina como valores iniciales
          peso: s.pesoObjetivo ?? 0,
          reps: s.repsObjetivo ?? 0,
          duracionMinutos: s.duracionObjetivoMinutos ?? 0,
          distanciaKm: s.distanciaObjetivoKm ?? 0,
          nivelInclinacion: 0,
          completado: false,
          rpe: s.rpeObjetivo ?? logSerie?.rpe,
        };
      }),
    };
  });
}

export function getPlaceholderSerie(
  ejercicioId: string,
  serieIdx: number,
  rutina: Rutina,
  ultimoLog?: LogEntrenamiento
): {
  peso: number;
  reps: number;
  duracionMinutos?: number;
  distanciaKm?: number;
  nivelInclinacion?: number;
} {
  // Prioridad 1: último log de esta rutina para este ejercicio/serie
  const logEj = ultimoLog?.ejercicios.find(
    (e) => e.ejercicioId === ejercicioId
  );
  const logSerie = logEj?.series[serieIdx];
  if (logSerie) {
    return {
      peso: logSerie.peso ?? 0,
      reps: logSerie.reps ?? 0,
      duracionMinutos: logSerie.duracionMinutos,
      distanciaKm: logSerie.distanciaKm,
      nivelInclinacion: logSerie.nivelInclinacion,
    };
  }

  // Prioridad 2: objetivo de la rutina
  const ejRutina = rutina.ejercicios.find((e) => e.ejercicioId === ejercicioId);
  const serieRutina = ejRutina?.series[serieIdx];
  if (serieRutina) {
    return {
      peso: serieRutina.pesoObjetivo ?? 0,
      reps: serieRutina.repsObjetivo ?? 0,
    };
  }

  return { peso: 0, reps: 0 };
}

export function serieTieneValores(serie: SerieReal): boolean {
  return (
    (serie.peso ?? 0) > 0 ||
    (serie.reps ?? 0) > 0 ||
    (serie.duracionMinutos ?? 0) > 0 ||
    (serie.distanciaKm ?? 0) > 0
  );
}

export async function actualizarLogEntrenamiento(
  logId: number,
  ejercicios: EjercicioReal[],
  notas?: string,
  fecha?: string
): Promise<void> {
  const existing = await db.logsEntrenamientos.get(logId);
  if (!existing) return;
  const updated: LogEntrenamiento = {
    ...existing,
    ejercicios,
    completado: ejercicios.every((ej) =>
      ej.series.every((s) => s.completado)
    ),
  };
  if (notas !== undefined) {
    updated.notas = notas;
  }
  if (fecha !== undefined) {
    updated.fecha = fecha;
  }
  await db.logsEntrenamientos.put(updated);
}

/** Volumen total (peso × reps) de series completadas en un array de ejercicios. */
export function calcularVolumenTotal(ejercicios: EjercicioReal[]): number {
  return ejercicios.reduce((acc, ej) => {
    return (
      acc +
      ej.series.reduce((sAcc, s) => {
        if (s.completado) {
          return sAcc + (s.peso ?? 0) * (s.reps ?? 0);
        }
        return sAcc;
      }, 0)
    );
  }, 0);
}

export async function eliminarLogEntrenamiento(
  logId: number
): Promise<void> {
  await db.logsEntrenamientos.delete(logId);
}
