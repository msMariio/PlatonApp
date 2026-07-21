import Dexie, { type Table } from "dexie";

export type GrupoMuscular =
  | "pecho"
  | "espalda"
  | "pierna"
  | "hombro"
  | "brazos"
  | "core"
  | "cardio"
  | "fullbody";

export type TipoEjercicio = "fuerza" | "cardio" | "tiempo" | "calistenia";

export type DiaSemana =
  | "lunes"
  | "martes"
  | "miercoles"
  | "jueves"
  | "viernes"
  | "sabado"
  | "domingo";

export interface Ejercicio {
  id: string;
  nombre: string;
  grupoMuscular: GrupoMuscular;
  descripcion?: string;
  tipo: TipoEjercicio;
}

export interface Serie {
  repsObjetivo?: number;
  pesoObjetivo?: number;
  rpeObjetivo?: number;
  notas?: string;
  duracionObjetivoMinutos?: number;
  distanciaObjetivoKm?: number;
}

export interface EjercicioEnRutina {
  /** id local único (para React keys); distinto del ejercicioId del catálogo */
  id: string;
  ejercicioId: string;
  series: Serie[];
  notas?: string;
  order: number;
}

export interface Carpeta {
  id: string;
  nombre: string;
  order: number;
  collapsed?: boolean;
}

export interface Rutina {
  id: string;
  nombre: string;
  descripcion?: string;
  /** undefined = root level (sin carpeta). Las carpetas son planas (sin anidación). */
  carpetaId?: string;
  ejercicios: EjercicioEnRutina[];
  order: number;
  createdAt: string;
}

export interface SerieReal {
  peso?: number;
  reps?: number;
  completado: boolean;
  rpe?: number;
  duracionMinutos?: number;
  distanciaKm?: number;
  nivelInclinacion?: number;
}

export interface EjercicioReal {
  ejercicioId: string;
  series: SerieReal[];
}

export interface LogEntrenamiento {
  id?: number;
  fecha: string;
  rutinaId: string;
  /** Nombre snapshot de la rutina. Útil para entrenamientos libres o rutinas borradas. */
  rutinaSnapshot?: string;
  completado: boolean;
  notas?: string;
  ejercicios: EjercicioReal[];
}

export interface PlanificacionSemanal {
  id: string;
  nombre: string;
  dias: Record<
    DiaSemana,
    {
      rutinaId: string | null;
      activo: boolean;
    }
  >;
}

export interface PesoDiario {
  id?: number;
  fecha: string;
  hora: string;
  valor: number;
}

export type SexoBiologico = "hombre" | "mujer";

export type ObjetivoFitness =
  | "hipertrofia"
  | "fuerza_maxima"
  | "definicion"
  | "perdida_peso"
  | "recomposicion";

export interface PerfilUsuario {
  id?: number;
  nombre?: string;
  alturaCm: number;
  fechaNacimiento?: string;
  sexoBio?: SexoBiologico;
  objetivo?: ObjetivoFitness;
  apiKeyGemini?: string;
}

export interface MensajeChat {
  id: string;
  role: "user" | "model";
  texto: string;
  timestamp: string;
}

export interface SesionChat {
  id?: number;
  titulo: string;
  fechaCreacion: string;
  fechaActualizacion: string;
  mensajes: MensajeChat[];
}

class GymDatabase extends Dexie {
  ejercicios!: Table<Ejercicio>;
  carpetas!: Table<Carpeta>;
  rutinas!: Table<Rutina>;
  logsEntrenamientos!: Table<LogEntrenamiento>;
  pesos!: Table<PesoDiario>;
  planificacionSemanal!: Table<PlanificacionSemanal>;
  perfil_usuario!: Table<PerfilUsuario>;
  sesiones_chat!: Table<SesionChat>;

  constructor() {
    super("GymTrackerDB");

    // v1 (legacy)
    this.version(1).stores({
      ejercicios: "id, grupoMuscular",
      rutinas: "id",
      logs: "++id, fecha, rutinaId",
      pesos: "++id, fecha",
    });

    // v2: carpetas, order, modelos ricos
    this.version(2)
      .stores({
        ejercicios: "id, grupoMuscular",
        carpetas: "id, order",
        rutinas: "id, carpetaId, order",
        logs: "++id, fecha, rutinaId",
        pesos: "++id, fecha",
      })
      .upgrade(async (tx) => {
        // Migración desde v1: rutinas viejas no tienen order, carpetaId, descripcion,
        // ni ejercicios con estructura rica. Hacemos un best-effort con bulkPut.
        const viejas = (await tx.table<Rutina>("rutinas").toArray()) as Array<
          Partial<Rutina> & { ejercicios?: unknown[] }
        >;
        const nuevas: Rutina[] = viejas.map((r, i) => migrateRutina(r, i));
        await tx.table<Rutina>("rutinas").bulkPut(nuevas);
      });

    // v3: logs -> logsEntrenamientos, planificación semanal
    this.version(3)
      .stores({
        ejercicios: "id, grupoMuscular",
        carpetas: "id, order",
        rutinas: "id, carpetaId, order",
        logs: null,
        logsEntrenamientos: "++id, fecha, rutinaId, [rutinaId+fecha]",
        pesos: "++id, fecha",
        planificacionSemanal: "id",
      })
      .upgrade(async (tx) => {
        // Migrar logs antiguos al nuevo formato con completado por serie
        const logsViejos = (await tx
          .table<LogEntrenamiento>("logs")
          .toArray()) as Array<{
          id?: number;
          fecha: string;
          rutinaId: string;
          completado: boolean;
          notas?: string;
          datosReales?: {
            ejercicioId: string;
            series: { peso: number; reps: number; rpe?: number }[];
          }[];
        }>;

        const logsMigrados: LogEntrenamiento[] = logsViejos.map((log) => ({
          id: log.id,
          fecha: log.fecha,
          rutinaId: log.rutinaId,
          completado: log.completado,
          notas: log.notas,
          ejercicios:
            log.datosReales?.map((d) => ({
              ejercicioId: d.ejercicioId,
              series: d.series.map((s) => ({
                peso: s.peso ?? 0,
                reps: s.reps ?? 0,
                completado: true,
                rpe: s.rpe,
              })),
            })) ?? [],
        }));

        if (logsMigrados.length > 0) {
          await tx.table<LogEntrenamiento>("logsEntrenamientos").bulkAdd(logsMigrados);
        }

        // Semilla de planificación semanal vacía
        const planificacion = buildPlanificacionVacia("default");
        await tx.table<PlanificacionSemanal>("planificacionSemanal").add(planificacion);
      });

    // v4: snapshot de rutina en logs (schema idéntico a v3, sin migración)
    this.version(4)
      .stores({
        ejercicios: "id, grupoMuscular",
        carpetas: "id, order",
        rutinas: "id, carpetaId, order",
        logsEntrenamientos: "++id, fecha, rutinaId, [rutinaId+fecha]",
        pesos: "++id, fecha",
        planificacionSemanal: "id",
      })
      .upgrade(async () => {
        // Schema idéntico a v3. La migración de logs ya se hizo en v3.
        // No hay nada que migrar aquí.
      });

    // v5: tipo de ejercicio y campos flexibles en SerieReal
    this.version(5)
      .stores({
        ejercicios: "id, grupoMuscular",
        carpetas: "id, order",
        rutinas: "id, carpetaId, order",
        logsEntrenamientos: "++id, fecha, rutinaId, [rutinaId+fecha]",
        pesos: "++id, fecha",
        planificacionSemanal: "id",
      })
      .upgrade(async (tx) => {
        // Añadir tipo por defecto "fuerza" a ejercicios existentes que no lo tengan
        const ejercicios = await tx.table<Ejercicio>("ejercicios").toArray();
        const actualizados = ejercicios.filter((e) => !(e as unknown as Record<string, unknown>).tipo);
        if (actualizados.length > 0) {
          await tx
            .table<Ejercicio>("ejercicios")
            .bulkPut(actualizados.map((e) => ({ ...e, tipo: "fuerza" as TipoEjercicio })));
        }
      });

    // v6: perfil de usuario
    this.version(6)
      .stores({
        ejercicios: "id, grupoMuscular",
        carpetas: "id, order",
        rutinas: "id, carpetaId, order",
        logsEntrenamientos: "++id, fecha, rutinaId, [rutinaId+fecha]",
        pesos: "++id, fecha",
        planificacionSemanal: "id",
        perfil_usuario: "id",
      })
      .upgrade(async (tx) => {
        await tx.table<PerfilUsuario>("perfil_usuario").put({ id: 1, alturaCm: 170 });
      });

    // v7: sesiones de chat para el Coach IA
    this.version(7)
      .stores({
        ejercicios: "id, grupoMuscular",
        carpetas: "id, order",
        rutinas: "id, carpetaId, order",
        logsEntrenamientos: "++id, fecha, rutinaId, [rutinaId+fecha]",
        pesos: "++id, fecha",
        planificacionSemanal: "id",
        perfil_usuario: "id",
        sesiones_chat: "++id, fechaCreacion, fechaActualizacion",
      })
      .upgrade(async () => {
        // Nueva tabla, sin migración necesaria.
      });
  }
}

function migrateRutina(
  r: Partial<Rutina> & { ejercicios?: unknown[] },
  order: number
): Rutina {
  const viejosEj = Array.isArray(r.ejercicios) ? r.ejercicios : [];
  const nuevosEjercicios: EjercicioEnRutina[] = viejosEj.map(
    (ej: unknown, idx: number) => migrateEjercicioEnRutina(ej, idx)
  );
  return {
    id: r.id as string,
    nombre: r.nombre ?? "",
    descripcion: r.descripcion ?? "",
    carpetaId: undefined,
    ejercicios: nuevosEjercicios,
    order,
    createdAt: r.createdAt ?? new Date().toISOString(),
  };
}

function migrateEjercicioEnRutina(
  ej: unknown,
  idx: number
): EjercicioEnRutina {
  const e = ej as {
    ejercicioId?: string;
    id?: string;
    series?: unknown;
    repeticionesTarget?: string;
    notas?: string;
  };
  if (Array.isArray(e.series)) {
    return {
      id: e.id ?? uid(),
      ejercicioId: e.ejercicioId ?? "",
      series: e.series as Serie[],
      notas: e.notas,
      order: idx,
    };
  }
  // Vieja forma: { series: number, repeticionesTarget: "4x6-8" }
  const numSeries =
    typeof e.series === "number"
      ? e.series
      : (parseInt(String(e.repeticionesTarget ?? "").split("x")[0], 10) || 3);
  const target = String(e.repeticionesTarget ?? "8").replace(/^\d+x/, "");
  const repsPorDefecto = parseInt(target.split("-")[0], 10) || 8;
  const series: Serie[] = Array.from({ length: numSeries }, () => ({
    repsObjetivo: repsPorDefecto,
  }));
  return {
    id: e.id ?? uid(),
    ejercicioId: e.ejercicioId ?? "",
    series,
    notas: e.notas,
    order: idx,
  };
}

export function buildPlanificacionVacia(id: string): PlanificacionSemanal {
  const dias: DiaSemana[] = [
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
    "domingo",
  ];
  const record = {} as Record<
    DiaSemana,
    { rutinaId: string | null; activo: boolean }
  >;
  for (const dia of dias) {
    record[dia] = { rutinaId: null, activo: true };
  }
  return { id, nombre: "Planificación por defecto", dias: record };
}

export function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Obtiene o crea el perfil de usuario (singleton, id=1). */
export async function getOrCreatePerfil(): Promise<PerfilUsuario> {
  const existente = await db.perfil_usuario.get(1);
  if (existente) return existente;
  const nuevo: PerfilUsuario = { id: 1, alturaCm: 170 };
  await db.perfil_usuario.put(nuevo);
  return nuevo;
}

export const db = new GymDatabase();
