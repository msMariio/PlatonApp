import { db, uid, buildPlanificacionVacia, type Serie } from "../../../core/db";
import type {
  CrearCarpetaArgs,
  CrearEjercicioArgs,
  CrearRutinaArgs,
  ActualizarPlanificacionSemanalArgs,
  FunctionCallArgs,
} from "./toolDefinitions";

// ── Helpers de resolución ───────────────────────────────────────────

/**
 * Busca una carpeta por ID o, si no se encuentra, por nombre.
 * Si no existe y se pasa nombre, la crea y devuelve su ID.
 */
async function resolveCarpeta(
  carpetaId: string | undefined,
  carpetaNombre: string | undefined,
): Promise<string | undefined> {
  if (carpetaId) {
    const existe = await db.carpetas.get(carpetaId);
    if (existe) return carpetaId;
  }
  if (carpetaNombre) {
    const porNombre = await db.carpetas
      .filter((c) => c.nombre.toLowerCase() === carpetaNombre!.toLowerCase())
      .first();
    if (porNombre) return porNombre.id;
    // Crear carpeta nueva
    const id = uid();
    const total = await db.carpetas.count();
    await db.carpetas.add({ id, nombre: carpetaNombre, order: total, collapsed: false });
    return id;
  }
  return undefined;
}

/**
 * Busca un ejercicio por ID o, si no se encuentra, por nombre.
 * Si no existe y se pasa nombre, lo crea con valores por defecto y devuelve su ID.
 */
async function resolveEjercicio(
  ejercicioId: string | undefined,
  ejercicioNombre: string | undefined,
): Promise<string | undefined> {
  if (ejercicioId) {
    const existe = await db.ejercicios.get(ejercicioId);
    if (existe) return ejercicioId;
  }
  if (ejercicioNombre) {
    const porNombre = await db.ejercicios
      .filter((e) => e.nombre.toLowerCase() === ejercicioNombre!.toLowerCase())
      .first();
    if (porNombre) return porNombre.id;
    // Crear ejercicio nuevo con valores por defecto
    const id = uid();
    await db.ejercicios.add({
      id,
      nombre: ejercicioNombre,
      grupoMuscular: "fullbody",
      tipo: "fuerza",
    });
    return id;
  }
  return undefined;
}

/**
 * Busca una rutina por ID o por nombre.
 */
async function resolveRutina(
  rutinaId: string | null | undefined,
  rutinaNombre?: string,
): Promise<string | null> {
  if (rutinaId) {
    const existe = await db.rutinas.get(rutinaId);
    if (existe) return rutinaId;
  }
  if (rutinaNombre) {
    const porNombre = await db.rutinas
      .filter((r) => r.nombre.toLowerCase() === rutinaNombre!.toLowerCase())
      .first();
    if (porNombre) return porNombre.id;
  }
  return null;
}

// ── Ejecutores por herramienta ──────────────────────────────────────

async function ejecutarCrearCarpeta(args: CrearCarpetaArgs): Promise<{ id: string; nombre: string }> {
  const id = uid();
  const total = await db.carpetas.count();
  await db.carpetas.add({ id, nombre: args.nombre, order: total, collapsed: false });
  return { id, nombre: args.nombre };
}

async function ejecutarCrearEjercicio(args: CrearEjercicioArgs): Promise<{ id: string; nombre: string; grupoMuscular: string }> {
  const id = uid();
  await db.ejercicios.add({
    id,
    nombre: args.nombre,
    grupoMuscular: args.grupoMuscular,
    descripcion: args.descripcion,
    tipo: args.tipo ?? "fuerza",
  });
  return { id, nombre: args.nombre, grupoMuscular: args.grupoMuscular };
}

async function ejecutarCrearRutina(args: CrearRutinaArgs): Promise<{
  id: string;
  nombre: string;
  ejerciciosCount: number;
  ejerciciosCreados: string[];
}> {
  // Resolver carpeta si se especifica
  const carpetaId = await resolveCarpeta(args.carpetaId, args.carpetaNombre);

  // Resolver ejercicios
  const ejerciciosCreados: string[] = [];
  const ejerciciosResueltos = await Promise.all(
    args.ejercicios.map(async (ej) => {
      const eId = await resolveEjercicio(ej.ejercicioId, ej.ejercicioNombre);
      if (eId && !ej.ejercicioId) {
        ejerciciosCreados.push(ej.ejercicioNombre ?? eId);
      }
      return { ...ej, resolvedId: eId };
    }),
  );

  // Filtrar ejercicios sin resolver (no debería pasar porque los creamos)
  const ejerciciosValidos = ejerciciosResueltos.filter((e) => e.resolvedId);

  // Construir las series según el tipo de ejercicio
  const rutinaId = uid();

  // Calcular orden: contar rutinas en el mismo contenedor (carpeta o root)
  const allRutinas = await db.rutinas.toArray();
  const order = allRutinas.filter(
    (r) => (r.carpetaId ?? undefined) === (carpetaId ?? undefined),
  ).length;

  const ejerciciosEnRutina = ejerciciosValidos.map((ej, idx) => {
    const defaultSerie = (): Serie => {
      if (ej.duracionObjetivoMinutos) {
        return { duracionObjetivoMinutos: ej.duracionObjetivoMinutos };
      }
      if (ej.distanciaObjetivoKm) {
        return { distanciaObjetivoKm: ej.distanciaObjetivoKm };
      }
      return {
        repsObjetivo: ej.repsObjetivo ?? 8,
        pesoObjetivo: ej.pesoObjetivo,
        notas: ej.descansoMinutos != null ? `Descanso: ${ej.descansoMinutos} min` : undefined,
      };
    };

    return {
      id: uid(),
      ejercicioId: ej.resolvedId!,
      series: Array.from({ length: ej.series }, () => defaultSerie()),
      notas: ej.notas,
      order: idx,
    };
  });

  await db.rutinas.add({
    id: rutinaId,
    nombre: args.nombre,
    descripcion: args.descripcion ?? "",
    carpetaId,
    ejercicios: ejerciciosEnRutina,
    order,
    createdAt: new Date().toISOString(),
  });

  return {
    id: rutinaId,
    nombre: args.nombre,
    ejerciciosCount: ejerciciosEnRutina.length,
    ejerciciosCreados,
  };
}

async function ejecutarActualizarPlanificacionSemanal(
  args: ActualizarPlanificacionSemanalArgs,
): Promise<{ diasModificados: string[]; cambios: Record<string, string | null> }> {
  let plan = await db.planificacionSemanal.get("default");

  if (!plan) {
    // Crear planificación vacía si no existe
    plan = buildPlanificacionVacia("default");
    await db.planificacionSemanal.put(plan);
  }

  const cambios: Record<string, string | null> = {};
  const diasModificados: string[] = [];

  for (const [dia, rutinaIdOrName] of Object.entries(args.dias)) {
    if (dia in plan.dias) {
      // Resolver rutina: si es un ID válido (existe en DB), usarlo.
      // Si no, intentar buscar por nombre. null = día de descanso.
      let resolvedId: string | null = null;
      if (typeof rutinaIdOrName === "string" && rutinaIdOrName.trim().length > 0) {
        resolvedId = await resolveRutina(rutinaIdOrName, rutinaIdOrName);
      }

      plan.dias[dia as keyof typeof plan.dias] = {
        rutinaId: resolvedId,
        activo: resolvedId !== null,
      };
      diasModificados.push(dia);
      cambios[dia] = resolvedId;
    }
  }

  await db.planificacionSemanal.put(plan);

  return { diasModificados, cambios };
}

// ── Entry point ──────────────────────────────────────────────────────

export interface ToolExecutionResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Ejecuta una llamada a función confirmada por el usuario.
 * Devuelve un resultado estructurado con mensaje legible.
 */
export async function executeFunctionCall(
  call: FunctionCallArgs,
): Promise<ToolExecutionResult> {
  try {
    switch (call.name) {
      case "crear_carpeta": {
        const result = await ejecutarCrearCarpeta(call.args);
        return {
          success: true,
          message: `Carpeta "${result.nombre}" creada correctamente.`,
          data: result as unknown as Record<string, unknown>,
        };
      }
      case "crear_ejercicio": {
        const result = await ejecutarCrearEjercicio(call.args);
        return {
          success: true,
          message: `Ejercicio "${result.nombre}" (${result.grupoMuscular}) añadido al catálogo.`,
          data: result as unknown as Record<string, unknown>,
        };
      }
      case "crear_rutina": {
        const result = await ejecutarCrearRutina(call.args);
        let extra = "";
        if (result.ejerciciosCreados.length > 0) {
          extra = ` Se crearon ${result.ejerciciosCreados.length} ejercicios nuevos: ${result.ejerciciosCreados.join(", ")}.`;
        }
        return {
          success: true,
          message: `Rutina "${result.nombre}" creada con ${result.ejerciciosCount} ejercicios.${extra}`,
          data: result as unknown as Record<string, unknown>,
        };
      }
      case "actualizar_planificacion_semanal": {
        const result = await ejecutarActualizarPlanificacionSemanal(call.args);
        return {
          success: true,
          message: `Planificación semanal actualizada (${result.diasModificados.length} días modificados).`,
          data: result as unknown as Record<string, unknown>,
        };
      }
      default:
        return {
          success: false,
          message: `Herramienta desconocida: ${(call as FunctionCallArgs).name}`,
        };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Error desconocido";
    return {
      success: false,
      message: `Error al ejecutar ${call.name}: ${errMsg}`,
    };
  }
}
