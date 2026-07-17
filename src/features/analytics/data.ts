import { db, type LogEntrenamiento } from "../../core/db";

export interface PuntoAnalytics {
  fecha: Date;
  volumen: number;
  oneRm: number;
}

export async function getLogsPorEjercicio(
  ejercicioId: string
): Promise<LogEntrenamiento[]> {
  const all = await db.logsEntrenamientos.toArray();
  return all.filter((log) =>
    log.ejercicios.some((e) => e.ejercicioId === ejercicioId)
  );
}

export function calcularPuntosAnalytics(
  logs: LogEntrenamiento[],
  ejercicioId: string
): PuntoAnalytics[] {
  const puntos: PuntoAnalytics[] = [];

  for (const log of logs) {
    const ejercicio = log.ejercicios.find((e) => e.ejercicioId === ejercicioId);
    if (!ejercicio) continue;

    const seriesCompletadas = ejercicio.series.filter((s) => s.completado);
    if (seriesCompletadas.length === 0) continue;

    const volumen = seriesCompletadas.reduce(
      (acc, s) => acc + s.peso * s.reps,
      0
    );

    // 1RM estimado con fórmula de Epley: peso * (1 + reps/30)
    const oneRm = Math.max(
      ...seriesCompletadas.map((s) => s.peso * (1 + s.reps / 30))
    );

    puntos.push({
      fecha: new Date(log.fecha),
      volumen,
      oneRm,
    });
  }

  return puntos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}
