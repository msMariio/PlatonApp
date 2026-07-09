import Dexie, { type Table } from "dexie";

// 1. Interfaces de TypeScript para tus datos
export interface Ejercicio {
  id: string; // ej: "press-banca"
  nombre: string;
  grupoMuscular: "pecho" | "espalda" | "pierna" | "hombro" | "brazos";
}

export interface Rutina {
  id: string; // ej: "torso-fuerza"
  nombre: string;
  ejercicios: {
    ejercicioId: string;
    series: number;
    repeticionesTarget: string; // ej: "4x6-8"
  }[];
}

export interface LogEntrenamiento {
  id?: number; // Autoincremental
  fecha: string; // Formato YYYY-MM-DD
  rutinaId: string;
  completado: boolean;
  notas?: string;
  datosReales?: {
    ejercicioId: string;
    series: { peso: number; reps: number; rpe?: number }[];
  }[];
}

// 2. Definición de la Base de Datos
class GymDatabase extends Dexie {
  ejercicios!: Table<Ejercicio>;
  rutinas!: Table<Rutina>;
  logs!: Table<LogEntrenamiento>;

  constructor() {
    super("GymTrackerDB");
    // Definimos los índices de búsqueda rápidos para Dexie
    this.version(1).stores({
      ejercicios: "id, grupoMuscular",
      rutinas: "id",
      logs: "++id, fecha, rutinaId",
    });
  }
}

export const db = new GymDatabase();
