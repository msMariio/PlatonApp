import {
  db,
  type LogEntrenamiento,
  type EjercicioReal,
  type SerieReal,
  type Rutina,
} from "../../core/db";
import { calcularE1RM } from "../../core/utils/calculators";

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
          reps: s.repsMin ?? 0,
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
  rpe?: number;
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
      rpe: logSerie.rpe,
    };
  }

  // Prioridad 2: objetivo de la rutina
  const ejRutina = rutina.ejercicios.find((e) => e.ejercicioId === ejercicioId);
  const serieRutina = ejRutina?.series[serieIdx];
  if (serieRutina) {
    return {
      peso: serieRutina.pesoObjetivo ?? 0,
      reps: serieRutina.repsMin ?? 0,
      rpe: serieRutina.rpeObjetivo,
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

export type TipoRecordPersonal =
  | "peso"
  | "e1rm"
  | "repeticiones"
  | "volumen"
  | "duracion"
  | "distancia"
  | "ritmo";

export interface RecordPersonal {
  ejercicioId: string;
  tipo: TipoRecordPersonal;
  valor: number;
  anterior?: number;
  unidad: string;
}

function obtenerMetricasEjercicio(ejercicio: EjercicioReal) {
  const series = ejercicio.series.filter((s) => s.completado);
  const volumen = series.reduce(
    (total, s) => total + (s.peso ?? 0) * (s.reps ?? 0),
    0,
  );
  const e1rm = Math.max(
    0,
    ...series.map((s) => calcularE1RM(s.peso ?? 0, s.reps ?? 0)),
  );
  const maxPeso = Math.max(0, ...series.map((s) => s.peso ?? 0));
  const maxRepsPorCarga = new Map<number, number>();
  for (const serie of series) {
    const peso = serie.peso ?? 0;
    const reps = serie.reps ?? 0;
    if (peso > 0 && reps > (maxRepsPorCarga.get(peso) ?? 0)) {
      maxRepsPorCarga.set(peso, reps);
    }
  }
  const duracion = series.reduce(
    (total, s) => total + (s.duracionMinutos ?? 0),
    0,
  );
  const distancia = series.reduce(
    (total, s) => total + (s.distanciaKm ?? 0),
    0,
  );
  const ritmo = duracion > 0 && distancia > 0 ? duracion / distancia : 0;

  return { series, volumen, e1rm, maxPeso, maxRepsPorCarga, duracion, distancia, ritmo };
}

/**
 * Detecta récords frente a todos los entrenamientos anteriores del mismo
 * ejercicio. El log que se está editando se excluye para no compararlo consigo mismo.
 */
export async function detectarRecordsPersonales(
  ejercicios: EjercicioReal[],
  logId?: number,
): Promise<RecordPersonal[]> {
  // Los récords son personales para el ejercicio, aunque se haya entrenado
  // dentro de otra rutina o en modo libre.
  const logs = await db.logsEntrenamientos.toArray();
  const anteriores = logs.filter((log) => log.id !== logId);
  const records: RecordPersonal[] = [];

  for (const ejercicio of ejercicios) {
    const actual = obtenerMetricasEjercicio(ejercicio);
    if (actual.series.length === 0) continue;
    const historicos = anteriores
      .map((log) => log.ejercicios.find((e) => e.ejercicioId === ejercicio.ejercicioId))
      .filter((e): e is EjercicioReal => e !== undefined)
      .map(obtenerMetricasEjercicio)
      .filter((metricas) => metricas.series.length > 0);

    const maxHistorico = (selector: (m: ReturnType<typeof obtenerMetricasEjercicio>) => number) =>
      Math.max(0, ...historicos.map(selector));
    const añadir = (tipo: TipoRecordPersonal, valor: number, anterior: number, unidad: string) => {
      if (valor > 0 && valor > anterior) records.push({ ejercicioId: ejercicio.ejercicioId, tipo, valor, anterior: anterior || undefined, unidad });
    };

    añadir("peso", actual.maxPeso, maxHistorico((m) => m.maxPeso), "kg");
    añadir("e1rm", actual.e1rm, maxHistorico((m) => m.e1rm), "kg e1RM");
    añadir("volumen", actual.volumen, maxHistorico((m) => m.volumen), "kg");
    añadir("duracion", actual.duracion, maxHistorico((m) => m.duracion), "min");
    añadir("distancia", actual.distancia, maxHistorico((m) => m.distancia), "km");

    const cargas = [...actual.maxRepsPorCarga.keys()];
    for (const peso of cargas) {
      const reps = actual.maxRepsPorCarga.get(peso) ?? 0;
      const historicoReps = Math.max(
        0,
        ...historicos.map((m) => m.maxRepsPorCarga.get(peso) ?? 0),
      );
      if (reps > historicoReps) {
        records.push({ ejercicioId: ejercicio.ejercicioId, tipo: "repeticiones", valor: reps, anterior: historicoReps || undefined, unidad: `reps a ${peso} kg` });
      }
    }

    const mejorRitmoHistorico = historicos
      .map((m) => m.ritmo)
      .filter((ritmo) => ritmo > 0)
      .reduce((mejor, ritmo) => (mejor === 0 ? ritmo : Math.min(mejor, ritmo)), 0);
    if (actual.ritmo > 0 && (mejorRitmoHistorico === 0 || actual.ritmo < mejorRitmoHistorico)) {
      records.push({ ejercicioId: ejercicio.ejercicioId, tipo: "ritmo", valor: actual.ritmo, anterior: mejorRitmoHistorico || undefined, unidad: "min/km" });
    }
  }

  return records;
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
