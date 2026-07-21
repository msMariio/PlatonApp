import { db, type LogEntrenamiento, type TipoEjercicio } from "../../core/db";

export interface PuntoAnalytics {
  fecha: Date;
  volumen: number;
  oneRm: number;
  duracionTotal?: number;
  distanciaTotal?: number;
  ritmoMedio?: number;
  volumenMedioPorSerie?: number;
  numSeriesCompletadas: number;
}

export async function getLogsPorEjercicio(
  ejercicioId: string
): Promise<LogEntrenamiento[]> {
  const all = await db.logsEntrenamientos.toArray();
  return all.filter((log) =>
    log.ejercicios.some((e) => e.ejercicioId === ejercicioId)
  );
}

export async function getTipoEjercicio(
  ejercicioId: string
): Promise<TipoEjercicio | undefined> {
  const ej = await db.ejercicios.get(ejercicioId);
  return ej?.tipo;
}

export function calcularPuntosAnalytics(
  logs: LogEntrenamiento[],
  ejercicioId: string,
  tipo?: TipoEjercicio
): PuntoAnalytics[] {
  const puntos: PuntoAnalytics[] = [];

  for (const log of logs) {
    const ejercicio = log.ejercicios.find((e) => e.ejercicioId === ejercicioId);
    if (!ejercicio) continue;

    const seriesCompletadas = ejercicio.series.filter((s) => s.completado);
    if (seriesCompletadas.length === 0) continue;

    const volumen = seriesCompletadas.reduce(
      (acc, s) => acc + (s.peso ?? 0) * (s.reps ?? 0),
      0
    );

    // 1RM estimado con fórmula de Epley: peso * (1 + reps/30)
    const oneRm = Math.max(
      ...seriesCompletadas.map((s) => (s.peso ?? 0) * (1 + (s.reps ?? 0) / 30))
    );

    const duracionTotal =
      tipo === "cardio" || tipo === "tiempo"
        ? seriesCompletadas.reduce(
            (acc, s) => acc + (s.duracionMinutos ?? 0),
            0
          )
        : undefined;

    const distanciaTotal =
      tipo === "cardio"
        ? seriesCompletadas.reduce(
            (acc, s) => acc + (s.distanciaKm ?? 0),
            0
          )
        : undefined;

    const numSeriesCompletadas = seriesCompletadas.length;

    const ritmoMedio =
      tipo === "cardio" && duracionTotal && distanciaTotal && distanciaTotal > 0
        ? duracionTotal / distanciaTotal
        : undefined;

    const volumenMedioPorSerie =
      tipo !== "cardio" && tipo !== "tiempo" && numSeriesCompletadas > 0
        ? volumen / numSeriesCompletadas
        : undefined;

    puntos.push({
      fecha: new Date(log.fecha),
      volumen,
      oneRm,
      duracionTotal,
      distanciaTotal,
      ritmoMedio,
      volumenMedioPorSerie,
      numSeriesCompletadas,
    });
  }

  return puntos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}
