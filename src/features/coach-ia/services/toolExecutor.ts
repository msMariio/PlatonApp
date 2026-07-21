import { db, uid, buildPlanificacionVacia, type Serie, type PesoDiario, type SerieReal, type EjercicioReal } from "../../../core/db";
import { CUSTOM_LIBRE_ID } from "../../training-logger/data";
import type {
  CrearCarpetaArgs,
  CrearEjercicioArgs,
  CrearRutinaArgs,
  ActualizarPlanificacionSemanalArgs,
  EditarRutinaArgs,
  EditarEjercicioArgs,
  EditarCarpetaArgs,
  RegistrarPesoArgs,
  EditarPesoArgs,
  RegistrarEntrenamientoArgs,
  EjercicioRealArgs,
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

async function ejecutarEditarCarpeta(args: EditarCarpetaArgs): Promise<{ id: string; nombre: string }> {
  let encontrada = args.carpetaId ? await db.carpetas.get(args.carpetaId) : null;
  if (!encontrada && args.carpetaNombre) {
    encontrada = await db.carpetas
      .filter((c) => c.nombre.toLowerCase() === args.carpetaNombre!.toLowerCase())
      .first();
  }
  if (!encontrada) throw new Error("Carpeta no encontrada. Indica el ID o nombre de la carpeta a editar.");
  await db.carpetas.update(encontrada.id, { nombre: args.nombre! });
  return { id: encontrada.id, nombre: args.nombre! };
}

async function ejecutarEditarEjercicio(args: EditarEjercicioArgs): Promise<{ id: string; nombre: string }> {
  let encontrado = args.ejercicioId ? await db.ejercicios.get(args.ejercicioId) : null;
  if (!encontrado && args.ejercicioNombre) {
    encontrado = await db.ejercicios
      .filter((e) => e.nombre.toLowerCase() === args.ejercicioNombre!.toLowerCase())
      .first();
  }
  if (!encontrado) throw new Error("Ejercicio no encontrado. Indica el ID o nombre del ejercicio a editar.");

  const cambios: Record<string, unknown> = {};
  if (args.nombre !== undefined) cambios.nombre = args.nombre;
  if (args.grupoMuscular !== undefined) cambios.grupoMuscular = args.grupoMuscular;
  if (args.descripcion !== undefined) cambios.descripcion = args.descripcion;
  if (args.tipo !== undefined) cambios.tipo = args.tipo;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.ejercicios.update(encontrado.id, cambios as any);
  return { id: encontrado.id, nombre: (args.nombre ?? encontrado.nombre) as string };
}

async function ejecutarEditarRutina(args: EditarRutinaArgs): Promise<{ id: string; nombre: string }> {
  let encontrada = args.rutinaId ? await db.rutinas.get(args.rutinaId) : null;
  if (!encontrada && args.rutinaNombre) {
    encontrada = await db.rutinas
      .filter((r) => r.nombre.toLowerCase() === args.rutinaNombre!.toLowerCase())
      .first();
  }
  if (!encontrada) throw new Error("Rutina no encontrada. Indica el ID o nombre de la rutina a editar.");

  const cambios: Record<string, unknown> = {};
  if (args.nombre !== undefined) cambios.nombre = args.nombre;
  if (args.descripcion !== undefined) cambios.descripcion = args.descripcion;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.rutinas.update(encontrada.id, cambios as any);
  return { id: encontrada.id, nombre: (args.nombre ?? encontrada.nombre) as string };
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

async function ejecutarRegistrarPeso(args: RegistrarPesoArgs): Promise<{ valor: number; fecha: string; hora: string }> {
  const fecha = args.fecha ?? new Date().toISOString().slice(0, 10);
  const hora = args.hora ?? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  await db.pesos.add({
    fecha,
    hora,
    valor: args.valor,
  });

  return { valor: args.valor, fecha, hora };
}

async function ejecutarEditarPeso(args: EditarPesoArgs): Promise<{ valor: number; fecha: string; hora: string }> {
  // Buscar por fecha (y hora si se proporciona)
  let encontrado: PesoDiario | undefined;
  if (args.hora) {
    encontrado = await db.pesos
      .filter((p) => p.fecha === args.fecha && p.hora === args.hora)
      .first();
  } else {
    // Sin hora: buscar cualquier registro de esa fecha
    encontrado = await db.pesos
      .filter((p) => p.fecha === args.fecha)
      .first();
  }

  if (!encontrado) {
    throw new Error(`No se encontró ningún registro de peso en la fecha ${args.fecha}${args.hora ? ` a las ${args.hora}` : ""}.`);
  }

  await db.pesos.update(encontrado.id!, { valor: args.nuevoValor! });

  return {
    valor: args.nuevoValor!,
    fecha: encontrado.fecha,
    hora: encontrado.hora,
  };
}

/**
 * Convierte una serie (plantilla) a SerieReal, copiando valores objetivo como reales.
 */
function serieToSerieReal(s: Serie): SerieReal {
  const real: SerieReal = { completado: true };
  if (s.repsObjetivo != null) real.reps = s.repsObjetivo;
  if (s.pesoObjetivo != null) real.peso = s.pesoObjetivo;
  if (s.rpeObjetivo != null) real.rpe = s.rpeObjetivo;
  if (s.duracionObjetivoMinutos != null) real.duracionMinutos = s.duracionObjetivoMinutos;
  if (s.distanciaObjetivoKm != null) real.distanciaKm = s.distanciaObjetivoKm;
  return real;
}

async function ejecutarRegistrarEntrenamiento(
  args: RegistrarEntrenamientoArgs,
): Promise<{
  fecha: string;
  tipo: "rutina" | "libre";
  rutinaNombre?: string;
  ejerciciosCount: number;
  ejerciciosCreados: string[];
}> {
  const fecha = args.fecha ?? new Date().toISOString().slice(0, 10);
  const ejerciciosCreados: string[] = [];

  let ejerciciosReales: EjercicioReal[];
  let rutinaId: string;
  let rutinaSnapshot: string | undefined;
  let tipo: "rutina" | "libre";

  if (args.rutinaId || args.rutinaNombre) {
    // ── Caso: rutina completada ──────────────────────────────────
    const rid = await resolveRutina(args.rutinaId ?? null, args.rutinaNombre);
    if (!rid) {
      throw new Error(
        `Rutina "${args.rutinaNombre ?? args.rutinaId}" no encontrada.`,
      );
    }

    const rutina = await db.rutinas.get(rid);
    if (!rutina) {
      throw new Error(`Rutina con ID "${rid}" no encontrada en la base de datos.`);
    }

    rutinaId = rutina.id;
    rutinaSnapshot = rutina.nombre;
    tipo = "rutina";

    // Convertir ejercicios de la plantilla a EjercicioReal
    ejerciciosReales = rutina.ejercicios.map((ej) => ({
      ejercicioId: ej.ejercicioId,
      series: ej.series.map((s) => serieToSerieReal(s)),
    }));
  } else if (args.ejercicios && args.ejercicios.length > 0) {
    // ── Caso: entrenamiento libre ────────────────────────────────
    // Resolver cada ejercicio
    const resueltos = await Promise.all(
      args.ejercicios.map(async (ej: EjercicioRealArgs) => {
        const eId = await resolveEjercicio(ej.ejercicioId, ej.ejercicioNombre);
        if (eId && !ej.ejercicioId) {
          ejerciciosCreados.push(ej.ejercicioNombre ?? eId);
        }
        return { ...ej, resolvedId: eId };
      }),
    );

    const validos = resueltos.filter((e) => e.resolvedId);

    ejerciciosReales = validos.map((ej) => ({
      ejercicioId: ej.resolvedId!,
      series: ej.series.map((s) => ({
        completado: s.completado ?? true,
        peso: s.peso,
        reps: s.reps,
        rpe: s.rpe,
        duracionMinutos: s.duracionMinutos,
        distanciaKm: s.distanciaKm,
      })),
    }));

    // Usar el mismo ID que TrainingLoggerView para entrenamientos libres
    rutinaId = CUSTOM_LIBRE_ID;
    rutinaSnapshot = "Entrenamiento libre";
    tipo = "libre";
  } else {
    throw new Error(
      "Debes indicar una rutina (rutinaId/rutinaNombre) o una lista de ejercicios.",
    );
  }

  await db.logsEntrenamientos.add({
    fecha,
    rutinaId,
    rutinaSnapshot,
    completado: true,
    notas: args.notas,
    ejercicios: ejerciciosReales,
  });

  return {
    fecha,
    tipo,
    rutinaNombre: rutinaSnapshot,
    ejerciciosCount: ejerciciosReales.length,
    ejerciciosCreados,
  };
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
      case "editar_carpeta": {
        const result = await ejecutarEditarCarpeta(call.args);
        return {
          success: true,
          message: `Carpeta renombrada a "${result.nombre}".`,
          data: result as unknown as Record<string, unknown>,
        };
      }
      case "editar_ejercicio": {
        const result = await ejecutarEditarEjercicio(call.args);
        return {
          success: true,
          message: `Ejercicio "${result.nombre}" actualizado correctamente.`,
          data: result as unknown as Record<string, unknown>,
        };
      }
      case "editar_rutina": {
        const result = await ejecutarEditarRutina(call.args);
        return {
          success: true,
          message: `Rutina "${result.nombre}" actualizada correctamente.`,
          data: result as unknown as Record<string, unknown>,
        };
      }
      case "registrar_peso": {
        const result = await ejecutarRegistrarPeso(call.args);
        return {
          success: true,
          message: `Peso registrado: ${result.valor} kg (${result.fecha} ${result.hora}).`,
          data: result as unknown as Record<string, unknown>,
        };
      }
      case "editar_peso": {
        const result = await ejecutarEditarPeso(call.args);
        return {
          success: true,
          message: `Peso actualizado: ${result.valor} kg (${result.fecha} ${result.hora}).`,
          data: result as unknown as Record<string, unknown>,
        };
      }
      case "registrar_entrenamiento": {
        const result = await ejecutarRegistrarEntrenamiento(call.args);
        const tipo = result.tipo === "rutina"
          ? `Rutina "${result.rutinaNombre}"`
          : "Entrenamiento libre";
        let extra = "";
        if (result.ejerciciosCreados.length > 0) {
          extra = ` Se crearon ${result.ejerciciosCreados.length} ejercicios nuevos: ${result.ejerciciosCreados.join(", ")}.`;
        }
        return {
          success: true,
          message: `${tipo} registrado (${result.fecha}) con ${result.ejerciciosCount} ejercicios.${extra}`,
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
