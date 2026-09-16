import {
  db,
  type DiaSemana,
  type LogEntrenamiento,
  type PlanificacionSemanal,
  type Rutina,
  type TipoEjercicio,
} from "../../core/db";
import { calcularE1RM } from "../../core/utils/calculators";

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

export interface AdherenciaRutina {
  rutinaId: string;
  nombre: string;
  planificados: number;
  completados: number;
  porcentaje: number;
}

export interface AdherenciaPlanificacion {
  semanaInicio: Date;
  semanaFin: Date;
  entrenamientosPlanificados: number;
  entrenamientosCompletados: number;
  porcentajeCumplimiento: number;
  sesionesOmitidas: number;
  diasConsecutivos: number;
  rutinas: AdherenciaRutina[];
}

const DIAS_PLANIFICACION: DiaSemana[] = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

function fechaLocalISO(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

function inicioSemanaLocal(fecha: Date): Date {
  const inicio = new Date(fecha);
  inicio.setHours(0, 0, 0, 0);
  const dia = inicio.getDay();
  inicio.setDate(inicio.getDate() - (dia === 0 ? 6 : dia - 1));
  return inicio;
}

/**
 * Compara la planificación semanal actual con los logs completados.
 *
 * Recorre SIEMPRE los siete días de la semana (lunes a domingo): una rutina
 * planificada en sábado o domingo cuenta igual que la de diario. Un día está
 * planificado cuando tiene `rutinaId`; el flag `activo` es heredado y su
 * ausencia no debe ocultar la sesión (los planes antiguos no guardaban la
 * clave de los días de fin de semana y su rutina desaparecía de la métrica).
 *
 * Las sesiones futuras no se consideran omitidas, aunque sí forman parte
 * del total planificado de la semana.
 */
export function calcularAdherenciaPlanificacion(
  planificacion: PlanificacionSemanal | undefined,
  logs: LogEntrenamiento[],
  rutinas: Rutina[],
  ahora = new Date(),
): AdherenciaPlanificacion {
  const semanaInicio = inicioSemanaLocal(ahora);
  const semanaFin = new Date(semanaInicio);
  semanaFin.setDate(semanaFin.getDate() + 6);
  const hoyISO = fechaLocalISO(ahora);
  const logsCompletados = logs.filter((log) => log.completado);
  const diasCompletados = new Set(logsCompletados.map((log) => fechaLocalISO(new Date(log.fecha))));
  const rutinasMap = new Map(rutinas.map((rutina) => [rutina.id, rutina.nombre]));
  const porRutina = new Map<string, { nombre: string; planificados: number; completados: number }>();
  let entrenamientosPlanificados = 0;
  let entrenamientosCompletados = 0;
  let sesionesOmitidas = 0;

  for (const [index, diaSemana] of DIAS_PLANIFICACION.entries()) {
    const fecha = new Date(semanaInicio);
    fecha.setDate(fecha.getDate() + index);
    const config = planificacion?.dias[diaSemana];
    if (!config?.rutinaId) continue;

    const rutinaId = config.rutinaId;
    const nombre = rutinasMap.get(rutinaId) ?? (rutinaId === "custom-libre" ? "ENTRENAMIENTO LIBRE" : "RUTINA DESCONOCIDA");
    const acumulado = porRutina.get(rutinaId) ?? { nombre, planificados: 0, completados: 0 };
    acumulado.planificados++;
    entrenamientosPlanificados++;

    const fechaISO = fechaLocalISO(fecha);
    const completado = logsCompletados.some(
      (log) => log.rutinaId === rutinaId && fechaLocalISO(new Date(log.fecha)) === fechaISO,
    );
    if (completado) {
      acumulado.completados++;
      entrenamientosCompletados++;
    } else if (fechaISO <= hoyISO) {
      sesionesOmitidas++;
    }
    porRutina.set(rutinaId, acumulado);
  }

  const ultimoDiaCompletado = [...diasCompletados].sort().at(-1);
  let diasConsecutivos = 0;
  if (ultimoDiaCompletado) {
    const cursor = new Date(`${ultimoDiaCompletado}T00:00:00`);
    while (diasCompletados.has(fechaLocalISO(cursor))) {
      diasConsecutivos++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  const rutinasAdherencia = [...porRutina.entries()].map(([rutinaId, rutina]) => ({
    rutinaId,
    nombre: rutina.nombre,
    planificados: rutina.planificados,
    completados: rutina.completados,
    porcentaje: rutina.planificados > 0 ? (rutina.completados / rutina.planificados) * 100 : 0,
  }));

  return {
    semanaInicio,
    semanaFin,
    entrenamientosPlanificados,
    entrenamientosCompletados,
    porcentajeCumplimiento: entrenamientosPlanificados > 0
      ? (entrenamientosCompletados / entrenamientosPlanificados) * 100
      : 0,
    sesionesOmitidas,
    diasConsecutivos,
    rutinas: rutinasAdherencia,
  };
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

    // e1RM estimado con la fórmula global de Brzycki.
    const oneRm = Math.max(
      0,
      ...seriesCompletadas.map((s) => calcularE1RM(s.peso ?? 0, s.reps ?? 0)),
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
