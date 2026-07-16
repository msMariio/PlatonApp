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

export interface Ejercicio {
  id: string;
  nombre: string;
  grupoMuscular: GrupoMuscular;
  descripcion?: string;
}

export interface Serie {
  repsObjetivo: number;
  pesoObjetivo?: number;
  rpeObjetivo?: number;
  notas?: string;
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

export interface LogEntrenamiento {
  id?: number;
  fecha: string;
  rutinaId: string;
  completado: boolean;
  notas?: string;
  datosReales?: {
    ejercicioId: string;
    series: { peso: number; reps: number; rpe?: number }[];
  }[];
}

export interface PesoDiario {
  id?: number;
  fecha: string;
  hora: string;
  valor: number;
}

class GymDatabase extends Dexie {
  ejercicios!: Table<Ejercicio>;
  carpetas!: Table<Carpeta>;
  rutinas!: Table<Rutina>;
  logs!: Table<LogEntrenamiento>;
  pesos!: Table<PesoDiario>;

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
        const nuevas: Rutina[] = viejas.map((r, i) =>
          migrateRutina(r, i)
        );
        await tx.table<Rutina>("rutinas").bulkPut(nuevas);
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

function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export const db = new GymDatabase();
