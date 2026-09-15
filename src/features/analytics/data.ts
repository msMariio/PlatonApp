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

export const GRUPOS_MUSCULARES = [
  "pecho",
  "espalda",
  "cuadriceps",
  "isquios",
  "hombro",
  "biceps",
  "triceps",
  "core",
  "gluteo",
] as const;

export type GrupoMuscularAnalitica = (typeof GRUPOS_MUSCULARES)[number];

export interface MetricaGrupoMuscular {
  grupo: GrupoMuscularAnalitica;
  volumen: number;
  seriesEfectivas: number;
  frecuencia: number;
}

export type EstadoSeriesMusculares = "INACTIVO" | "BAJO" | "MEDIO" | "OPTIMO" | "ALTO";

export interface ClasificacionSeriesMusculares {
  estado: EstadoSeriesMusculares;
  badge: string;
  rangoMax: number;
}

/** Clasifica las series efectivas semanales según los rangos de referencia. */
export function clasificarSeriesMusculares(seriesEfectivas: number): ClasificacionSeriesMusculares {
  if (seriesEfectivas === 0) {
    return { estado: "INACTIVO", badge: "[ INACTIVO ]", rangoMax: 20 };
  }
  if (seriesEfectivas < 6) {
    return { estado: "BAJO", badge: "[ BAJO ]", rangoMax: 20 };
  }
  if (seriesEfectivas < 10) {
    return { estado: "MEDIO", badge: "[ MEDIO ]", rangoMax: 20 };
  }
  if (seriesEfectivas <= 20) {
    return { estado: "OPTIMO", badge: "[ ÓPTIMO ]", rangoMax: 20 };
  }
  return { estado: "ALTO", badge: "[ EXCESO ⚠️ ]", rangoMax: 25 };
}

export interface SemanaGrupoMuscular {
  inicio: Date;
  fin: Date;
  grupos: MetricaGrupoMuscular[];
}

export interface AnaliticaGrupoMuscular {
  semanas: SemanaGrupoMuscular[];
  actual: MetricaGrupoMuscular[];
  abandonados: GrupoMuscularAnalitica[];
  sobrecargados: GrupoMuscularAnalitica[];
  ejerciciosSinClasificar: number;
}

function inicioSemana(fecha: Date): Date {
  const inicio = new Date(fecha);
  inicio.setHours(0, 0, 0, 0);
  const dia = inicio.getDay();
  const distancia = dia === 0 ? 6 : dia - 1;
  inicio.setDate(inicio.getDate() - distancia);
  return inicio;
}

function claveFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function crearMetricasVacias(): Map<GrupoMuscularAnalitica, { volumen: number; series: number; dias: Set<string> }> {
  return new Map(GRUPOS_MUSCULARES.map((grupo) => [grupo, { volumen: 0, series: 0, dias: new Set<string>() }]));
}

/**
 * Agrega el historial en semanas ISO-locales. Solo los ejercicios con grupo
 * muscular nuevo contribuyen; cardio/fullbody y legacy sin reclasificar quedan
 * fuera del análisis y se contabilizan en `ejerciciosSinClasificar`.
 */
export function calcularAnaliticaGrupoMuscular(
  logs: LogEntrenamiento[],
  ejercicios: Array<{ id: string; grupoMuscular?: string }>,
  ahora = new Date(),
): AnaliticaGrupoMuscular {
  const catalogo = new Map(ejercicios.map((ejercicio) => [ejercicio.id, ejercicio.grupoMuscular]));
  const semanaActual = inicioSemana(ahora);
  const semanas: SemanaGrupoMuscular[] = [];
  const acumulados = Array.from({ length: 8 }, () => crearMetricasVacias());
  let ejerciciosSinClasificar = 0;

  for (const log of logs) {
    const fechaLog = new Date(log.fecha);
    const diferenciaSemanas = Math.floor(
      (semanaActual.getTime() - inicioSemana(fechaLog).getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    if (diferenciaSemanas < 0 || diferenciaSemanas >= 8) continue;
    const semana = acumulados[7 - diferenciaSemanas];
    const dia = claveFecha(fechaLog);

    for (const ejercicio of log.ejercicios) {
      const grupo = catalogo.get(ejercicio.ejercicioId);
      if (!GRUPOS_MUSCULARES.includes(grupo as GrupoMuscularAnalitica)) {
        if (ejercicio.series.some((serie) => serie.completado)) ejerciciosSinClasificar++;
        continue;
      }
      const metrica = semana.get(grupo as GrupoMuscularAnalitica)!;
      const seriesEfectivas = ejercicio.series.filter(
        (serie) => serie.completado && ((serie.reps ?? 0) > 0 || (serie.peso ?? 0) > 0),
      );
      if (seriesEfectivas.length > 0) metrica.dias.add(dia);
      metrica.series += seriesEfectivas.length;
      metrica.volumen += seriesEfectivas.reduce(
        (total, serie) => total + (serie.peso ?? 0) * (serie.reps ?? 0),
        0,
      );
    }
  }

  for (let index = 0; index < 8; index++) {
    const inicio = new Date(semanaActual);
    inicio.setDate(inicio.getDate() - (7 - index) * 7);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 6);
    const grupos = GRUPOS_MUSCULARES.map((grupo) => {
      const metricas = acumulados[index].get(grupo)!;
      return { grupo, volumen: metricas.volumen, seriesEfectivas: metricas.series, frecuencia: metricas.dias.size };
    });
    semanas.push({ inicio, fin, grupos });
  }

  const actual = semanas[semanas.length - 1].grupos;
  const anterior = semanas[semanas.length - 2].grupos;
  const abandonados = GRUPOS_MUSCULARES.filter((grupo) => {
    const esta = actual.find((m) => m.grupo === grupo)!;
    const antes = anterior.find((m) => m.grupo === grupo)!;
    return esta.seriesEfectivas === 0 && antes.seriesEfectivas > 0;
  });
  const sobrecargados = GRUPOS_MUSCULARES.filter((grupo) => {
    const esta = actual.find((m) => m.grupo === grupo)!;
    const antes = anterior.find((m) => m.grupo === grupo)!;
    return antes.seriesEfectivas > 0 &&
      (esta.seriesEfectivas >= antes.seriesEfectivas * 1.5 || esta.volumen >= antes.volumen * 1.5);
  });

  return { semanas, actual, abandonados, sobrecargados, ejerciciosSinClasificar };
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
