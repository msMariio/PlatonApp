import type {
  GrupoMuscular,
  TipoEjercicio,
  DiaSemana,
} from "../../../core/db";

// ── Tipos de las herramientas ────────────────────────────────────────

export interface CrearCarpetaArgs {
  nombre: string;
}

export interface CrearEjercicioArgs {
  nombre: string;
  grupoMuscular: GrupoMuscular;
  descripcion?: string;
  tipo?: TipoEjercicio;
}

export interface EjercicioEnRutinaArgs {
  ejercicioId?: string;
  ejercicioNombre?: string;
  series: number;
  repsObjetivo?: number;
  pesoObjetivo?: number;
  descansoMinutos?: number;
  duracionObjetivoMinutos?: number;
  distanciaObjetivoKm?: number;
  notas?: string;
}

export interface CrearRutinaArgs {
  nombre: string;
  descripcion?: string;
  carpetaId?: string;
  carpetaNombre?: string;
  ejercicios: EjercicioEnRutinaArgs[];
}

export interface ActualizarPlanificacionSemanalArgs {
  dias: Partial<Record<DiaSemana, string | null>>;
}

export type FunctionCallArgs =
  | { name: "crear_carpeta"; args: CrearCarpetaArgs }
  | { name: "crear_ejercicio"; args: CrearEjercicioArgs }
  | { name: "crear_rutina"; args: CrearRutinaArgs }
  | { name: "actualizar_planificacion_semanal"; args: ActualizarPlanificacionSemanalArgs };

// ── Declaraciones de herramientas para Gemini ────────────────────────

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "crear_carpeta",
    description:
      "Crea una nueva carpeta para organizar rutinas de entrenamiento. " +
      "Úsala cuando el atleta quiera agrupar rutinas (ej: 'Push', 'Pull', 'Pierna').",
    parameters: {
      type: "object",
      properties: {
        nombre: {
          type: "string",
          description: "Nombre descriptivo de la carpeta (ej: 'Empuje', 'Tren Superior').",
        },
      },
      required: ["nombre"],
    },
  },
  {
    name: "crear_ejercicio",
    description:
      "Añade un nuevo ejercicio al catálogo maestro. " +
      "Úsala cuando el atleta mencione un ejercicio que no está en el catálogo actual.",
    parameters: {
      type: "object",
      properties: {
        nombre: {
          type: "string",
          description: "Nombre del ejercicio (ej: 'Press Banca', 'Sentadilla').",
        },
        grupoMuscular: {
          type: "string",
          enum: [
            "pecho",
            "espalda",
            "pierna",
            "hombro",
            "brazos",
            "core",
            "cardio",
            "fullbody",
          ],
          description: "Grupo muscular principal trabajado.",
        },
        descripcion: {
          type: "string",
          description: "Descripción opcional, técnica o notas sobre el ejercicio.",
        },
        tipo: {
          type: "string",
          enum: ["fuerza", "cardio", "tiempo", "calistenia"],
          description:
            "Tipo de ejercicio. Por defecto 'fuerza' si no se especifica.",
        },
      },
      required: ["nombre", "grupoMuscular"],
    },
  },
  {
    name: "crear_rutina",
    description:
      "Crea una nueva plantilla de rutina con ejercicios, series, reps objetivo y descansos. " +
      "Úsala cuando el atleta pida diseñar una rutina completa o añadir una plantilla de entrenamiento.",
    parameters: {
      type: "object",
      properties: {
        nombre: {
          type: "string",
          description: "Nombre de la rutina (ej: 'Push A', 'Full Body Lunes').",
        },
        descripcion: {
          type: "string",
          description: "Descripción opcional de la rutina (objetivo, notas, etc.).",
        },
        carpetaId: {
          type: "string",
          description:
            "ID de la carpeta existente donde guardar la rutina. Si no se conoce el ID, usa carpetaNombre en su lugar.",
        },
        carpetaNombre: {
          type: "string",
          description:
            "Nombre de la carpeta donde guardar la rutina. SIEMPRE usa este campo cuando el atleta mencione " +
            "una carpeta (ej: 'Ponlo en la carpeta Push'). Si la carpeta no existe, se creará automáticamente. " +
            "NO lo dejes vacío si el atleta ha mencionado una carpeta.",
        },
        ejercicios: {
          type: "array",
          description:
            "Lista ordenada de ejercicios que componen la rutina.",
          items: {
            type: "object",
            properties: {
              ejercicioId: {
                type: "string",
                description:
                  "ID del ejercicio del catálogo. Si no se conoce, usa ejercicioNombre.",
              },
              ejercicioNombre: {
                type: "string",
                description:
                  "Nombre del ejercicio. Si no existe en el catálogo, se creará automáticamente con grupoMuscular 'fullbody' y tipo 'fuerza'.",
              },
              series: {
                type: "integer",
                description: "Número de series para este ejercicio (ej: 3, 4, 5).",
              },
              repsObjetivo: {
                type: "integer",
                description:
                  "Repeticiones objetivo por serie (ej: 8, 10, 12). Para ejercicios de fuerza/calistenia.",
              },
              pesoObjetivo: {
                type: "number",
                description:
                  "Peso objetivo en kg. IMPORTANTE: si el atleta tiene historial de entrenamiento para este " +
                  "ejercicio, sugiere un peso aproximado basado en sus últimos pesos reales. Si no hay historial, " +
                  "estima un peso razonable según el nivel típico para el ejercicio y el objetivo del atleta.",
              },
              descansoMinutos: {
                type: "number",
                description: "Descanso entre series en minutos (opcional, por defecto 2).",
              },
              duracionObjetivoMinutos: {
                type: "number",
                description:
                  "Duración objetivo en minutos. Para ejercicios de cardio/tiempo.",
              },
              distanciaObjetivoKm: {
                type: "number",
                description: "Distancia objetivo en km. Para ejercicios de cardio.",
              },
              notas: {
                type: "string",
                description: "Notas adicionales para este ejercicio (opcional).",
              },
            },
            required: ["series"],
          },
        },
      },
      required: ["nombre", "ejercicios"],
    },
  },
  {
    name: "actualizar_planificacion_semanal",
    description:
      "Asigna o modifica qué rutina se entrena cada día de la semana (Lunes a Domingo). " +
      "Úsala cuando el atleta quiera planificar su semana de entrenamiento.",
    parameters: {
      type: "object",
      properties: {
        dias: {
          type: "object",
          description:
            "Objeto con los días a modificar. Las claves son los días de la semana en minúscula. " +
            "El valor es el ID de la rutina asignada, o null para marcar como descanso. " +
            "Solo incluye los días que quieras cambiar.",
          properties: {
            lunes: {
              type: "string",
              nullable: true,
              description: "ID de la rutina para el lunes, o null para descanso.",
            },
            martes: {
              type: "string",
              nullable: true,
              description: "ID de la rutina para el martes, o null para descanso.",
            },
            miercoles: {
              type: "string",
              nullable: true,
              description: "ID de la rutina para el miércoles, o null para descanso.",
            },
            jueves: {
              type: "string",
              nullable: true,
              description: "ID de la rutina para el jueves, o null para descanso.",
            },
            viernes: {
              type: "string",
              nullable: true,
              description: "ID de la rutina para el viernes, o null para descanso.",
            },
            sabado: {
              type: "string",
              nullable: true,
              description: "ID de la rutina para el sábado, o null para descanso.",
            },
            domingo: {
              type: "string",
              nullable: true,
              description: "ID de la rutina para el domingo, o null para descanso.",
            },
          },
        },
      },
      required: ["dias"],
    },
  },
];

/** Mapa nombre → declaración para búsqueda rápida. */
export const TOOLS_BY_NAME: Record<string, FunctionDeclaration> =
  Object.fromEntries(TOOL_DECLARATIONS.map((t) => [t.name, t]));
