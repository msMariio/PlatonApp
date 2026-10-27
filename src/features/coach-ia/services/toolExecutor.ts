import {
  db,
  uid,
  buildPlanificacionVacia,
  type Carpeta,
  type Ejercicio,
  type EjercicioReal,
  type GrupoMuscular,
  type PesoDiario,
  type Serie,
  type SerieReal,
  type TipoEjercicio,
} from "../../../core/db";
import { CUSTOM_LIBRE_ID, actualizarLogEntrenamiento } from "../../training-logger/data";
import { diaDeFecha, esFechaISO, fechaLocalISO, horaLocalHHMM } from "../../../core/utils/dates";
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
  SerieRealArgs,
  FunctionCallArgs,
} from "./toolDefinitions";

// ── Normalización y validación ───────────────────────────────────────

const GRUPOS_MUSCULARES_VALIDOS: readonly GrupoMuscular[] = [
  "pecho",
  "espalda",
  "cuadriceps",
  "isquios",
  "hombro",
  "biceps",
  "triceps",
  "core",
  "gluteo",
];

const TIPOS_EJERCICIO_VALIDOS: readonly TipoEjercicio[] = [
  "fuerza",
  "cardio",
  "tiempo",
  "calistenia",
];

const RANGO_PESO_CORPORAL = { min: 20, max: 400 };
const RANGO_PESO = { min: 0, max: 1000 };
const RANGO_REPS = { min: 0, max: 1000 };
const RANGO_SERIES = { min: 1, max: 20 };
const RANGO_RPE = { min: 1, max: 10 };
const RANGO_DESCANSO = { min: 0, max: 60 };
const RANGO_DURACION = { min: 1, max: 1440 };
const RANGO_DISTANCIA = { min: 0.1, max: 1000 };

interface RangoNumerico {
  min: number;
  max: number;
}

/** Normaliza nombres para comparar: sin espacios extra, mayúsculas ni acentos. */
function normalizarNombre(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function exigirTexto(valor: unknown, etiqueta: string): string {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (texto.length === 0) {
    throw new Error(`${etiqueta} no puede estar vacío.`);
  }
  return texto;
}

function exigirFecha(valor: unknown): string {
  const dia = diaDeFecha(String(valor ?? "").trim());
  if (!esFechaISO(dia)) {
    throw new Error(
      `La fecha "${String(valor)}" no es válida. Usa el formato YYYY-MM-DD.`,
    );
  }
  return dia;
}

function exigirNumero(
  valor: unknown,
  etiqueta: string,
  rango: RangoNumerico,
  entero = false,
): number {
  if (valor === null || valor === undefined || valor === "") {
    throw new Error(`${etiqueta} es obligatorio.`);
  }

  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero)) {
    throw new Error(`${etiqueta} debe ser un número (recibido: ${String(valor)}).`);
  }
  if (entero && !Number.isInteger(numero)) {
    throw new Error(`${etiqueta} debe ser un número entero (recibido: ${numero}).`);
  }
  if (numero < rango.min || numero > rango.max) {
    throw new Error(
      `${etiqueta} fuera de rango: ${numero}. Debe estar entre ${rango.min} y ${rango.max}.`,
    );
  }
  return numero;
}

function validarGrupoMuscular(valor: unknown): GrupoMuscular {
  const grupo = normalizarNombre(String(valor ?? ""));
  const encontrado = GRUPOS_MUSCULARES_VALIDOS.find((item) => item === grupo);
  if (!encontrado) {
    throw new Error(
      `Grupo muscular no válido: "${String(valor)}". Valores permitidos: ${GRUPOS_MUSCULARES_VALIDOS.join(", ")}.`,
    );
  }
  return encontrado;
}

function validarTipoEjercicio(valor: unknown): TipoEjercicio {
  const tipo = normalizarNombre(String(valor ?? ""));
  const encontrado = TIPOS_EJERCICIO_VALIDOS.find((item) => item === tipo);
  if (!encontrado) {
    throw new Error(
      `Tipo de ejercicio no válido: "${String(valor)}". Valores permitidos: ${TIPOS_EJERCICIO_VALIDOS.join(", ")}.`,
    );
  }
  return encontrado;
}

/**
 * Busca por nombre exacto normalizado y, si no hay, cuando el nombre del
 * catálogo está contenido en lo que pidió el atleta ("press banca con barra"
 * → "Press Banca"). Nunca acorta el nombre del catálogo: "sentadilla" no
 * resuelve a "Sentadilla Búlgara" por su cuenta.
 * Si hay varias coincidencias, el llamante informa de la ambigüedad.
 */
function buscarCoincidencias<T>(
  items: T[],
  nombre: string,
  getNombre: (item: T) => string,
): T[] {
  const objetivo = normalizarNombre(nombre);
  if (objetivo.length === 0) return [];

  const exactos = items.filter((item) => normalizarNombre(getNombre(item)) === objetivo);
  if (exactos.length > 0) return exactos;

  return items.filter((item) => objetivo.includes(normalizarNombre(getNombre(item))));
}

function listarNombres<T>(items: T[], getNombre: (item: T) => string): string {
  return items.map(getNombre).join(", ");
}

/** Validación y normalización de los datos numéricos de un ejercicio de rutina. */
function validarEjercicioEnRutina<T extends EjercicioEnRutinaArgs>(
  ej: T,
  etiqueta: string,
): T {
  const series = exigirNumero(ej.series, `${etiqueta}: series`, RANGO_SERIES, true);
  const validado: EjercicioEnRutinaArgs = { ...ej, series };

  if (ej.repsMin != null) {
    validado.repsMin = exigirNumero(ej.repsMin, `${etiqueta}: repsMin`, RANGO_REPS, true);
  }
  if (ej.repsMax != null) {
    validado.repsMax = exigirNumero(ej.repsMax, `${etiqueta}: repsMax`, RANGO_REPS, true);
  }
  if (
    validado.repsMin != null &&
    validado.repsMax != null &&
    validado.repsMin > validado.repsMax
  ) {
    throw new Error(
      `${etiqueta}: repsMin (${validado.repsMin}) no puede ser mayor que repsMax (${validado.repsMax}).`,
    );
  }
  if (ej.pesoObjetivo != null) {
    validado.pesoObjetivo = exigirNumero(ej.pesoObjetivo, `${etiqueta}: peso objetivo`, RANGO_PESO);
  }
  if (ej.rpeObjetivo != null) {
    validado.rpeObjetivo = exigirNumero(ej.rpeObjetivo, `${etiqueta}: RPE`, RANGO_RPE);
  }
  if (ej.descansoMinutos != null) {
    validado.descansoMinutos = exigirNumero(ej.descansoMinutos, `${etiqueta}: descanso`, RANGO_DESCANSO);
  }
  if (ej.duracionObjetivoMinutos != null) {
    validado.duracionObjetivoMinutos = exigirNumero(
      ej.duracionObjetivoMinutos,
      `${etiqueta}: duración`,
      RANGO_DURACION,
    );
  }
  if (ej.distanciaObjetivoKm != null) {
    validado.distanciaObjetivoKm = exigirNumero(
      ej.distanciaObjetivoKm,
      `${etiqueta}: distancia`,
      RANGO_DISTANCIA,
    );
  }

  return validado as T;
}

/** Validación y normalización de las series reales de un entrenamiento. */
function validarSeriesReales(
  series: SerieRealArgs[] | undefined,
  etiqueta: string,
): SerieRealArgs[] {
  if (!Array.isArray(series) || series.length === 0) {
    throw new Error(`${etiqueta}: debes indicar al menos una serie.`);
  }

  return series.map((serie, index) => {
    const etiquetaSerie = `${etiqueta}, serie ${index + 1}`;
    const validada: SerieRealArgs = { ...serie };

    if (serie.peso != null) {
      validada.peso = exigirNumero(serie.peso, `${etiquetaSerie}: peso`, RANGO_PESO);
    }
    if (serie.reps != null) {
      validada.reps = exigirNumero(serie.reps, `${etiquetaSerie}: reps`, RANGO_REPS, true);
    }
    if (serie.rpe != null) {
      validada.rpe = exigirNumero(serie.rpe, `${etiquetaSerie}: RPE`, RANGO_RPE);
    }
    if (serie.duracionMinutos != null) {
      validada.duracionMinutos = exigirNumero(
        serie.duracionMinutos,
        `${etiquetaSerie}: duración`,
        RANGO_DURACION,
      );
    }
    if (serie.distanciaKm != null) {
      validada.distanciaKm = exigirNumero(
        serie.distanciaKm,
        `${etiquetaSerie}: distancia`,
        RANGO_DISTANCIA,
      );
    }

    return validada;
  });
}

async function buscarCarpeta(
  carpetaId: string | undefined,
  carpetaNombre: string | undefined,
): Promise<Carpeta | null> {
  if (carpetaId) {
    const porId = await db.carpetas.get(carpetaId);
    if (porId) return porId;
  }
  if (!carpetaNombre) return null;

  const carpetas = await db.carpetas.toArray();
  const coincidencias = buscarCoincidencias(carpetas, carpetaNombre, (c) => c.nombre);
  if (coincidencias.length > 1) {
    throw new Error(
      `Hay varias carpetas que coinciden con "${carpetaNombre}": ${listarNombres(coincidencias, (c) => c.nombre)}. ` +
      "Usa el nombre exacto o el ID.",
    );
  }
  return coincidencias[0] ?? null;
}

async function buscarEjercicio(
  ejercicioId: string | undefined,
  ejercicioNombre: string | undefined,
  soloActivos: boolean,
): Promise<Ejercicio | null> {
  if (ejercicioId) {
    const porId = await db.ejercicios.get(ejercicioId);
    if (porId && (!soloActivos || !porId.isArchived)) return porId;
  }
  if (!ejercicioNombre) return null;

  const ejercicios = await db.ejercicios.toArray();
  const candidatos = soloActivos
    ? ejercicios.filter((e) => !e.isArchived)
    : ejercicios;
  const coincidencias = buscarCoincidencias(candidatos, ejercicioNombre, (e) => e.nombre);
  if (coincidencias.length > 1) {
    throw new Error(
      `Hay varios ejercicios que coinciden con "${ejercicioNombre}": ${listarNombres(coincidencias, (e) => e.nombre)}. ` +
      "Usa el nombre exacto o el ID.",
    );
  }
  return coincidencias[0] ?? null;
}

// ── Helpers de resolución ───────────────────────────────────────────

/**
 * Busca una carpeta por ID o, si no se encuentra, por nombre.
 * Si no existe y se pasa nombre, la crea y devuelve su ID.
 */
async function resolveCarpeta(
  carpetaId: string | undefined,
  carpetaNombre: string | undefined,
): Promise<string | undefined> {
  const encontrada = await buscarCarpeta(carpetaId, carpetaNombre);
  if (encontrada) return encontrada.id;
  if (!carpetaNombre) return undefined;

  const nombre = exigirTexto(carpetaNombre, "El nombre de la carpeta");
  const id = uid();
  const total = await db.carpetas.count();
  await db.carpetas.add({ id, nombre, order: total, collapsed: false });
  return id;
}

/**
 * Busca un ejercicio por ID o, si no se encuentra, por nombre.
 * Las tools nunca crean ejercicios implícitamente: si no existe, la operación falla.
 */
async function resolveEjercicio(
  ejercicioId: string | undefined,
  ejercicioNombre: string | undefined,
  soloActivos = true,
): Promise<string | undefined> {
  const encontrado = await buscarEjercicio(ejercicioId, ejercicioNombre, soloActivos);
  if (encontrado) return encontrado.id;

  // Mensaje específico cuando el ejercicio existe pero está archivado.
  if (ejercicioNombre && soloActivos) {
    const archivado = await buscarEjercicio(undefined, ejercicioNombre, false);
    if (archivado?.isArchived) {
      throw new Error(
        `El ejercicio "${archivado.nombre}" está archivado. Restáuralo desde el catálogo antes de usarlo.`,
      );
    }
  }
  return undefined;
}

async function requireEjercicioId(
  ejercicioId: string | undefined,
  ejercicioNombre: string | undefined,
): Promise<string> {
  // Quitar o modificar ejercicios sí permite referencias archivadas.
  const resolvedId = await resolveEjercicio(ejercicioId, ejercicioNombre, false);
  if (!resolvedId) {
    throw new Error(
      `No se encontró en el catálogo el ejercicio "${ejercicioNombre ?? ejercicioId ?? "desconocido"}". ` +
      "Crea primero el ejercicio con crear_ejercicio y vuelve a intentarlo.",
    );
  }
  return resolvedId;
}

/**
 * Busca una rutina activa por ID o por nombre y devuelve solo el ID.
 * Las rutinas archivadas quedan fuera de todas las operaciones del Coach.
 */
async function resolveRutina(
  rutinaId: string | null | undefined,
  rutinaNombre?: string,
): Promise<string | null> {
  if (rutinaId) {
    const porId = await db.rutinas.get(rutinaId);
    if (porId && !porId.isArchived) return porId.id;
  }
  if (!rutinaNombre) return null;

  const rutinas = (await db.rutinas.toArray()).filter((r) => !r.isArchived);
  const coincidencias = buscarCoincidencias(rutinas, rutinaNombre, (r) => r.nombre);
  if (coincidencias.length > 1) {
    throw new Error(
      `Hay varias rutinas que coinciden con "${rutinaNombre}": ${listarNombres(coincidencias, (r) => r.nombre)}. ` +
      "Usa el nombre exacto o el ID.",
    );
  }
  return coincidencias[0]?.id ?? null;
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

async function ejecutarCrearCarpeta(
  args: CrearCarpetaArgs,
): Promise<{ id: string; nombre: string; creada: boolean }> {
  const nombre = exigirTexto(args.nombre, "El nombre de la carpeta");
  const normalizado = normalizarNombre(nombre);
  const existente = (await db.carpetas.toArray()).find(
    (c) => normalizarNombre(c.nombre) === normalizado,
  );
  if (existente) {
    return { id: existente.id, nombre: existente.nombre, creada: false };
  }

  const id = uid();
  const total = await db.carpetas.count();
  await db.carpetas.add({ id, nombre, order: total, collapsed: false });
  return { id, nombre, creada: true };
}

async function ejecutarEditarCarpeta(
  args: EditarCarpetaArgs,
): Promise<{ id: string; nombre: string }> {
  const encontrada = await buscarCarpeta(args.carpetaId, args.carpetaNombre);
  if (!encontrada) {
    throw new Error("Carpeta no encontrada. Indica el ID o nombre de la carpeta a editar.");
  }

  const nombre = exigirTexto(args.nombre, "El nuevo nombre de la carpeta");
  const normalizado = normalizarNombre(nombre);
  const duplicada = (await db.carpetas.toArray()).find(
    (c) => c.id !== encontrada.id && normalizarNombre(c.nombre) === normalizado,
  );
  if (duplicada) {
    throw new Error(
      `Ya existe una carpeta llamada "${duplicada.nombre}". Usa otro nombre.`,
    );
  }

  await db.carpetas.update(encontrada.id, { nombre });
  return { id: encontrada.id, nombre };
}

async function ejecutarEditarEjercicio(
  args: EditarEjercicioArgs,
): Promise<{ id: string; nombre: string }> {
  const encontrado = await buscarEjercicio(
    args.ejercicioId,
    args.ejercicioNombre,
    false,
  );
  if (!encontrado) {
    throw new Error("Ejercicio no encontrado. Indica el ID o nombre del ejercicio a editar.");
  }

  const cambios: Record<string, unknown> = {};

  if (args.nombre !== undefined) {
    const nombre = exigirTexto(args.nombre, "El nuevo nombre del ejercicio");
    const normalizado = normalizarNombre(nombre);
    const duplicado = (await db.ejercicios.toArray()).find(
      (e) => e.id !== encontrado.id && normalizarNombre(e.nombre) === normalizado,
    );
    if (duplicado) {
      throw new Error(
        `Ya existe un ejercicio llamado "${duplicado.nombre}". Usa otro nombre o edita el existente.`,
      );
    }
    cambios.nombre = nombre;
  }

  if (args.grupoMuscular !== undefined) {
    cambios.grupoMuscular = validarGrupoMuscular(args.grupoMuscular);
  }
  if (args.tipo !== undefined) {
    cambios.tipo = validarTipoEjercicio(args.tipo);
  }
  if (args.descripcion !== undefined) cambios.descripcion = args.descripcion;

  if (Object.keys(cambios).length === 0) {
    throw new Error("No se indicó ningún cambio para el ejercicio.");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.ejercicios.update(encontrado.id, cambios as any);
  return { id: encontrado.id, nombre: (cambios.nombre ?? encontrado.nombre) as string };
}

async function ejecutarEditarRutina(
  args: EditarRutinaArgs,
): Promise<{ id: string; nombre: string; ejerciciosAgregados: number; ejerciciosQuitados: number; ejerciciosModificados: number }> {
  const encontrada = await resolveRutinaFull(args.rutinaId, args.rutinaNombre);
  if (!encontrada) throw new Error("Rutina no encontrada. Indica el ID o nombre de la rutina a editar.");

  // ── Cambios de nombre/descripción ───────────────────────────────
  const cambios: Record<string, unknown> = {};
  let huboCambios = false;

  if (args.nombre !== undefined) {
    const nombre = exigirTexto(args.nombre, "El nuevo nombre de la rutina");
    const normalizado = normalizarNombre(nombre);
    const duplicada = (await db.rutinas.toArray()).find(
      (r) =>
        r.id !== encontrada.id &&
        !r.isArchived &&
        normalizarNombre(r.nombre) === normalizado,
    );
    if (duplicada) {
      throw new Error(
        `Ya existe otra rutina activa llamada "${duplicada.nombre}". Usa otro nombre.`,
      );
    }
    cambios.nombre = nombre;
    huboCambios = true;
  }

  if (args.descripcion !== undefined) {
    cambios.descripcion = args.descripcion;
    huboCambios = true;
  }

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
    huboCambios = true;
  }

  // ── Modificar ejercicios existentes ─────────────────────────────
  if (args.ejerciciosModificar && args.ejerciciosModificar.length > 0) {
    for (const mod of args.ejerciciosModificar) {
      // El ejercicio se identifica por ID o por nombre (resolución tolerante).
      const targetId = await requireEjercicioId(mod.ejercicioId, mod.ejercicioNombre);

      // Encontrar el ejercicio en la rutina
      const idx = ejercicios.findIndex((ej) => ej.ejercicioId === targetId);
      if (idx === -1) {
        throw new Error(
          `El ejercicio "${mod.ejercicioNombre ?? mod.ejercicioId}" no pertenece a la rutina indicada.`,
        );
      }

      // Validar solo los campos que la IA ha enviado.
      const repsMin = mod.repsMin != null
        ? exigirNumero(mod.repsMin, "repsMin", RANGO_REPS, true)
        : undefined;
      const repsMax = mod.repsMax != null
        ? exigirNumero(mod.repsMax, "repsMax", RANGO_REPS, true)
        : undefined;
      const pesoObjetivo = mod.pesoObjetivo != null
        ? exigirNumero(mod.pesoObjetivo, "peso objetivo", RANGO_PESO)
        : undefined;
      const rpeObjetivo = mod.rpeObjetivo != null
        ? exigirNumero(mod.rpeObjetivo, "RPE", RANGO_RPE)
        : undefined;
      const descansoMinutos = mod.descansoMinutos != null
        ? exigirNumero(mod.descansoMinutos, "descanso", RANGO_DESCANSO)
        : undefined;
      const duracionObjetivoMinutos = mod.duracionObjetivoMinutos != null
        ? exigirNumero(mod.duracionObjetivoMinutos, "duración", RANGO_DURACION)
        : undefined;
      const distanciaObjetivoKm = mod.distanciaObjetivoKm != null
        ? exigirNumero(mod.distanciaObjetivoKm, "distancia", RANGO_DISTANCIA)
        : undefined;

      // Merge: preservar valores existentes, solo sobrescribir lo que la IA pasa explícitamente
      const oldSeries = ejercicios[idx].series;
      // `series` es opcional: si no se indica, se mantiene el número actual.
      const targetCount = mod.series != null
        ? exigirNumero(mod.series, "El número de series", RANGO_SERIES, true)
        : Math.max(1, oldSeries.length);
      const nuevosSeries: Serie[] = [];

      for (let i = 0; i < targetCount; i++) {
        if (i < oldSeries.length) {
          // Serie existente: mantener valores actuales y solo sobrescribir campos explícitos
          const old = oldSeries[i];
          const merged: Serie = { ...old };

          if (repsMin !== undefined) merged.repsMin = repsMin;
          if (repsMax !== undefined) merged.repsMax = repsMax;
          if (pesoObjetivo !== undefined) merged.pesoObjetivo = pesoObjetivo;
          if (rpeObjetivo !== undefined) merged.rpeObjetivo = rpeObjetivo;
          if (descansoMinutos !== undefined) {
            merged.notas = `Descanso: ${descansoMinutos} min`;
          }
          // Si se pasa duracion/distancia, cambia a modo cardio/tiempo
          if (duracionObjetivoMinutos !== undefined || distanciaObjetivoKm !== undefined) {
            if (duracionObjetivoMinutos !== undefined) {
              merged.duracionObjetivoMinutos = duracionObjetivoMinutos;
            }
            if (distanciaObjetivoKm !== undefined) {
              merged.distanciaObjetivoKm = distanciaObjetivoKm;
            }
            // Limpiar campos de fuerza al migrar a cardio
            delete merged.repsMin;
            delete merged.repsMax;
            delete merged.pesoObjetivo;
            delete merged.rpeObjetivo;
          }

          if (
            merged.repsMin != null &&
            merged.repsMax != null &&
            merged.repsMin > merged.repsMax
          ) {
            throw new Error(
              `El rango de repeticiones queda inválido: repsMin (${merged.repsMin}) es mayor que repsMax (${merged.repsMax}).`,
            );
          }

          nuevosSeries.push(merged);
        } else {
          // Nueva serie adicional: usar buildDefaultSerie con los valores pasados (o defaults)
          nuevosSeries.push(
            buildDefaultSerie({
              series: targetCount,
              repsMin,
              repsMax,
              pesoObjetivo,
              rpeObjetivo,
              duracionObjetivoMinutos,
              distanciaObjetivoKm,
              descansoMinutos,
            }),
          );
        }
      }

      ejercicios[idx] = { ...ejercicios[idx], series: nuevosSeries };
      ejerciciosModificados++;
      huboCambios = true;
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

    // Un ejercicio que ya está en la rutina se modifica, no se duplica.
    const yaEnRutina = resueltos.filter((e) =>
      ejercicios.some((ej) => ej.ejercicioId === e.resolvedId),
    );
    if (yaEnRutina.length > 0) {
      const nombres = yaEnRutina.map(
        (e) => e.ejercicioNombre ?? e.ejercicioId ?? "desconocido",
      );
      throw new Error(
        `Estos ejercicios ya están en la rutina: ${nombres.join(", ")}. ` +
        "Usa ejerciciosModificar para cambiar sus series o repeticiones.",
      );
    }

    const validados = resueltos.map((ej, index) =>
      validarEjercicioEnRutina(
        ej,
        `Ejercicio ${index + 1} (${ej.ejercicioNombre ?? ej.ejercicioId ?? "sin nombre"})`,
      ),
    );

    // Construir nuevos EjercicioEnRutina con order al final
    const nextOrder = ejercicios.length;
    const nuevosEjercicios = validados.map((ej, idx) => {
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
    huboCambios = true;
  }

  if (!huboCambios) {
    throw new Error(
      "No se indicó ningún cambio para la rutina. Indica nombre, descripción, ejercicios a añadir/quitar o series a modificar.",
    );
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

async function ejecutarCrearEjercicio(
  args: CrearEjercicioArgs,
): Promise<{ id: string; nombre: string; grupoMuscular: string; creado: boolean }> {
  const nombre = exigirTexto(args.nombre, "El nombre del ejercicio");
  const grupoMuscular = validarGrupoMuscular(args.grupoMuscular);
  const tipo = args.tipo !== undefined ? validarTipoEjercicio(args.tipo) : "fuerza";

  // Duplicado por nombre normalizado (sin mayúsculas, acentos ni espacios extra).
  const normalizado = normalizarNombre(nombre);
  const existente = (await db.ejercicios.toArray()).find(
    (e) => normalizarNombre(e.nombre) === normalizado,
  );

  if (existente) {
    return {
      id: existente.id,
      nombre: existente.nombre,
      grupoMuscular: existente.grupoMuscular ?? "sin_clasificar",
      creado: false,
    };
  }

  const id = uid();
  await db.ejercicios.add({
    id,
    nombre,
    grupoMuscular,
    descripcion: args.descripcion,
    tipo,
  });
  return { id, nombre, grupoMuscular, creado: true };
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

  const nombreRutina = exigirTexto(args.nombre, "El nombre de la rutina");

  if (args.ejercicios.length === 0) {
    throw new Error("La rutina debe tener al menos un ejercicio.");
  }

  const normalizadoRutina = normalizarNombre(nombreRutina);
  const rutinaDuplicada = (await db.rutinas.toArray()).find(
    (r) => !r.isArchived && normalizarNombre(r.nombre) === normalizadoRutina,
  );
  if (rutinaDuplicada) {
    throw new Error(
      `Ya existe una rutina activa llamada "${rutinaDuplicada.nombre}". ` +
      "Usa otro nombre o edítala con editar_rutina.",
    );
  }

  const idsEnRutina = ejerciciosResueltos.map((ej) => ej.resolvedId!);
  if (new Set(idsEnRutina).size !== idsEnRutina.length) {
    throw new Error(
      "La lista de ejercicios contiene duplicados. Cada ejercicio debe aparecer una sola vez.",
    );
  }

  const ejerciciosValidos = ejerciciosResueltos.map((ej, index) =>
    validarEjercicioEnRutina(
      ej,
      `Ejercicio ${index + 1} (${ej.ejercicioNombre ?? ej.ejercicioId ?? "sin nombre"})`,
    ),
  );

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

  // El peso objetivo es opcional: en dominadas, fondos o cualquier ejercicio a
  // peso corporal la serie se guarda sin peso. Las reps sí se exigen, porque sin
  // ellas la rutina quedaría con un rango que el atleta no ha pedido.
  const sinDatosCriticos = ejerciciosConTipo.filter(
    (ej) => (ej.tipo === "fuerza" || ej.tipo === "calistenia") &&
            (ej.repsMin == null || ej.repsMax == null),
  );
  if (sinDatosCriticos.length > 0) {
    const nombres = sinDatosCriticos.map((ej) => ej.ejercicioNombre ?? ej.ejercicioId ?? "desconocido");
    throw new Error(
      "Los ejercicios de fuerza/calistenia requieren repsMin y repsMax. " +
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
    nombre: nombreRutina,
    descripcion: args.descripcion ?? "",
    carpetaId,
    ejercicios: ejerciciosEnRutina,
    order,
    createdAt: new Date().toISOString(),
  });

  return {
    id: rutinaId,
    nombre: nombreRutina,
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
    if (!(diaNormalizado in plan.dias)) {
      throw new Error(
        `Día no reconocido: "${dia}". Usa lunes, martes, miercoles, jueves, viernes, sabado o domingo.`,
      );
    }

    // Resolver rutina: si es un ID válido (existe en DB), usarlo.
    // Si no, intentar buscar por nombre. null = día de descanso.
    let resolvedId: string | null = null;
    if (typeof rutinaIdOrName === "string" && rutinaIdOrName.trim().length > 0) {
      resolvedId = await resolveRutina(rutinaIdOrName, rutinaIdOrName);
      // Un nombre que no resuelve NO puede convertirse en día de descanso:
      // borraría la planificación del usuario sin avisar.
      if (!resolvedId) {
        throw new Error(
          `No se encontró ninguna rutina activa llamada "${rutinaIdOrName}" para el ${diaNormalizado}. ` +
          "No se ha modificado la planificación.",
        );
      }
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
 * Fecha y hora locales del sistema, usadas solo como último recurso cuando ni
 * el agente ni el usuario especifican una fecha. Nunca se usa `toISOString()`:
 * devuelve la fecha UTC y por la noche registraba el día anterior.
 */
async function ejecutarRegistrarPeso(
  args: RegistrarPesoArgs,
): Promise<{ valor: number; fecha: string; hora: string }> {
  const valor = exigirNumero(args.valor, "El peso corporal", RANGO_PESO_CORPORAL);
  const fechaEfectiva = args.fecha ? exigirFecha(args.fecha) : fechaLocalISO();
  const hora = args.hora?.trim() || horaLocalHHMM();

  const duplicado = await db.pesos
    .filter((p) => p.fecha === fechaEfectiva && p.hora === hora)
    .first();
  if (duplicado) {
    throw new Error(
      `Ya hay un peso registrado el ${fechaEfectiva} a las ${hora} (${duplicado.valor} kg). ` +
      "Usa editar_peso para corregirlo.",
    );
  }

  await db.pesos.add({
    fecha: fechaEfectiva,
    hora,
    valor,
  });

  return { valor, fecha: fechaEfectiva, hora };
}

async function ejecutarEditarPeso(
  args: EditarPesoArgs,
): Promise<{ valor: number; fecha: string; hora: string }> {
  const fecha = exigirFecha(args.fecha);
  const nuevoValor = exigirNumero(
    args.nuevoValor,
    "El nuevo peso corporal",
    RANGO_PESO_CORPORAL,
  );

  const registrosDelDia = await db.pesos
    .filter((p) => p.fecha === fecha)
    .toArray();

  if (registrosDelDia.length === 0) {
    throw new Error(`No se encontró ningún registro de peso en la fecha ${fecha}.`);
  }

  let encontrado: PesoDiario | undefined;
  if (args.hora) {
    encontrado = registrosDelDia.find((p) => p.hora === args.hora);
    if (!encontrado) {
      throw new Error(
        `No hay ningún peso registrado el ${fecha} a las ${args.hora}. ` +
        `Horas disponibles: ${listarNombres(registrosDelDia, (p) => p.hora)}.`,
      );
    }
  } else if (registrosDelDia.length === 1) {
    encontrado = registrosDelDia[0];
  } else {
    // Varios pesajes ese día: no adivinar cuál corregir.
    throw new Error(
      `Hay ${registrosDelDia.length} registros de peso el ${fecha} ` +
      `(${listarNombres(registrosDelDia, (p) => `${p.hora}: ${p.valor} kg`)}). Indica la hora exacta.`,
    );
  }

  await db.pesos.update(encontrado.id!, { valor: nuevoValor });

  return {
    valor: nuevoValor,
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
  const fecha = args.fecha ? exigirFecha(args.fecha) : fechaLocalISO();
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

    if (rutina.ejercicios.length === 0) {
      throw new Error(
        `La rutina "${rutina.nombre}" no tiene ejercicios. Añádelos antes de registrarla como completada.`,
      );
    }

    const logsDelDia = await db.logsEntrenamientos
      .where("fecha")
      .startsWith(fecha)
      .toArray();
    if (logsDelDia.some((log) => log.rutinaId === rutina.id)) {
      throw new Error(
        `Ya hay un entrenamiento de "${rutina.nombre}" registrado el ${fecha}. ` +
        "Usa editar_entrenamiento para modificarlo.",
      );
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

    ejerciciosReales = resueltos.map((ej) => {
      const nombre = ej.ejercicioNombre ?? ej.ejercicioId ?? "sin nombre";
      const seriesValidadas = validarSeriesReales(
        ej.series,
        `Ejercicio "${nombre}"`,
      );
      return {
        ejercicioId: ej.resolvedId!,
        series: seriesValidadas.map((s) => ({
          completado: s.completado ?? true,
          peso: s.peso,
          reps: s.reps,
          rpe: s.rpe,
          duracionMinutos: s.duracionMinutos,
          distanciaKm: s.distanciaKm,
        })),
      };
    });

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
  const fechaDia = exigirFecha(args.fecha);

  // Los logs guardan `fecha` como ISO completo (TrainingLoggerView) o como
  // YYYY-MM-DD (registrar_entrenamiento). Comparar por igualdad exacta hacía
  // que la herramienta no encontrara casi ningún entrenamiento real.
  const logsDelDia = await db.logsEntrenamientos
    .where("fecha")
    .startsWith(fechaDia)
    .toArray();

  if (logsDelDia.length === 0) {
    throw new Error(`No se encontró un entrenamiento registrado el ${fechaDia}.`);
  }

  // Resolver la rutina (ID o nombre) solo para filtrar. Si ya no existe en el
  // catálogo (p. ej. está archivada), se compara igualmente contra el log.
  const rutinaId = args.rutinaId || args.rutinaNombre
    ? await resolveRutina(args.rutinaId ?? null, args.rutinaNombre)
    : null;
  const nombreBuscado = args.rutinaNombre?.trim().toLowerCase() ?? "";

  const candidatos = logsDelDia.filter((log) => {
    if (rutinaId && log.rutinaId === rutinaId) return true;
    if (args.rutinaId && log.rutinaId === args.rutinaId) return true;
    if (nombreBuscado) {
      const snapshot = (log.rutinaSnapshot ?? "").trim().toLowerCase();
      if (snapshot === nombreBuscado) return true;
      if ((log.rutinaId ?? "").trim().toLowerCase() === nombreBuscado) return true;
    }
    return !args.rutinaId && !args.rutinaNombre;
  });

  if (candidatos.length === 0) {
    const referencia = args.rutinaNombre
      ? ` para la rutina "${args.rutinaNombre}"`
      : args.rutinaId
        ? ` para la rutina ${args.rutinaId}`
        : "";
    throw new Error(
      `No se encontró un entrenamiento el ${fechaDia}${referencia}.`,
    );
  }

  if (candidatos.length > 1) {
    throw new Error(
      `Hay ${candidatos.length} entrenamientos registrados el ${fechaDia}. ` +
      "Especifica rutinaId o rutinaNombre para editar el correcto; si son duplicados del mismo entrenamiento, elimina el sobrante desde el historial.",
    );
  }

  // ── Cargar el log actual ────────────────────────────────────────
  const log = candidatos[0];
  const logId = log.id;
  if (logId == null) {
    throw new Error(
      `El entrenamiento del ${fechaDia} no tiene identificador; no se puede editar.`,
    );
  }
  const rutinaSnapshot = log.rutinaSnapshot ?? log.rutinaId;

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
      const nombre = mod.ejercicioNombre ?? mod.ejercicioId ?? "sin nombre";

      if (!Array.isArray(mod.series) || mod.series.length === 0) {
        throw new Error(
          `Ejercicio "${nombre}": debes indicar al menos una serie a modificar.`,
        );
      }

      const targetId = await requireEjercicioId(mod.ejercicioId, mod.ejercicioNombre);

      // Encontrar el ejercicio en el log
      const idx = ejercicios.findIndex((ej) => ej.ejercicioId === targetId);
      if (idx === -1) {
        throw new Error(
          `El ejercicio "${nombre}" no pertenece al entrenamiento indicado.`,
        );
      }

      // Aplicar modificaciones a las series indicadas
      const seriesMod = [...ejercicios[idx].series];
      for (const sMod of mod.series) {
        const serieIdx = exigirNumero(
          sMod.serieIdx,
          `Ejercicio "${nombre}": serieIdx`,
          { min: 0, max: 999 },
          true,
        );
        if (serieIdx >= seriesMod.length) {
          throw new Error(
            `La serie ${serieIdx} no existe para "${nombre}" (tiene ${seriesMod.length} series, índice 0 = primera).`,
          );
        }

        const actual = seriesMod[serieIdx];
        seriesMod[serieIdx] = {
          ...actual,
          ...(sMod.peso !== undefined
            ? { peso: exigirNumero(sMod.peso, `Ejercicio "${nombre}", serie ${serieIdx + 1}: peso`, RANGO_PESO) }
            : {}),
          ...(sMod.reps !== undefined
            ? { reps: exigirNumero(sMod.reps, `Ejercicio "${nombre}", serie ${serieIdx + 1}: reps`, RANGO_REPS, true) }
            : {}),
          ...(sMod.completado !== undefined ? { completado: sMod.completado } : {}),
          ...(sMod.rpe !== undefined
            ? { rpe: exigirNumero(sMod.rpe, `Ejercicio "${nombre}", serie ${serieIdx + 1}: RPE`, RANGO_RPE) }
            : {}),
          ...(sMod.duracionMinutos !== undefined
            ? { duracionMinutos: exigirNumero(sMod.duracionMinutos, `Ejercicio "${nombre}", serie ${serieIdx + 1}: duración`, RANGO_DURACION) }
            : {}),
          ...(sMod.distanciaKm !== undefined
            ? { distanciaKm: exigirNumero(sMod.distanciaKm, `Ejercicio "${nombre}", serie ${serieIdx + 1}: distancia`, RANGO_DISTANCIA) }
            : {}),
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

    const nuevosEjercicios: EjercicioReal[] = resueltos.map((ej) => {
      const nombre = ej.ejercicioNombre ?? ej.ejercicioId ?? "sin nombre";
      const seriesValidadas = validarSeriesReales(
        ej.series,
        `Ejercicio "${nombre}"`,
      );
      return {
        ejercicioId: ej.resolvedId!,
        series: seriesValidadas.map((s) => ({
          completado: s.completado ?? true,
          peso: s.peso,
          reps: s.reps,
          rpe: s.rpe,
          duracionMinutos: s.duracionMinutos,
          distanciaKm: s.distanciaKm,
        })),
      };
    });

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
    fecha: fechaDia,
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
          message: result.creada
            ? `Carpeta "${result.nombre}" creada correctamente.`
            : `La carpeta "${result.nombre}" ya existía — no se ha creado un duplicado.`,
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
 * Orden de ejecución dentro de un mismo lote, por dependencias.
 *
 * El modelo propone acciones en el orden en que se le ocurren: puede pedir
 * "monta la rutina X con estos ejercicios nuevos" y listar la rutina antes de
 * los `crear_ejercicio`. Como todo va en una sola transacción, ejecutar en el
 * orden de llegada hacía fallar la rutina por "ejercicio no encontrado".
 * Las creaciones van primero y los resultados se devuelven después en el
 * orden original, que es el que usa la vista para emparejarlos con la tarjeta.
 */
const PRIORIDAD_POR_TOOL: Record<string, number> = {
  crear_carpeta: 0,
  crear_ejercicio: 0,
  crear_rutina: 1,
  editar_rutina: 2,
  reordenar_rutina: 2,
  editar_ejercicio: 2,
  editar_carpeta: 2,
  actualizar_planificacion_semanal: 3,
  registrar_entrenamiento: 3,
  editar_entrenamiento: 3,
  registrar_peso: 3,
  editar_peso: 3,
};

function prioridadDeTool(nombre: string): number {
  return PRIORIDAD_POR_TOOL[nombre] ?? 3;
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
      const porIndice = new Map<number, ToolExecutionResult>();
      const orden = calls
        .map((call, index) => ({ call, index }))
        .sort(
          (a, b) => prioridadDeTool(a.call.name) - prioridadDeTool(b.call.name),
        );

      for (const { call, index } of orden) {
        const result = await executeFunctionCallInTransaction(call);
        if (!result.success) throw new Error(result.message);
        porIndice.set(index, result);
      }

      return calls.map(
        (call, index) =>
          porIndice.get(index) ?? {
            success: false,
            message: `No se ejecutó ${call.name}.`,
          },
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return calls.map((call) => ({
      success: false,
      message: `Transacción cancelada para ${call.name}: ${message}`,
    }));
  }
}
