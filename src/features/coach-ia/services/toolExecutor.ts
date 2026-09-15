import { db, uid, buildPlanificacionVacia, type Serie, type PesoDiario, type SerieReal, type EjercicioReal } from "../../../core/db";
import { CUSTOM_LIBRE_ID, actualizarLogEntrenamiento } from "../../training-logger/data";
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
  EditarEntrenamientoArgs,
  ReordenarRutinaArgs,
  EjercicioRealArgs,
  EjercicioEnRutinaArgs,
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
 * Las tools nunca crean ejercicios implícitamente: si no existe, la operación falla.
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
  }
  return undefined;
}

async function requireEjercicioId(
  ejercicioId: string | undefined,
  ejercicioNombre: string | undefined,
): Promise<string> {
  const resolvedId = await resolveEjercicio(ejercicioId, ejercicioNombre);
  if (!resolvedId) {
    throw new Error(
      `No se encontró en el catálogo el ejercicio "${ejercicioNombre ?? ejercicioId ?? "desconocido"}". ` +
      "Crea primero el ejercicio con crear_ejercicio y vuelve a intentarlo.",
    );
  }
  return resolvedId;
}

/**
 * Busca una rutina por ID o por nombre y devuelve solo el ID.
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
      .filter((r) => r.nombre.toLowerCase() === rutinaNombre!.toLowerCase() && !r.isArchived)
      .first();
    if (porNombre) return porNombre.id;
  }
  return null;
}

/**
 * Busca una rutina por ID o por nombre y devuelve el objeto completo.
 */
async function resolveRutinaFull(
  rutinaId: string | undefined,
  rutinaNombre?: string,
) {
  const id = await resolveRutina(rutinaId ?? null, rutinaNombre);
  if (!id) return null;
  return db.rutinas.get(id);
}

/**
 * Construye una Serie por defecto a partir de los argumentos de un ejercicio.
 */
function buildDefaultSerie(ej: EjercicioEnRutinaArgs): Serie {
  if (ej.duracionObjetivoMinutos) {
    return { duracionObjetivoMinutos: ej.duracionObjetivoMinutos };
  }
  if (ej.distanciaObjetivoKm) {
    return { distanciaObjetivoKm: ej.distanciaObjetivoKm };
  }
  return {
    repsMin: ej.repsMin ?? 8,
    repsMax: ej.repsMax ?? ej.repsMin ?? 8,
    pesoObjetivo: ej.pesoObjetivo,
    rpeObjetivo: ej.rpeObjetivo,
    notas:
      ej.descansoMinutos != null
        ? `Descanso: ${ej.descansoMinutos} min`
        : undefined,
  };
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

async function ejecutarEditarRutina(
  args: EditarRutinaArgs,
): Promise<{ id: string; nombre: string; ejerciciosAgregados: number; ejerciciosQuitados: number; ejerciciosModificados: number }> {
  const encontrada = await resolveRutinaFull(args.rutinaId, args.rutinaNombre);
  if (!encontrada) throw new Error("Rutina no encontrada. Indica el ID o nombre de la rutina a editar.");

  // ── Cambios de nombre/descripción ───────────────────────────────
  const cambios: Record<string, unknown> = {};
  if (args.nombre !== undefined) cambios.nombre = args.nombre;
  if (args.descripcion !== undefined) cambios.descripcion = args.descripcion;

  // ── Quitar ejercicios ───────────────────────────────────────────
  let ejercicios = [...encontrada.ejercicios];
  let ejerciciosQuitados = 0;
  let ejerciciosModificados = 0;

  if (args.ejerciciosQuitar && args.ejerciciosQuitar.length > 0) {
    const idsResueltos = await Promise.all(
      args.ejerciciosQuitar.map((eq) => requireEjercicioId(eq.ejercicioId, eq.ejercicioNombre)),
    );
    const idsFueraDeRutina = idsResueltos.filter(
      (id) => !ejercicios.some((ej) => ej.ejercicioId === id),
    );
    if (idsFueraDeRutina.length > 0) {
      throw new Error("Uno o más ejercicios a quitar no pertenecen a la rutina indicada.");
    }
    const idsSet = new Set(idsResueltos);
    const antesDeFiltrar = ejercicios.length;
    ejercicios = ejercicios.filter((ej) => !idsSet.has(ej.ejercicioId));
    ejerciciosQuitados = antesDeFiltrar - ejercicios.length;
  }

  // ── Modificar ejercicios existentes ─────────────────────────────
  if (args.ejerciciosModificar && args.ejerciciosModificar.length > 0) {
    for (const mod of args.ejerciciosModificar) {
      if (!mod.series || mod.series <= 0) continue;

      // Resolver el ejercicio a modificar
      let targetId: string | null = null;
      if (mod.ejercicioId) targetId = mod.ejercicioId;
      if (!targetId && mod.ejercicioNombre) {
        targetId = await requireEjercicioId(undefined, mod.ejercicioNombre);
      }
      if (!targetId) {
        targetId = await requireEjercicioId(mod.ejercicioId, mod.ejercicioNombre);
      }

      // Encontrar el ejercicio en la rutina
      const idx = ejercicios.findIndex((ej) => ej.ejercicioId === targetId);
      if (idx === -1) {
        throw new Error("El ejercicio a modificar no pertenece a la rutina indicada.");
      }

      // Merge: preservar valores existentes, solo sobrescribir lo que la IA pasa explícitamente
      const oldSeries = ejercicios[idx].series;
      const targetCount = mod.series;
      const nuevosSeries: Serie[] = [];

      for (let i = 0; i < targetCount; i++) {
        if (i < oldSeries.length) {
          // Serie existente: mantener valores actuales y solo sobrescribir campos explícitos
          const old = oldSeries[i];
          const merged: Serie = { ...old };

          if (mod.repsMin !== undefined) merged.repsMin = mod.repsMin;
          if (mod.repsMax !== undefined) merged.repsMax = mod.repsMax;
          if (mod.pesoObjetivo !== undefined) merged.pesoObjetivo = mod.pesoObjetivo;
          if (mod.rpeObjetivo !== undefined) merged.rpeObjetivo = mod.rpeObjetivo;
          if (mod.descansoMinutos !== undefined) {
            merged.notas = `Descanso: ${mod.descansoMinutos} min`;
          }
          // Si se pasa duracion/distancia, cambia a modo cardio/tiempo
          if (mod.duracionObjetivoMinutos !== undefined || mod.distanciaObjetivoKm !== undefined) {
            if (mod.duracionObjetivoMinutos !== undefined) merged.duracionObjetivoMinutos = mod.duracionObjetivoMinutos;
            if (mod.distanciaObjetivoKm !== undefined) merged.distanciaObjetivoKm = mod.distanciaObjetivoKm;
            // Limpiar campos de fuerza al migrar a cardio
            delete merged.repsMin;
            delete merged.repsMax;
            delete merged.pesoObjetivo;
            delete merged.rpeObjetivo;
          }

          nuevosSeries.push(merged);
        } else {
          // Nueva serie adicional: usar buildDefaultSerie con los valores pasados (o defaults)
          nuevosSeries.push(
            buildDefaultSerie({
              series: mod.series,
              repsMin: mod.repsMin,
              repsMax: mod.repsMax,
              pesoObjetivo: mod.pesoObjetivo,
              rpeObjetivo: mod.rpeObjetivo,
              duracionObjetivoMinutos: mod.duracionObjetivoMinutos,
              distanciaObjetivoKm: mod.distanciaObjetivoKm,
              descansoMinutos: mod.descansoMinutos,
            }),
          );
        }
      }

      ejercicios[idx] = { ...ejercicios[idx], series: nuevosSeries };
      ejerciciosModificados++;
    }
  }

  // ── Añadir ejercicios ───────────────────────────────────────────
  let ejerciciosAgregados = 0;

  if (args.ejerciciosAgregar && args.ejerciciosAgregar.length > 0) {
    // Resolver cada ejercicio a añadir
    const resueltos = await Promise.all(
      args.ejerciciosAgregar.map(async (ej: EjercicioEnRutinaArgs) => {
        const eId = await resolveEjercicio(ej.ejercicioId, ej.ejercicioNombre);
        return { ...ej, resolvedId: eId };
      }),
    );

    // Todos los ejercicios deben existir: no se silencian referencias inválidas.
    const noResueltos = resueltos.filter((e) => !e.resolvedId);
    if (noResueltos.length > 0) {
      const nombres = noResueltos.map((e) => e.ejercicioNombre ?? e.ejercicioId ?? "desconocido");
      throw new Error(`No se encontraron en el catálogo los ejercicios: ${nombres.join(", ")}.`);
    }

    // Construir nuevos EjercicioEnRutina con order al final
    const nextOrder = ejercicios.length;
    const nuevosEjercicios = resueltos.map((ej, idx) => {
      return {
        id: uid(),
        ejercicioId: ej.resolvedId!,
        series: Array.from({ length: ej.series }, () => buildDefaultSerie(ej)),
        notas: ej.notas,
        order: nextOrder + idx,
      };
    });

    ejercicios = [...ejercicios, ...nuevosEjercicios];
    ejerciciosAgregados = nuevosEjercicios.length;
  }

  // ── Re-numerar order ────────────────────────────────────────────
  ejercicios = ejercicios.map((ej, i) => ({ ...ej, order: i }));
  cambios.ejercicios = ejercicios;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.rutinas.update(encontrada.id, cambios as any);

  return {
    id: encontrada.id,
    nombre: (args.nombre ?? encontrada.nombre) as string,
    ejerciciosAgregados,
    ejerciciosQuitados,
    ejerciciosModificados,
  };
}

async function ejecutarReordenarRutina(
  args: ReordenarRutinaArgs,
): Promise<{ id: string; nombre: string; ordenAnterior: string[]; ordenNuevo: string[] }> {
  const encontrada = await resolveRutinaFull(args.rutinaId, args.rutinaNombre);
  if (!encontrada) throw new Error("Rutina no encontrada. Indica el ID o nombre de la rutina a reordenar.");

  const ejerciciosActuales = [...encontrada.ejercicios].sort((a, b) => a.order - b.order);

  // Construir lookup: ejercicioId → EjercicioEnRutina
  const mapa = new Map(ejerciciosActuales.map((ej) => [ej.ejercicioId, ej]));

  // Obtener catálogo de ejercicios
  const ejerciciosCatalogo = await db.ejercicios.toArray();

  // Construir lookup directo: nombre del catálogo → ID del catálogo,
  // PERO solo para ejercicios que realmente están en esta rutina.
  // Así evitamos colisiones con nombres duplicados en el catálogo global.
  const idsEnRutina = new Set(ejerciciosActuales.map((ej) => ej.ejercicioId));
  const nombreAId = new Map<string, string>();
  for (const ejCat of ejerciciosCatalogo) {
    if (idsEnRutina.has(ejCat.id)) {
      const key = ejCat.nombre.trim().toLowerCase();
      // Si hay duplicados de nombre, priorizamos el que ya teníamos
      if (!nombreAId.has(key)) {
        nombreAId.set(key, ejCat.id);
      }
    }
  }

  // También construir lookup inverso: ID → nombre (para mensajes)
  const nombres: Record<string, string> = {};
  for (const ejCat of ejerciciosCatalogo) {
    nombres[ejCat.id] = ejCat.nombre;
  }

  // Resolver cada entrada del nuevo orden a un ejercicioId
  const nuevoOrdenIds: string[] = [];
  const noEncontrados: string[] = [];

  for (const item of args.ordenEjercicios) {
    let resolvedId: string | undefined;

    // Intentar por ID
    if (item.ejercicioId && mapa.has(item.ejercicioId)) {
      resolvedId = item.ejercicioId;
    }

    // Intentar por nombre → ID (con trim para evitar espacios fantasmas)
    if (!resolvedId && item.ejercicioNombre) {
      const nombreBuscado = item.ejercicioNombre.trim().toLowerCase();
      const idPorNombre = nombreAId.get(nombreBuscado);
      if (idPorNombre && mapa.has(idPorNombre)) {
        resolvedId = idPorNombre;
      }
      // Fallback: búsqueda por substring si el nombre exacto no coincide
      if (!resolvedId) {
        for (const [catNombre, catId] of nombreAId) {
          if (catNombre.includes(nombreBuscado) || nombreBuscado.includes(catNombre)) {
            resolvedId = catId;
            break;
          }
        }
      }
    }

    if (resolvedId) {
      nuevoOrdenIds.push(resolvedId);
    } else {
      noEncontrados.push(item.ejercicioNombre ?? item.ejercicioId ?? "desconocido");
    }
  }

  if (noEncontrados.length > 0) {
    throw new Error(
      `No se encontraron en la rutina los ejercicios: ${noEncontrados.join(", ")}. ` +
      "Verifica que los nombres/IDs sean correctos y que pertenezcan a esta rutina.",
    );
  }

  // Guard: detectar IDs duplicados en el nuevo orden
  if (new Set(nuevoOrdenIds).size !== nuevoOrdenIds.length) {
    throw new Error(
      "El nuevo orden contiene ejercicios duplicados. Cada ejercicio debe aparecer exactamente una vez.",
    );
  }

  // Verificar que todos los ejercicios de la rutina estén en el nuevo orden
  const idsFaltantes = ejerciciosActuales
    .filter((ej) => !nuevoOrdenIds.includes(ej.ejercicioId))
    .map((ej) => ej.ejercicioId);

  if (idsFaltantes.length > 0) {
    const nombresFaltantes = idsFaltantes.map((id) => nombres[id] ?? id).join(", ");
    throw new Error(
      `Faltan ejercicios en el nuevo orden. Debes incluir TODOS los ejercicios de la rutina. ` +
      `Faltan: ${nombresFaltantes}.`,
    );
  }

  // Construir el nuevo array en el orden especificado, reasignando order
  const ordenAnterior = ejerciciosActuales.map((ej) => ej.ejercicioId);
  const ejerciciosReordenados = nuevoOrdenIds.map((ejId, idx) => {
    const ej = mapa.get(ejId)!;
    return { ...ej, order: idx };
  });

  await db.rutinas.update(encontrada.id, { ejercicios: ejerciciosReordenados });

  return {
    id: encontrada.id,
    nombre: encontrada.nombre,
    ordenAnterior: ordenAnterior.map((id) => nombres[id] ?? id),
    ordenNuevo: nuevoOrdenIds.map((id) => nombres[id] ?? id),
  };
}

async function ejecutarCrearEjercicio(args: CrearEjercicioArgs): Promise<{ id: string; nombre: string; grupoMuscular: string; creado: boolean }> {
  // Buscar duplicado por nombre (case-insensitive) antes de crear
  const existente = await db.ejercicios
    .filter((e) => e.nombre.toLowerCase() === args.nombre.toLowerCase())
    .first();

  if (existente) {
    return {
      id: existente.id,
      nombre: existente.nombre,
      grupoMuscular: existente.grupoMuscular,
      creado: false,
    };
  }

  const id = uid();
  await db.ejercicios.add({
    id,
    nombre: args.nombre,
    grupoMuscular: args.grupoMuscular,
    descripcion: args.descripcion,
    tipo: args.tipo ?? "fuerza",
  });
  return { id, nombre: args.nombre, grupoMuscular: args.grupoMuscular, creado: true };
}

async function ejecutarCrearRutina(args: CrearRutinaArgs): Promise<{
  id: string;
  nombre: string;
  ejerciciosCount: number;
}> {
  // Resolver carpeta si se especifica. Si carpetaNombre no existe, se crea
  // dentro de la transacción de la tool.
  const carpetaId = await resolveCarpeta(args.carpetaId, args.carpetaNombre);

  const ejerciciosResueltos = await Promise.all(
    args.ejercicios.map(async (ej) => ({
      ...ej,
      resolvedId: await resolveEjercicio(ej.ejercicioId, ej.ejercicioNombre),
    })),
  );

  const ejerciciosNoResueltos = ejerciciosResueltos.filter((e) => !e.resolvedId);
  if (ejerciciosNoResueltos.length > 0) {
    const nombres = ejerciciosNoResueltos.map(
      (ej) => ej.ejercicioNombre ?? ej.ejercicioId ?? "desconocido",
    );
    throw new Error(
      `No se encontraron en el catálogo los ejercicios: ${nombres.join(", ")}. ` +
      "Crea primero cada ejercicio con crear_ejercicio y vuelve a intentarlo.",
    );
  }

  const ejerciciosValidos = ejerciciosResueltos;

  // Validar que ejercicios de fuerza/calistenia tengan reps y peso objetivo
  // (tipo se deduce del catálogo; si el ejercicio no existe en catálogo, se usa fuerza por defecto)
  const ejerciciosConTipo = await Promise.all(
    ejerciciosValidos.map(async (ej) => {
      const cat = await db.ejercicios.get(ej.resolvedId!);
      return {
        ...ej,
        tipo: cat?.tipo ?? "fuerza",
      };
    }),
  );

  const sinDatosCriticos = ejerciciosConTipo.filter(
    (ej) => (ej.tipo === "fuerza" || ej.tipo === "calistenia") &&
            (ej.repsMin == null || ej.repsMax == null || ej.pesoObjetivo == null),
  );
  if (sinDatosCriticos.length > 0) {
    const nombres = sinDatosCriticos.map((ej) => ej.ejercicioNombre ?? ej.ejercicioId ?? "desconocido");
    throw new Error(
      "Los ejercicios de fuerza/calistenia requieren repsMin, repsMax y pesoObjetivo. " +
      `Faltan en: ${nombres.join(", ")}.`,
    );
  }

  // Construir las series según el tipo de ejercicio
  const rutinaId = uid();

  // Calcular orden: contar rutinas en el mismo contenedor (carpeta o root)
  const allRutinas = await db.rutinas.toArray();
  const order = allRutinas.filter(
    (r) => (r.carpetaId ?? undefined) === (carpetaId ?? undefined),
  ).length;

  const ejerciciosEnRutina = ejerciciosConTipo.map((ej, idx) => {
    // Usar tipo real (o fuerza por defecto) para decidir si es cardio/tiempo o fuerza.
    // buildDefaultSerie decide el modo basándose en duracionObjetivoMinutos/distanciaObjetivoKm;
    // pasamos tipo solo para future-proof, sin añadirlo al tipoEjercicioEnRutinaArgs.
    return {
      id: uid(),
      ejercicioId: ej.resolvedId!,
      series: Array.from({ length: ej.series }, () => buildDefaultSerie(ej)),
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
    // Normalizar clave de día: minúsculas y sin acentos para que coincida con
    // las claves esperadas (lunes, martes, miercoles, jueves, viernes, sabado, domingo).
    const diaNormalizado = dia.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!(diaNormalizado in plan.dias)) continue;

    // Resolver rutina: si es un ID válido (existe en DB), usarlo.
    // Si no, intentar buscar por nombre. null = día de descanso.
    let resolvedId: string | null = null;
    if (typeof rutinaIdOrName === "string" && rutinaIdOrName.trim().length > 0) {
      resolvedId = await resolveRutina(rutinaIdOrName, rutinaIdOrName);
    }

    plan.dias[diaNormalizado as keyof typeof plan.dias] = {
      rutinaId: resolvedId,
      activo: resolvedId !== null,
    };
    diasModificados.push(diaNormalizado);
    cambios[diaNormalizado] = resolvedId;
  }

  await db.planificacionSemanal.put(plan);

  return { diasModificados, cambios };
}

/**
 * Fecha actual del sistema (formato YYYY-MM-DD), usada solo como último recurso
 * cuando ni el agente ni el usuario especifican una fecha.
 * En flujos normales, la fecha efectiva debe venir explícitamente en `fecha`
 * desde FECHA_ACTUAL del prompt.
 */
function fechaYHoraActualDelSistema() {
  const ahora = new Date();
  const fecha = ahora.toISOString().slice(0, 10);
  const hora = ahora.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return { fecha, hora };
}

/**
 * Hora actual del sistema (solo para derivar hora cuando fecha ya está dada).
 */
function horaActualDelSistema() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

async function ejecutarRegistrarPeso(args: RegistrarPesoArgs): Promise<{ valor: number; fecha: string; hora: string }> {
  const fechaEfectiva = args.fecha ?? fechaYHoraActualDelSistema().fecha;
  const hora = args.hora ?? horaActualDelSistema();

  await db.pesos.add({
    fecha: fechaEfectiva,
    hora,
    valor: args.valor,
  });

  return { valor: args.valor, fecha: fechaEfectiva, hora };
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
  if (s.repsMin != null) real.reps = s.repsMin;
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
}> {
  const fecha = args.fecha ?? fechaYHoraActualDelSistema().fecha;
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
        return { ...ej, resolvedId: eId };
      }),
    );

    const noResueltos = resueltos.filter((e) => !e.resolvedId);
    if (noResueltos.length > 0) {
      const nombres = noResueltos.map(
        (ej) => ej.ejercicioNombre ?? ej.ejercicioId ?? "desconocido",
      );
      throw new Error(
        `No se encontraron en el catálogo los ejercicios: ${nombres.join(", ")}. ` +
        "Crea primero cada ejercicio con crear_ejercicio y vuelve a intentarlo.",
      );
    }

    const validos = resueltos;
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
  };
}

async function ejecutarEditarEntrenamiento(
  args: EditarEntrenamientoArgs,
): Promise<{
  fecha: string;
  rutinaNombre: string;
  ejerciciosAgregados: number;
  ejerciciosQuitados: number;
  ejerciciosModificados: number;
}> {
  // ── Búsqueda optimizada con índice compuesto [rutinaId+fecha] ──
  let logId: number | undefined;
  let rutinaSnapshot: string | undefined;

  if (args.rutinaId) {
    const match = await db.logsEntrenamientos
      .where("[rutinaId+fecha]")
      .equals([args.rutinaId, args.fecha])
      .first();
    if (match) {
      logId = match.id;
      rutinaSnapshot = match.rutinaSnapshot ?? args.rutinaId;
    }
  }

  // Fallback: buscar por fecha + nombre de rutina (no indexado, pero poco frecuente)
  if (logId == null && args.rutinaNombre) {
    const logs = await db.logsEntrenamientos
      .where("fecha")
      .equals(args.fecha)
      .toArray();
    const match = logs.find(
      (l) =>
        l.rutinaSnapshot?.toLowerCase() === args.rutinaNombre!.toLowerCase() ||
        l.rutinaId === args.rutinaNombre,
    );
    if (match) {
      logId = match.id;
      rutinaSnapshot = match.rutinaSnapshot ?? match.rutinaId;
    }
  }

  // Si no hay rutinaId ni rutinaNombre, buscar por fecha (primer log de ese día).
  // Si hay más de un log en esa fecha, es ambiguo: pedir aclaración en vez de adivinar.
  if (logId == null && !args.rutinaId && !args.rutinaNombre) {
    const logs = await db.logsEntrenamientos.where("fecha").equals(args.fecha).toArray();
    if (logs.length === 0) {
      // nada: se mantendrá logId == null y lanzará el error final
    } else if (logs.length === 1) {
      logId = logs[0].id;
      rutinaSnapshot = logs[0].rutinaSnapshot ?? logs[0].rutinaId;
    } else {
      throw new Error(
        `Hay ${logs.length} entrenamientos registrados el ${args.fecha}. ` +
        "Especifica rutinaId o rutinaNombre para editar el correcto.",
      );
    }
  }

  if (logId == null) {
    throw new Error(
      `No se encontró un entrenamiento registrado el ${args.fecha}${args.rutinaNombre ? ` para "${args.rutinaNombre}"` : ""}.`,
    );
  }

  // ── Cargar el log actual ────────────────────────────────────────
  const log = await db.logsEntrenamientos.get(logId);
  if (!log) {
    throw new Error(`Log de entrenamiento ${logId} no encontrado.`);
  }

  let ejercicios = [...log.ejercicios];
  let ejerciciosAgregados = 0;
  let ejerciciosQuitados = 0;
  let ejerciciosModificados = 0;

  // ── Quitar ejercicios ───────────────────────────────────────────
  if (args.ejerciciosQuitar && args.ejerciciosQuitar.length > 0) {
    const idsResueltos = await Promise.all(
      args.ejerciciosQuitar.map((eq) => requireEjercicioId(eq.ejercicioId, eq.ejercicioNombre)),
    );
    const idsFueraDeRutina = idsResueltos.filter(
      (id) => !ejercicios.some((ej) => ej.ejercicioId === id),
    );
    if (idsFueraDeRutina.length > 0) {
      throw new Error("Uno o más ejercicios a quitar no pertenecen a la rutina indicada.");
    }
    const idsSet = new Set(idsResueltos);
    const antesDeFiltrar = ejercicios.length;
    ejercicios = ejercicios.filter((ej) => !idsSet.has(ej.ejercicioId));
    ejerciciosQuitados = antesDeFiltrar - ejercicios.length;
  }

  // ── Modificar series de ejercicios existentes ───────────────────
  if (args.ejerciciosModificar && args.ejerciciosModificar.length > 0) {
    for (const mod of args.ejerciciosModificar) {
      if (!mod.series || mod.series.length === 0) continue;

      // Resolver el ejercicio a modificar
      let targetId: string | null = null;
      if (mod.ejercicioId) targetId = mod.ejercicioId;
      if (!targetId && mod.ejercicioNombre) {
        targetId = await requireEjercicioId(undefined, mod.ejercicioNombre);
      }

      if (!targetId) {
        targetId = await requireEjercicioId(mod.ejercicioId, mod.ejercicioNombre);
      }

      // Encontrar el ejercicio en el log
      const idx = ejercicios.findIndex((ej) => ej.ejercicioId === targetId);
      if (idx === -1) {
        throw new Error("El ejercicio a modificar no pertenece al entrenamiento indicado.");
      }

      // Aplicar modificaciones a las series indicadas
      const seriesMod = [...ejercicios[idx].series];
      for (const sMod of mod.series) {
        if (sMod.serieIdx < 0 || sMod.serieIdx >= seriesMod.length) {
          throw new Error(`La serie ${sMod.serieIdx} no existe para el ejercicio indicado.`);
        }
        const actual = seriesMod[sMod.serieIdx];
        seriesMod[sMod.serieIdx] = {
          ...actual,
          ...(sMod.peso !== undefined ? { peso: sMod.peso } : {}),
          ...(sMod.reps !== undefined ? { reps: sMod.reps } : {}),
          ...(sMod.completado !== undefined ? { completado: sMod.completado } : {}),
          ...(sMod.rpe !== undefined ? { rpe: sMod.rpe } : {}),
          ...(sMod.duracionMinutos !== undefined ? { duracionMinutos: sMod.duracionMinutos } : {}),
          ...(sMod.distanciaKm !== undefined ? { distanciaKm: sMod.distanciaKm } : {}),
        };
      }

      ejercicios[idx] = { ...ejercicios[idx], series: seriesMod };
      ejerciciosModificados++;
    }
  }

  // ── Añadir ejercicios ───────────────────────────────────────────
  if (args.ejerciciosAgregar && args.ejerciciosAgregar.length > 0) {
    const resueltos = await Promise.all(
      args.ejerciciosAgregar.map(async (ej: EjercicioRealArgs) => {
        const eId = await resolveEjercicio(ej.ejercicioId, ej.ejercicioNombre);
        return { ...ej, resolvedId: eId };
      }),
    );

    const noResueltos = resueltos.filter((e) => !e.resolvedId);
    if (noResueltos.length > 0) {
      const nombres = noResueltos.map(
        (ej) => ej.ejercicioNombre ?? ej.ejercicioId ?? "desconocido",
      );
      throw new Error(
        `No se encontraron en el catálogo los ejercicios: ${nombres.join(", ")}. ` +
        "Crea primero cada ejercicio con crear_ejercicio y vuelve a intentarlo.",
      );
    }

    const nuevosEjercicios: EjercicioReal[] = resueltos.map((ej) => ({
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

    ejercicios = [...ejercicios, ...nuevosEjercicios];
    ejerciciosAgregados = nuevosEjercicios.length;
  }

  // ── Guardar cambios ─────────────────────────────────────────────
  await actualizarLogEntrenamiento(
    logId,
    ejercicios,
    args.notas ?? log.notas,
  );

  return {
    fecha: args.fecha,
    rutinaNombre: rutinaSnapshot ?? "desconocida",
    ejerciciosAgregados,
    ejerciciosQuitados,
    ejerciciosModificados,
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
async function executeFunctionCallInTransaction(
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
        const msg = result.creado
          ? `Ejercicio "${result.nombre}" (${result.grupoMuscular}) añadido al catálogo.`
          : `El ejercicio "${result.nombre}" (${result.grupoMuscular}) ya existía en el catálogo — no se ha creado un duplicado.`;
        return {
          success: true,
          message: msg,
          data: result as unknown as Record<string, unknown>,
        };
      }
      case "crear_rutina": {
        const result = await ejecutarCrearRutina(call.args);
        return {
          success: true,
          message: `Rutina "${result.nombre}" creada con ${result.ejerciciosCount} ejercicios.`,
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
        const cambios: string[] = [];
        if (call.args.nombre !== undefined) cambios.push(`renombrada a "${result.nombre}"`);
        if (call.args.descripcion !== undefined) cambios.push("descripción actualizada");
        if (result.ejerciciosQuitados > 0) cambios.push(`${result.ejerciciosQuitados} ejercicios quitados`);
        if (result.ejerciciosModificados > 0) cambios.push(`${result.ejerciciosModificados} ejercicios modificados`);
        if (result.ejerciciosAgregados > 0) cambios.push(`${result.ejerciciosAgregados} ejercicios añadidos`);
        const detalle = cambios.length > 0 ? ` (${cambios.join(", ")})` : "";
        return {
          success: true,
          message: `Rutina "${result.nombre}" actualizada correctamente${detalle}.`,
          data: result as unknown as Record<string, unknown>,
        };
      }
      case "reordenar_rutina": {
        const result = await ejecutarReordenarRutina(call.args);
        const anterior = result.ordenAnterior.join(" → ");
        const nuevo = result.ordenNuevo.join(" → ");
        return {
          success: true,
          message: `Rutina "${result.nombre}" reordenada. Orden anterior: ${anterior}. Nuevo orden: ${nuevo}.`,
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
        return {
          success: true,
          message: `${tipo} registrado (${result.fecha}) con ${result.ejerciciosCount} ejercicios.`,
          data: result as unknown as Record<string, unknown>,
        };
      }
      case "editar_entrenamiento": {
        const result = await ejecutarEditarEntrenamiento(call.args);
        const cambios: string[] = [];
        if (result.ejerciciosAgregados > 0) cambios.push(`${result.ejerciciosAgregados} ejercicios añadidos`);
        if (result.ejerciciosQuitados > 0) cambios.push(`${result.ejerciciosQuitados} ejercicios quitados`);
        if (result.ejerciciosModificados > 0) cambios.push(`${result.ejerciciosModificados} ejercicios modificados`);
        const detalle = cambios.length > 0 ? ` (${cambios.join(", ")})` : "";
        return {
          success: true,
          message: `Entrenamiento del ${result.fecha} ("${result.rutinaNombre}") actualizado${detalle}.`,
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

const TOOL_TRANSACTION_TABLES = [
  db.ejercicios,
  db.carpetas,
  db.rutinas,
  db.logsEntrenamientos,
  db.pesos,
  db.planificacionSemanal,
  db.perfil_usuario,
  db.sesiones_chat,
] as const;

/** Ejecuta una tool confirmada dentro de una transacción atómica. */
export async function executeFunctionCall(
  call: FunctionCallArgs,
): Promise<ToolExecutionResult> {
  try {
    return await db.transaction("rw", TOOL_TRANSACTION_TABLES, async () => {
      const result = await executeFunctionCallInTransaction(call);
      if (!result.success) throw new Error(result.message);
      return result;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return {
      success: false,
      message: `Transacción cancelada para ${call.name}: ${message}`,
    };
  }
}

/**
 * Ejecuta todas las tools de una misma propuesta en una única transacción.
 * Si una falla, se revierten también las anteriores.
 */
export async function executeFunctionCalls(
  calls: FunctionCallArgs[],
): Promise<ToolExecutionResult[]> {
  if (calls.length === 0) return [];

  try {
    return await db.transaction("rw", TOOL_TRANSACTION_TABLES, async () => {
      const results: ToolExecutionResult[] = [];
      for (const call of calls) {
        const result = await executeFunctionCallInTransaction(call);
        if (!result.success) throw new Error(result.message);
        results.push(result);
      }
      return results;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return calls.map((call) => ({
      success: false,
      message: `Transacción cancelada para ${call.name}: ${message}`,
    }));
  }
}
