import type { GrupoMuscular, TipoEjercicio, DiaSemana } from "../../../core/db";

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

export interface EjercicioAQuitarArgs {
  ejercicioId?: string;
  ejercicioNombre?: string;
}

export interface EjercicioAReordenarArgs {
  ejercicioId?: string;
  ejercicioNombre?: string;
}

export interface ReordenarRutinaArgs {
  rutinaId?: string;
  rutinaNombre?: string;
  /** Lista de ejercicios en el nuevo orden deseado. Deben incluirse TODOS los ejercicios actuales de la rutina. */
  ordenEjercicios: EjercicioAReordenarArgs[];
}

export interface EditarRutinaArgs {
  rutinaId?: string;
  rutinaNombre?: string;
  nombre?: string;
  descripcion?: string;
  /** Ejercicios a añadir a la rutina (se añaden al final). */
  ejerciciosAgregar?: EjercicioEnRutinaArgs[];
  /** Ejercicios a quitar de la rutina (se busca por ID o nombre exacto). */
  ejerciciosQuitar?: EjercicioAQuitarArgs[];
}

export interface EditarEjercicioArgs {
  ejercicioId?: string;
  ejercicioNombre?: string;
  nombre?: string;
  grupoMuscular?: GrupoMuscular;
  descripcion?: string;
  tipo?: TipoEjercicio;
}

export interface EditarCarpetaArgs {
  carpetaId?: string;
  carpetaNombre?: string;
  nombre?: string;
}

export interface RegistrarPesoArgs {
  valor: number;
  fecha?: string;
  hora?: string;
}

export interface EditarPesoArgs {
  fecha: string;
  hora?: string;
  nuevoValor?: number;
}

export interface SerieRealArgs {
  peso?: number;
  reps?: number;
  completado?: boolean;
  rpe?: number;
  duracionMinutos?: number;
  distanciaKm?: number;
}

export interface EjercicioRealArgs {
  ejercicioId?: string;
  ejercicioNombre?: string;
  series: SerieRealArgs[];
}

export interface RegistrarEntrenamientoArgs {
  fecha?: string;
  rutinaId?: string;
  rutinaNombre?: string;
  ejercicios?: EjercicioRealArgs[];
  notas?: string;
}

export interface SerieRealModificarArgs {
  /** Índice de la serie a modificar (0-based). Obligatorio para identificar la serie. */
  serieIdx: number;
  peso?: number;
  reps?: number;
  completado?: boolean;
  rpe?: number;
  duracionMinutos?: number;
  distanciaKm?: number;
}

export interface EditarEntrenamientoArgs {
  /** Fecha del entrenamiento a editar (YYYY-MM-DD). Obligatorio para encontrar el log. */
  fecha: string;
  rutinaId?: string;
  rutinaNombre?: string;
  /** Ejercicios a añadir al entrenamiento existente (con series reales completadas). */
  ejerciciosAgregar?: EjercicioRealArgs[];
  /** Ejercicios a quitar del entrenamiento (por ID o nombre del ejercicio). */
  ejerciciosQuitar?: EjercicioAQuitarArgs[];
  /** Modificar series de ejercicios ya existentes en el log. Identifica el ejercicio por ID/nombre y especifica qué series modificar por su índice. */
  ejerciciosModificar?: {
    ejercicioId?: string;
    ejercicioNombre?: string;
    series: SerieRealModificarArgs[];
  }[];
  notas?: string;
}

export type FunctionCallArgs =
  | { name: "crear_carpeta"; args: CrearCarpetaArgs }
  | { name: "crear_ejercicio"; args: CrearEjercicioArgs }
  | { name: "crear_rutina"; args: CrearRutinaArgs }
  | {
      name: "actualizar_planificacion_semanal";
      args: ActualizarPlanificacionSemanalArgs;
    }
  | { name: "editar_rutina"; args: EditarRutinaArgs }
  | { name: "editar_ejercicio"; args: EditarEjercicioArgs }
  | { name: "editar_carpeta"; args: EditarCarpetaArgs }
  | { name: "registrar_peso"; args: RegistrarPesoArgs }
  | { name: "editar_peso"; args: EditarPesoArgs }
  | { name: "registrar_entrenamiento"; args: RegistrarEntrenamientoArgs }
  | { name: "editar_entrenamiento"; args: EditarEntrenamientoArgs }
  | { name: "reordenar_rutina"; args: ReordenarRutinaArgs };

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
          description:
            "Nombre descriptivo de la carpeta (ej: 'Empuje', 'Tren Superior').",
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
          description:
            "Nombre del ejercicio (ej: 'Press Banca', 'Sentadilla').",
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
          description:
            "Descripción opcional, técnica o notas sobre el ejercicio.",
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
          description:
            "Descripción opcional de la rutina (objetivo, notas, etc.).",
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
          description: "Lista ordenada de ejercicios que componen la rutina.",
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
                description:
                  "Número de series para este ejercicio (ej: 3, 4, 5).",
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
                description:
                  "Descanso entre series en minutos (opcional, por defecto 2).",
              },
              duracionObjetivoMinutos: {
                type: "number",
                description:
                  "Duración objetivo en minutos. Para ejercicios de cardio/tiempo.",
              },
              distanciaObjetivoKm: {
                type: "number",
                description:
                  "Distancia objetivo en km. Para ejercicios de cardio.",
              },
              notas: {
                type: "string",
                description:
                  "Notas adicionales para este ejercicio (opcional).",
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
              description:
                "ID de la rutina para el lunes, o null para descanso.",
            },
            martes: {
              type: "string",
              nullable: true,
              description:
                "ID de la rutina para el martes, o null para descanso.",
            },
            miercoles: {
              type: "string",
              nullable: true,
              description:
                "ID de la rutina para el miércoles, o null para descanso.",
            },
            jueves: {
              type: "string",
              nullable: true,
              description:
                "ID de la rutina para el jueves, o null para descanso.",
            },
            viernes: {
              type: "string",
              nullable: true,
              description:
                "ID de la rutina para el viernes, o null para descanso.",
            },
            sabado: {
              type: "string",
              nullable: true,
              description:
                "ID de la rutina para el sábado, o null para descanso.",
            },
            domingo: {
              type: "string",
              nullable: true,
              description:
                "ID de la rutina para el domingo, o null para descanso.",
            },
          },
        },
      },
      required: ["dias"],
    },
  },
  {
    name: "editar_rutina",
    description:
      "Edita una rutina existente: cambiar nombre/descripción, añadir ejercicios o quitar ejercicios. " +
      "Úsala cuando el atleta quiera modificar una rutina ya creada (renombrar, añadir/quitar ejercicios).",
    parameters: {
      type: "object",
      properties: {
        rutinaId: {
          type: "string",
          description:
            "ID de la rutina a editar. Si no se conoce, usa rutinaNombre.",
        },
        rutinaNombre: {
          type: "string",
          description:
            "Nombre actual de la rutina a editar (se buscará por nombre exacto).",
        },
        nombre: {
          type: "string",
          description: "Nuevo nombre para la rutina.",
        },
        descripcion: {
          type: "string",
          description: "Nueva descripción para la rutina.",
        },
        ejerciciosAgregar: {
          type: "array",
          description:
            "Ejercicios a añadir a la rutina existente. Se añaden al final de la lista actual. " +
            "Cada ejercicio debe tener al menos 'series' y 'ejercicioId' o 'ejercicioNombre'.",
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
                description: "Número de series para este ejercicio.",
              },
              repsObjetivo: {
                type: "integer",
                description: "Repeticiones objetivo por serie.",
              },
              pesoObjetivo: {
                type: "number",
                description: "Peso objetivo en kg.",
              },
              descansoMinutos: {
                type: "number",
                description: "Descanso entre series en minutos.",
              },
              duracionObjetivoMinutos: {
                type: "number",
                description: "Duración objetivo en minutos (cardio/tiempo).",
              },
              distanciaObjetivoKm: {
                type: "number",
                description: "Distancia objetivo en km (cardio).",
              },
              notas: {
                type: "string",
                description:
                  "Notas adicionales para este ejercicio (opcional).",
              },
            },
            required: ["series"],
          },
        },
        ejerciciosQuitar: {
          type: "array",
          description:
            "Ejercicios a quitar de la rutina. Identifica cada uno por su ejercicioId o ejercicioNombre (nombre exacto).",
          items: {
            type: "object",
            properties: {
              ejercicioId: {
                type: "string",
                description: "ID del ejercicio a quitar.",
              },
              ejercicioNombre: {
                type: "string",
                description: "Nombre exacto del ejercicio a quitar.",
              },
            },
          },
        },
      },
      required: [],
    },
  },
  {
    name: "editar_ejercicio",
    description:
      "Edita un ejercicio del catálogo maestro. " +
      "Úsala para renombrar, cambiar el grupo muscular, tipo o descripción de un ejercicio.",
    parameters: {
      type: "object",
      properties: {
        ejercicioId: {
          type: "string",
          description:
            "ID del ejercicio a editar. Si no se conoce, usa ejercicioNombre.",
        },
        ejercicioNombre: {
          type: "string",
          description:
            "Nombre actual del ejercicio a editar (se buscará por nombre exacto).",
        },
        nombre: {
          type: "string",
          description: "Nuevo nombre para el ejercicio.",
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
          description: "Nuevo grupo muscular principal.",
        },
        descripcion: {
          type: "string",
          description: "Nueva descripción del ejercicio.",
        },
        tipo: {
          type: "string",
          enum: ["fuerza", "cardio", "tiempo", "calistenia"],
          description: "Nuevo tipo de ejercicio.",
        },
      },
      required: [],
    },
  },
  {
    name: "editar_carpeta",
    description:
      "Renombra una carpeta existente. " +
      "Úsala cuando el atleta quiera cambiar el nombre de una carpeta de rutinas.",
    parameters: {
      type: "object",
      properties: {
        carpetaId: {
          type: "string",
          description:
            "ID de la carpeta a editar. Si no se conoce, usa carpetaNombre.",
        },
        carpetaNombre: {
          type: "string",
          description:
            "Nombre actual de la carpeta a editar (se buscará por nombre exacto).",
        },
        nombre: {
          type: "string",
          description: "Nuevo nombre para la carpeta.",
        },
      },
      required: ["nombre"],
    },
  },
  {
    name: "registrar_peso",
    description:
      "Registra un nuevo peso corporal del atleta. " +
      "Úsala cuando el atleta quiera anotar su peso (ej: 'peso 78.5 kg', 'anota mi peso de hoy'). " +
      "Por defecto, fecha y hora son hoy/ahora si no se especifican.",
    parameters: {
      type: "object",
      properties: {
        valor: {
          type: "number",
          description: "Peso corporal en kg (ej: 78.5).",
        },
        fecha: {
          type: "string",
          description:
            "Fecha del registro en formato YYYY-MM-DD. Por defecto, hoy.",
        },
        hora: {
          type: "string",
          description:
            "Hora del registro en formato HH:MM. Por defecto, ahora.",
        },
      },
      required: ["valor"],
    },
  },
  {
    name: "editar_peso",
    description:
      "Modifica un registro de peso existente. " +
      "Busca el registro por fecha (y opcionalmente hora) y actualiza su valor. " +
      "Úsala cuando el atleta quiera corregir un peso (ej: 'cambia mi peso del lunes a 79 kg').",
    parameters: {
      type: "object",
      properties: {
        fecha: {
          type: "string",
          description: "Fecha del registro a modificar en formato YYYY-MM-DD.",
        },
        hora: {
          type: "string",
          description:
            "Hora del registro a modificar en formato HH:MM. Si no se especifica, se busca el registro más cercano a esa fecha.",
        },
        nuevoValor: {
          type: "number",
          description: "Nuevo valor del peso en kg.",
        },
      },
      required: ["fecha", "nuevoValor"],
    },
  },
  {
    name: "registrar_entrenamiento",
    description:
      "Registra un entrenamiento completado en el historial del atleta. " +
      "Puede ser una rutina completa (pasa rutinaId/rutinaNombre) o un entrenamiento libre " +
      "con ejercicios específicos (pasa ejercicios[]). " +
      "Úsala cuando el atleta quiera anotar que ha entrenado (ej: 'hoy hice Push A', " +
      "'ayer hice press banca 3x10 con 60kg y sentadilla 4x8 con 100kg').",
    parameters: {
      type: "object",
      properties: {
        fecha: {
          type: "string",
          description:
            "Fecha del entrenamiento en formato YYYY-MM-DD. Por defecto, hoy.",
        },
        rutinaId: {
          type: "string",
          description:
            "ID de la rutina completada. Si no se conoce, usa rutinaNombre.",
        },
        rutinaNombre: {
          type: "string",
          description:
            "Nombre de la rutina completada (se buscará por nombre exacto).",
        },
        ejercicios: {
          type: "array",
          description:
            "Ejercicios realizados (para entrenamiento libre). Cada ejercicio debe tener su nombre/ID y las series completadas.",
          items: {
            type: "object",
            properties: {
              ejercicioId: {
                type: "string",
                description:
                  "ID del ejercicio. Si no se conoce, usa ejercicioNombre.",
              },
              ejercicioNombre: {
                type: "string",
                description:
                  "Nombre del ejercicio. Si no existe en el catálogo, se creará automáticamente.",
              },
              series: {
                type: "array",
                description: "Series realizadas para este ejercicio.",
                items: {
                  type: "object",
                  properties: {
                    peso: {
                      type: "number",
                      description: "Peso usado en kg.",
                    },
                    reps: {
                      type: "integer",
                      description: "Repeticiones completadas.",
                    },
                    completado: {
                      type: "boolean",
                      description:
                        "Si la serie se completó (por defecto true).",
                    },
                    rpe: {
                      type: "number",
                      description: "RPE percibido (1-10).",
                    },
                    duracionMinutos: {
                      type: "number",
                      description:
                        "Duración en minutos (para ejercicios de cardio/tiempo).",
                    },
                    distanciaKm: {
                      type: "number",
                      description:
                        "Distancia en km (para ejercicios de cardio).",
                    },
                  },
                },
              },
            },
            required: ["series"],
          },
        },
        notas: {
          type: "string",
          description: "Notas adicionales sobre el entrenamiento.",
        },
      },
      required: [],
    },
  },
  {
    name: "editar_entrenamiento",
    description:
      "Edita un entrenamiento YA REGISTRADO en el historial. " +
      "NO crea un nuevo entrenamiento; modifica uno existente. " +
      "Permite añadir ejercicios, quitar ejercicios, o modificar series de ejercicios existentes. " +
      "Úsala cuando el atleta quiera cambiar algo de un entreno que ya anotó " +
      "(ej: 'añade 20 min de caminar al entreno de hoy', " +
      "'quita el press banca del entreno del lunes', " +
      "'en el entreno de ayer cambia la primera serie de sentadilla a 100kg'). " +
      "Busca el log por fecha y rutinaId/rutinaNombre.",
    parameters: {
      type: "object",
      properties: {
        fecha: {
          type: "string",
          description:
            "Fecha del entrenamiento a editar en formato YYYY-MM-DD.",
        },
        rutinaId: {
          type: "string",
          description:
            "ID de la rutina del entrenamiento a editar. Si no se conoce, usa rutinaNombre.",
        },
        rutinaNombre: {
          type: "string",
          description:
            "Nombre de la rutina del entrenamiento a editar (se buscará por nombre exacto).",
        },
        ejerciciosAgregar: {
          type: "array",
          description:
            "Ejercicios a añadir al entrenamiento, con sus series reales completadas.",
          items: {
            type: "object",
            properties: {
              ejercicioId: {
                type: "string",
                description: "ID del ejercicio. Si no se conoce, usa ejercicioNombre.",
              },
              ejercicioNombre: {
                type: "string",
                description: "Nombre del ejercicio. Si no existe se creará automáticamente.",
              },
              series: {
                type: "array",
                description: "Series realizadas.",
                items: {
                  type: "object",
                  properties: {
                    peso: { type: "number", description: "Peso en kg." },
                    reps: { type: "integer", description: "Repeticiones." },
                    completado: { type: "boolean", description: "Serie completada." },
                    duracionMinutos: { type: "number", description: "Duración en minutos." },
                    distanciaKm: { type: "number", description: "Distancia en km." },
                  },
                },
              },
            },
            required: ["series"],
          },
        },
        ejerciciosQuitar: {
          type: "array",
          description:
            "Ejercicios a quitar del entrenamiento. Identifica cada uno por su ejercicioId o ejercicioNombre (nombre exacto).",
          items: {
            type: "object",
            properties: {
              ejercicioId: {
                type: "string",
                description: "ID del ejercicio a quitar.",
              },
              ejercicioNombre: {
                type: "string",
                description: "Nombre exacto del ejercicio a quitar.",
              },
            },
          },
        },
        ejerciciosModificar: {
          type: "array",
          description:
            "Modificar series de ejercicios YA EXISTENTES en el log. " +
            "Identifica cada ejercicio por ID o nombre, y especifica qué series modificar por su índice (0 = primera serie). " +
            "Úsala para cambiar pesos, reps, o marcar series como completadas/no completadas.",
          items: {
            type: "object",
            properties: {
              ejercicioId: {
                type: "string",
                description: "ID del ejercicio a modificar. Si no se conoce, usa ejercicioNombre.",
              },
              ejercicioNombre: {
                type: "string",
                description: "Nombre exacto del ejercicio a modificar.",
              },
              series: {
                type: "array",
                description:
                  "Series a modificar. Cada entrada debe tener serieIdx (obligatorio) y los campos a cambiar.",
                items: {
                  type: "object",
                  properties: {
                    serieIdx: {
                      type: "integer",
                      description: "Índice de la serie a modificar (0 = primera, 1 = segunda, etc.).",
                    },
                    peso: { type: "number", description: "Nuevo peso en kg." },
                    reps: { type: "integer", description: "Nuevas repeticiones." },
                    completado: { type: "boolean", description: "Marcar serie como completada o no." },
                    rpe: { type: "number", description: "Nuevo RPE (1-10)." },
                    duracionMinutos: { type: "number", description: "Nueva duración en minutos." },
                    distanciaKm: { type: "number", description: "Nueva distancia en km." },
                  },
                  required: ["serieIdx"],
                },
              },
            },
          },
        },
        notas: {
          type: "string",
          description: "Nuevas notas para el entrenamiento (reemplaza las existentes).",
        },
      },
      required: ["fecha"],
    },
  },
  {
    name: "reordenar_rutina",
    description:
      "Reordena los ejercicios dentro de una rutina existente. " +
      "Úsala cuando el atleta quiera cambiar el orden de los ejercicios en una rutina " +
      "(ej: 'pon press banca primero en Push A', 'ordena los ejercicios así: press banca, press militar, fondos, extensiones'). " +
      "DEBES incluir TODOS los ejercicios actuales de la rutina en el nuevo orden deseado.",
    parameters: {
      type: "object",
      properties: {
        rutinaId: {
          type: "string",
          description:
            "ID de la rutina a reordenar. Si no se conoce, usa rutinaNombre.",
        },
        rutinaNombre: {
          type: "string",
          description:
            "Nombre de la rutina a reordenar (se buscará por nombre exacto).",
        },
        ordenEjercicios: {
          type: "array",
          description:
            "Lista de ejercicios en el NUEVO orden deseado. DEBES incluir TODOS los ejercicios que tiene actualmente la rutina. " +
            "Identifica cada ejercicio por su ejercicioId o ejercicioNombre (nombre exacto).",
          items: {
            type: "object",
            properties: {
              ejercicioId: {
                type: "string",
                description:
                  "ID del ejercicio. Si no se conoce, usa ejercicioNombre.",
              },
              ejercicioNombre: {
                type: "string",
                description:
                  "Nombre exacto del ejercicio.",
              },
            },
          },
        },
      },
      required: ["ordenEjercicios"],
    },
  },
];

/** Mapa nombre → declaración para búsqueda rápida. */
export const TOOLS_BY_NAME: Record<string, FunctionDeclaration> =
  Object.fromEntries(TOOL_DECLARATIONS.map((t) => [t.name, t]));
