import {
  db,
  type Carpeta,
  type Ejercicio,
  type EjercicioEnRutina,
  type GrupoMuscular,
  type Rutina,
  type Serie,
  type TipoEjercicio,
} from "../../core/db";

export type ContainerId = "ROOT" | string;

export const ROOT: ContainerId = "ROOT";

export function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function carpetaIdFromContainer(c: ContainerId): string | undefined {
  return c === ROOT ? undefined : c;
}

// ── Carpetas ─────────────────────────────────────────────────────────

export async function crearCarpeta(nombre: string): Promise<void> {
  const id = uid();
  const total = await db.carpetas.count();
  await db.carpetas.add({ id, nombre, order: total, collapsed: false });
}

export async function eliminarCarpeta(
  id: string,
  borrarHijas: boolean
): Promise<void> {
  if (borrarHijas) {
    // Usar eliminarRutina en cada hija para respetar el soft-delete
    // cuando haya logs que referencien la rutina.
    const hijas = await db.rutinas.where("carpetaId").equals(id).toArray();
    for (const r of hijas) {
      await eliminarRutina(r.id);
    }
  } else {
    await db.rutinas
      .where("carpetaId")
      .equals(id)
      .modify({ carpetaId: undefined });
  }
  await db.carpetas.delete(id);
}

export async function toggleCarpetaCollapsed(id: string): Promise<void> {
  const c = await db.carpetas.get(id);
  if (!c) return;
  await db.carpetas.update(id, { collapsed: !c.collapsed });
}

export async function renombrarCarpeta(
  id: string,
  nombre: string
): Promise<void> {
  await db.carpetas.update(id, { nombre });
}

/** Persiste el orden de carpetas tal cual vienen en el array. */
export async function persistCarpetasOrder(
  carpetas: Carpeta[]
): Promise<void> {
  await db.carpetas.bulkPut(carpetas.map((c, i) => ({ ...c, order: i })));
}

// ── Rutinas ──────────────────────────────────────────────────────────

export async function crearRutina(
  nombre: string,
  carpetaId?: string
): Promise<string> {
  const id = uid();
  const all = await db.rutinas.toArray();
  const orden = all.filter(
    (r) => (r.carpetaId ?? undefined) === (carpetaId ?? undefined)
  ).length;
  await db.rutinas.add({
    id,
    nombre,
    descripcion: "",
    carpetaId,
    ejercicios: [],
    order: orden,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function eliminarRutina(id: string): Promise<"borrado" | "archivado"> {
  const enUso = await checkRutinaTieneLogs(id);

  if (enUso) {
    // Soft delete: archivar para no romper logs históricos
    await db.rutinas.update(id, { isArchived: true });
    return "archivado";
  }

  // Hard delete: borrar físicamente
  await db.rutinas.delete(id);
  return "borrado";
}

/** Comprueba si una rutina tiene logs de entrenamiento que la referencian. */
export async function checkRutinaTieneLogs(id: string): Promise<boolean> {
  const count = await db.logsEntrenamientos
    .where("rutinaId")
    .equals(id)
    .count();
  return count > 0;
}

export async function desarchivarRutina(id: string): Promise<void> {
  await db.rutinas.update(id, { isArchived: false });
}

export async function renombrarRutina(
  id: string,
  nombre: string
): Promise<void> {
  await db.rutinas.update(id, { nombre });
}

export async function setRutinaDescripcion(
  id: string,
  descripcion: string
): Promise<void> {
  await db.rutinas.update(id, { descripcion });
}

/** Renumera 0..n en un solo contenedor (root o una carpeta). */
export async function renumerarRutinasEn(
  carpetaId: string | undefined
): Promise<void> {
  const all = await db.rutinas.toArray();
  const filtered = all
    .filter((r) => (r.carpetaId ?? undefined) === (carpetaId ?? undefined))
    .sort((a, b) => a.order - b.order);
  await db.rutinas.bulkPut(
    filtered.map((r, i) => ({ ...r, order: i, carpetaId }))
  );
}

/**
 * Persiste el mapa completo Rutina[containerId][] tras una operación drag.
 * Renumera 0..n en cada contenedor y asigna carpetaId correcto.
 */
export async function persistRutinasMap(
  map: Record<ContainerId, Rutina[]>
): Promise<void> {
  const writes: Rutina[] = [];
  for (const [container, list] of Object.entries(map)) {
    const carpetaId = carpetaIdFromContainer(container);
    list.forEach((r, i) =>
      writes.push({ ...r, carpetaId, order: i })
    );
  }
  await db.rutinas.bulkPut(writes);
}

// ── Ejercicios ───────────────────────────────────────────────────────

export async function crearEjercicio(input: {
  nombre: string;
  grupoMuscular: GrupoMuscular;
  descripcion?: string;
  tipo?: TipoEjercicio;
}): Promise<string> {
  const id = uid();
  const ej: Ejercicio = { ...input, tipo: input.tipo ?? "fuerza", id };
  await db.ejercicios.add(ej);
  return id;
}

export async function eliminarEjercicio(id: string): Promise<"borrado" | "archivado"> {
  // Comprobar si el ejercicio se usa en alguna rutina
  const rutinas = await db.rutinas.toArray();
  const enRutina = rutinas.some((r) =>
    r.ejercicios.some((ej) => ej.ejercicioId === id)
  );

  // Comprobar si el ejercicio se usa en algún log de entrenamiento
  const logs = await db.logsEntrenamientos.toArray();
  const enLog = logs.some((l) =>
    l.ejercicios.some((ej) => ej.ejercicioId === id)
  );

  if (enRutina || enLog) {
    // Soft delete: archivar
    await db.ejercicios.update(id, { isArchived: true });
    return "archivado";
  }

  // Hard delete: borrar físicamente
  await db.ejercicios.delete(id);
  return "borrado";
}

export async function desarchivarEjercicio(id: string): Promise<void> {
  await db.ejercicios.update(id, { isArchived: false });
}

export async function editarEjercicio(
  id: string,
  cambios: {
    nombre?: string;
    grupoMuscular?: GrupoMuscular;
    descripcion?: string;
    tipo?: TipoEjercicio;
  }
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.ejercicios.update(id, cambios as any);
}

/** Construye un EjercicioEnRutina inicial con series por defecto según el tipo. */
export function buildEjercicioInicial(
  ejercicioId: string,
  numSeriesDefault = 3,
  tipo?: TipoEjercicio
): EjercicioEnRutina {
  const defaultSerie = (): Serie => {
    if (tipo === "cardio") {
      return { duracionObjetivoMinutos: 30 };
    }
    if (tipo === "tiempo") {
      return { duracionObjetivoMinutos: 60 };
    }
    // fuerza / calistenia / undefined
    return { repsObjetivo: 8 };
  };
  return {
    id: uid(),
    ejercicioId,
    series: Array.from({ length: numSeriesDefault }, () => defaultSerie()),
    order: 0,
  };
}

// ── Series dentro de un ejercicio de rutina ──────────────────────────

export async function setEjerciciosEnRutina(
  rutinaId: string,
  ejercicios: Rutina["ejercicios"]
): Promise<void> {
  const ordenados = ejercicios
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((e, i) => ({ ...e, order: i }));
  await db.rutinas.update(rutinaId, { ejercicios: ordenados });
}
