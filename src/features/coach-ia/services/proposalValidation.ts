import type {
  Carpeta,
  Ejercicio,
  LogEntrenamiento,
  PesoDiario,
  Rutina,
} from "../../../core/db";
import { diaDeFecha, esFechaISO } from "../../../core/utils/dates";
import type { FunctionCallProposal } from "./geminiService";

/**
 * Pre-validación de las propuestas del Coach antes de ejecutarlas.
 *
 * El ejecutor valida igual, pero toda la propuesta se ejecuta en una sola
 * transacción: si una acción falla, se revierten todas y el usuario ve el
 * mismo error repetido. Esta comprobación muestra el problema en la tarjeta
 * antes de confirmar, sin haber tocado datos.
 *
 * Separa lo que impide ejecutar (`errores`, el ejecutor lo rechazaría) de lo
 * que solo conviene mirar (`avisos`, como una serie sin peso objetivo):
 * bloquear la confirmación por un aviso dejaba al usuario sin salida.
 */

export interface ContextoPropuesta {
  rutinas: Rutina[];
  ejercicios: Ejercicio[];
  carpetas: Carpeta[];
  logs: LogEntrenamiento[];
  pesos: PesoDiario[];
}

const TIPOS_VALIDOS = ["fuerza", "cardio", "tiempo", "calistenia"];

const GRUPOS_VALIDOS = [
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

const DIAS_VALIDOS = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

const PESO_CORPORAL = { min: 20, max: 400 };
const RANGO_SERIES = { min: 1, max: 20 };
const RANGO_REPS = { min: 0, max: 1000 };
const RANGO_RPE = { min: 1, max: 10 };
const RANGO_PESO = { min: 0, max: 1000 };

function normalizar(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function numero(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor === "string" && valor.trim() !== "") {
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : null;
  }
  return null;
}

function objetos(valor: unknown): Record<string, unknown>[] {
  return Array.isArray(valor)
    ? valor.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
    : [];
}

function buscarCoincidencias<T>(
  items: T[],
  nombre: string,
  getNombre: (item: T) => string,
): T[] {
  const objetivo = normalizar(nombre);
  if (objetivo.length === 0) return [];

  const exactos = items.filter(
    (item) => normalizar(getNombre(item)) === objetivo,
  );
  if (exactos.length > 0) return exactos;

  // Solo si el nombre del catálogo aparece completo en lo pedido: nunca se
  // acorta el nombre real para que no se elija un ejercicio equivocado.
  return items.filter((item) => objetivo.includes(normalizar(getNombre(item))));
}

interface Resolucion<T> {
  encontrado: T | null;
  ambiguos: T[];
}

function resolver<T>(
  items: T[],
  nombre: unknown,
  idBuscado: unknown,
  getId: (item: T) => string,
  getNombre: (item: T) => string,
): Resolucion<T> {
  const id = texto(idBuscado);
  if (id.length > 0) {
    const porId = items.find((item) => getId(item) === id);
    if (porId) return { encontrado: porId, ambiguos: [] };
  }

  const buscado = texto(nombre);
  if (buscado.length === 0) return { encontrado: null, ambiguos: [] };

  const coincidencias = buscarCoincidencias(items, buscado, getNombre);
  if (coincidencias.length === 1) {
    return { encontrado: coincidencias[0], ambiguos: [] };
  }
  return { encontrado: null, ambiguos: coincidencias };
}

function describir(valor: unknown, campo: unknown): string {
  return texto(valor) || texto(campo) || "sin nombre";
}

function describirAmbiguos<T>(items: T[], getNombre: (item: T) => string): string {
  return items.map(getNombre).join(", ");
}

function fueraDeRango(
  valor: unknown,
  etiqueta: string,
  rango: { min: number; max: number },
  entero = false,
): string | null {
  const convertido = numero(valor);
  if (convertido === null) return `${etiqueta} no es un número válido.`;
  if (entero && !Number.isInteger(convertido)) {
    return `${etiqueta} debe ser entero (${convertido}).`;
  }
  if (convertido < rango.min || convertido > rango.max) {
    return `${etiqueta} fuera de rango (${convertido}); debe estar entre ${rango.min} y ${rango.max}.`;
  }
  return null;
}

function ejerciciosActivos(contexto: ContextoPropuesta): Ejercicio[] {
  return contexto.ejercicios.filter((ejercicio) => !ejercicio.isArchived);
}

function rutinasActivas(contexto: ContextoPropuesta): Rutina[] {
  return contexto.rutinas.filter((rutina) => !rutina.isArchived);
}

function logsDelDia(contexto: ContextoPropuesta, fecha: string): LogEntrenamiento[] {
  return contexto.logs.filter(
    (log) => diaDeFecha(log.fecha) === fecha,
  );
}

/** Añade los problemas de un ejercicio de rutina (catálogo, series y objetivos). */
function validarEjercicioDeRutina(
  ref: Record<string, unknown>,
  etiqueta: string,
  contexto: ContextoPropuesta,
  problemas: string[],
  avisos: string[],
): Ejercicio | null {
  const activos = ejerciciosActivos(contexto);
  const resolucion = resolver(
    activos,
    ref.ejercicioNombre,
    ref.ejercicioId,
    (ejercicio) => ejercicio.id,
    (ejercicio) => ejercicio.nombre,
  );

  if (!resolucion.encontrado) {
    if (resolucion.ambiguos.length > 1) {
      problemas.push(
        `${etiqueta}: "${describir(ref.ejercicioNombre, ref.ejercicioId)}" coincide con varios ejercicios (${describirAmbiguos(resolucion.ambiguos, (e) => e.nombre)}).`,
      );
    } else {
      problemas.push(
        `${etiqueta}: "${describir(ref.ejercicioNombre, ref.ejercicioId)}" no está en el catálogo activo.`,
      );
    }
    return null;
  }

  const ejercicio = resolucion.encontrado;

  const problemaSeries = fueraDeRango(
    ref.series,
    `${etiqueta}: series`,
    RANGO_SERIES,
    true,
  );
  if (problemaSeries) problemas.push(problemaSeries);

  if (ref.repsMin != null && ref.repsMax != null) {
    const minimo = numero(ref.repsMin);
    const maximo = numero(ref.repsMax);
    if (minimo !== null && maximo !== null && minimo > maximo) {
      problemas.push(`${etiqueta}: repsMin (${minimo}) es mayor que repsMax (${maximo}).`);
    }
  }

  const tipo = ejercicio.tipo ?? "fuerza";
  if (tipo === "fuerza" || tipo === "calistenia") {
    // Las reps sí se exigen: el ejecutor rechaza la rutina sin ellas.
    const faltan: string[] = [];
    if (ref.repsMin == null) faltan.push("repsMin");
    if (ref.repsMax == null) faltan.push("repsMax");
    if (faltan.length > 0) {
      problemas.push(
        `${etiqueta}: "${ejercicio.nombre}" es de ${tipo} y falta ${faltan.join(", ")}.`,
      );
    }
    // El peso, en cambio, es opcional de verdad (dominadas, fondos, peso
    // corporal): se avisa pero no se bloquea la confirmación.
    if (ref.pesoObjetivo == null) {
      avisos.push(
        `${etiqueta}: "${ejercicio.nombre}" no indica peso objetivo; la serie quedará sin peso.`,
      );
    }
  }

  return ejercicio;
}

/** Índice de una rutina simulada creada en este mismo lote, o null. */
function indiceDeRutinaPendiente(id: string): number | null {
  const prefijo = "pendiente:rutina:";
  if (!id.startsWith(prefijo)) return null;
  const indice = Number(id.slice(prefijo.length));
  return Number.isInteger(indice) ? indice : null;
}

function validarCrearRutina(
  args: Record<string, unknown>,
  contexto: ContextoPropuesta,
  problemas: string[],
  avisos: string[],
  /** Posición de esta propuesta en el lote (para no compararse consigo misma). */
  indicePropio?: number,
): void {
  const nombre = texto(args.nombre);
  if (nombre.length === 0) {
    problemas.push("La rutina necesita un nombre.");
  } else if (
    rutinasActivas(contexto).some((rutina) => {
      if (normalizar(rutina.nombre) !== normalizar(nombre)) return false;
      const indicePendiente = indiceDeRutinaPendiente(rutina.id);
      // Las creadas en este lote solo cuentan si van antes que esta.
      if (indicePendiente !== null) {
        return indicePropio !== undefined && indicePendiente < indicePropio;
      }
      return true;
    })
  ) {
    problemas.push(`Ya existe una rutina activa llamada "${nombre}".`);
  }

  const ejercicios = objetos(args.ejercicios);
  if (ejercicios.length === 0) {
    problemas.push("La rutina no tiene ejercicios.");
    return;
  }

  const vistos = new Set<string>();
  ejercicios.forEach((ref, index) => {
    const encontrado = validarEjercicioDeRutina(
      ref,
      `Ejercicio ${index + 1}`,
      contexto,
      problemas,
      avisos,
    );
    if (!encontrado) return;
    if (vistos.has(encontrado.id)) {
      problemas.push(`El ejercicio "${encontrado.nombre}" está repetido en la rutina.`);
    }
    vistos.add(encontrado.id);
  });
}

function validarEditarRutina(
  args: Record<string, unknown>,
  contexto: ContextoPropuesta,
  problemas: string[],
  avisos: string[],
): void {
  const activas = rutinasActivas(contexto);
  const resolucion = resolver(
    activas,
    args.rutinaNombre,
    args.rutinaId,
    (rutina) => rutina.id,
    (rutina) => rutina.nombre,
  );

  if (!resolucion.encontrado) {
    problemas.push(
      resolucion.ambiguos.length > 1
        ? `"${describir(args.rutinaNombre, args.rutinaId)}" coincide con varias rutinas (${describirAmbiguos(resolucion.ambiguos, (r) => r.nombre)}).`
        : `No se encontró la rutina "${describir(args.rutinaNombre, args.rutinaId)}".`,
    );
    return;
  }

  const rutina = resolucion.encontrado;
  const idsEnRutina = new Set(rutina.ejercicios.map((ejercicio) => ejercicio.ejercicioId));

  if (args.nombre !== undefined) {
    const nuevoNombre = texto(args.nombre);
    if (nuevoNombre.length === 0) {
      problemas.push("El nuevo nombre de la rutina no puede estar vacío.");
    } else if (
      activas.some(
        (otra) =>
          otra.id !== rutina.id &&
          normalizar(otra.nombre) === normalizar(nuevoNombre),
      )
    ) {
      problemas.push(`Ya existe otra rutina activa llamada "${nuevoNombre}".`);
    }
  }

  const modificar = objetos(args.ejerciciosModificar);
  modificar.forEach((mod, index) => {
    const etiqueta = `Modificación ${index + 1}`;
    // Se admiten ejercicios archivados si ya están dentro de la rutina.
    const resolucionEjercicio = resolver(
      contexto.ejercicios,
      mod.ejercicioNombre,
      mod.ejercicioId,
      (ejercicio) => ejercicio.id,
      (ejercicio) => ejercicio.nombre,
    );

    if (!resolucionEjercicio.encontrado) {
      problemas.push(
        `${etiqueta}: "${describir(mod.ejercicioNombre, mod.ejercicioId)}" no está en el catálogo activo.`,
      );
      return;
    }
    if (!idsEnRutina.has(resolucionEjercicio.encontrado.id)) {
      problemas.push(
        `${etiqueta}: "${resolucionEjercicio.encontrado.nombre}" no pertenece a la rutina.`,
      );
    }
    if (mod.series != null) {
      const problema = fueraDeRango(
        mod.series,
        `${etiqueta}: series`,
        RANGO_SERIES,
        true,
      );
      if (problema) problemas.push(problema);
    }
  });

  const agregar = objetos(args.ejerciciosAgregar);
  agregar.forEach((ref, index) => {
    const etiqueta = `Añadido ${index + 1}`;
    const encontrado = validarEjercicioDeRutina(
      ref,
      etiqueta,
      contexto,
      problemas,
      avisos,
    );
    if (encontrado && idsEnRutina.has(encontrado.id)) {
      problemas.push(
        `${etiqueta}: "${encontrado.nombre}" ya está en la rutina (usa modificarlo, no añadirlo).`,
      );
    }
  });

  const quitar = objetos(args.ejerciciosQuitar);
  quitar.forEach((ref, index) => {
    const etiqueta = `Quitado ${index + 1}`;
    const resolucionEjercicio = resolver(
      contexto.ejercicios,
      ref.ejercicioNombre,
      ref.ejercicioId,
      (ejercicio) => ejercicio.id,
      (ejercicio) => ejercicio.nombre,
    );
    if (!resolucionEjercicio.encontrado) {
      problemas.push(
        `${etiqueta}: "${describir(ref.ejercicioNombre, ref.ejercicioId)}" no existe en el catálogo.`,
      );
      return;
    }
    if (!idsEnRutina.has(resolucionEjercicio.encontrado.id)) {
      problemas.push(
        `${etiqueta}: "${resolucionEjercicio.encontrado.nombre}" no está en la rutina.`,
      );
    }
  });

  const tieneCambios =
    args.nombre !== undefined ||
    args.descripcion !== undefined ||
    modificar.length > 0 ||
    agregar.length > 0 ||
    quitar.length > 0;
  if (!tieneCambios) {
    problemas.push("No se indicó ningún cambio para la rutina.");
  }
}

function validarReordenar(
  args: Record<string, unknown>,
  contexto: ContextoPropuesta,
  problemas: string[],
): void {
  const resolucion = resolver(
    rutinasActivas(contexto),
    args.rutinaNombre,
    args.rutinaId,
    (rutina) => rutina.id,
    (rutina) => rutina.nombre,
  );
  if (!resolucion.encontrado) {
    problemas.push(
      `No se encontró la rutina "${describir(args.rutinaNombre, args.rutinaId)}".`,
    );
    return;
  }

  const rutina = resolucion.encontrado;
  const idsEsperados = new Set(rutina.ejercicios.map((ejercicio) => ejercicio.ejercicioId));
  const orden = objetos(args.ordenEjercicios);
  const vistos = new Set<string>();

  if (orden.length !== idsEsperados.size) {
    problemas.push(
      `El nuevo orden debe incluir los ${idsEsperados.size} ejercicios de la rutina (se han indicado ${orden.length}).`,
    );
  }

  orden.forEach((ref, index) => {
    // La rutina puede contener ejercicios archivados: se resuelven todos.
    const resolucionEjercicio = resolver(
      contexto.ejercicios,
      ref.ejercicioNombre,
      ref.ejercicioId,
      (ejercicio) => ejercicio.id,
      (ejercicio) => ejercicio.nombre,
    );
    if (!resolucionEjercicio.encontrado) {
      problemas.push(
        `Posición ${index + 1}: "${describir(ref.ejercicioNombre, ref.ejercicioId)}" no está en el catálogo activo.`,
      );
      return;
    }
    if (!idsEsperados.has(resolucionEjercicio.encontrado.id)) {
      problemas.push(
        `Posición ${index + 1}: "${resolucionEjercicio.encontrado.nombre}" no pertenece a la rutina.`,
      );
      return;
    }
    if (vistos.has(resolucionEjercicio.encontrado.id)) {
      problemas.push(
        `El ejercicio "${resolucionEjercicio.encontrado.nombre}" aparece repetido en el orden.`,
      );
    }
    vistos.add(resolucionEjercicio.encontrado.id);
  });
}

function validarEntrenamientoLibre(
  ref: Record<string, unknown>,
  contexto: ContextoPropuesta,
  etiqueta: string,
  problemas: string[],
): void {
  const resolucion = resolver(
    ejerciciosActivos(contexto),
    ref.ejercicioNombre,
    ref.ejercicioId,
    (ejercicio) => ejercicio.id,
    (ejercicio) => ejercicio.nombre,
  );
  if (!resolucion.encontrado) {
    problemas.push(
      etiqueta === ""
        ? `"${describir(ref.ejercicioNombre, ref.ejercicioId)}" no está en el catálogo activo.`
        : `${etiqueta}: "${describir(ref.ejercicioNombre, ref.ejercicioId)}" no está en el catálogo activo.`,
    );
    return;
  }

  const nombre = resolucion.encontrado.nombre;
  const prefijo = etiqueta.length > 0 ? `${etiqueta}: ` : "";

  const series = objetos(ref.series);
  if (series.length === 0) {
    problemas.push(`${prefijo}"${nombre}" no tiene series.`);
    return;
  }

  series.forEach((serie, index) => {
    const etiquetaSerie = `${prefijo}${nombre} serie ${index + 1}`;
    const peso = serie.peso == null ? null : fueraDeRango(serie.peso, `${etiquetaSerie} peso`, RANGO_PESO);
    if (peso) problemas.push(peso);
    const reps = serie.reps == null ? null : fueraDeRango(serie.reps, `${etiquetaSerie} reps`, RANGO_REPS, true);
    if (reps) problemas.push(reps);
    const rpe = serie.rpe == null ? null : fueraDeRango(serie.rpe, `${etiquetaSerie} RPE`, RANGO_RPE);
    if (rpe) problemas.push(rpe);
  });
}

export interface RevisionPropuestas {
  /** Impiden ejecutar la acción: el ejecutor la rechazaría. */
  errores: string[];
  /** Cosas que conviene mirar pero que se pueden confirmar tal cual. */
  avisos: string[];
}

export function validarPropuestas(
  proposals: FunctionCallProposal[],
  contextoBase: ContextoPropuesta,
): RevisionPropuestas {
  const problemas: string[] = [];
  const avisos: string[] = [];

  // El lote se ejecuta entero de una vez (y las creaciones van primero), así
  // que un ejercicio o una rutina creados en este mismo turno cuentan como si
  // ya existieran: sin esto, "crea estos ejercicios y monta la rutina" se
  // bloqueaba porque el catálogo aún no los tenía guardados.
  const contexto: ContextoPropuesta = {
    rutinas: [...contextoBase.rutinas],
    ejercicios: [...contextoBase.ejercicios],
    carpetas: [...contextoBase.carpetas],
    logs: [...contextoBase.logs],
    pesos: [...contextoBase.pesos],
  };

  proposals.forEach((proposal, index) => {
    const args = (proposal.args ?? {}) as Record<string, unknown>;

    if (proposal.name === "crear_ejercicio") {
      const nombre = texto(args.nombre);
      if (nombre.length === 0) return;
      if (contexto.ejercicios.some((ejercicio) => normalizar(ejercicio.nombre) === normalizar(nombre))) {
        return;
      }
      const grupo = normalizar(texto(args.grupoMuscular));
      const tipo = normalizar(texto(args.tipo));
      contexto.ejercicios.push({
        id: `pendiente:ejercicio:${index}`,
        nombre,
        grupoMuscular: GRUPOS_VALIDOS.includes(grupo)
          ? (grupo as Ejercicio["grupoMuscular"])
          : undefined,
        tipo: TIPOS_VALIDOS.includes(tipo as Ejercicio["tipo"])
          ? (tipo as Ejercicio["tipo"])
          : "fuerza",
        descripcion: texto(args.descripcion) || undefined,
        isArchived: false,
      });
    }

    if (proposal.name === "crear_rutina") {
      const nombre = texto(args.nombre);
      if (nombre.length === 0) return;
      contexto.rutinas.push({
        id: `pendiente:rutina:${index}`,
        nombre,
        ejercicios: [],
        order: 0,
        createdAt: new Date().toISOString(),
        isArchived: false,
      });
    }
  });

  for (const [indice, proposal] of proposals.entries()) {
    const args = (proposal.args ?? {}) as Record<string, unknown>;

    switch (proposal.name) {
      case "crear_carpeta": {
        if (texto(args.nombre).length === 0) {
          problemas.push("La carpeta necesita un nombre.");
        }
        break;
      }
      case "editar_carpeta": {
        if (texto(args.nombre).length === 0) {
          problemas.push("La carpeta necesita un nombre nuevo.");
        }
        const resolucion = resolver(
          contexto.carpetas,
          args.carpetaNombre,
          args.carpetaId,
          (carpeta) => carpeta.id,
          (carpeta) => carpeta.nombre,
        );
        if (!resolucion.encontrado) {
          problemas.push(
            `No se encontró la carpeta "${describir(args.carpetaNombre, args.carpetaId)}".`,
          );
        } else if (
          texto(args.nombre).length > 0 &&
          contexto.carpetas.some(
            (carpeta) =>
              carpeta.id !== resolucion.encontrado!.id &&
              normalizar(carpeta.nombre) === normalizar(texto(args.nombre)),
          )
        ) {
          problemas.push(`Ya existe una carpeta llamada "${texto(args.nombre)}".`);
        }
        break;
      }
      case "crear_ejercicio": {
        if (texto(args.nombre).length === 0) {
          problemas.push("El ejercicio necesita un nombre.");
        }
        // Un duplicado no es un error: el ejecutor devuelve el existente sin duplicar.
        if (!GRUPOS_VALIDOS.includes(normalizar(texto(args.grupoMuscular)))) {
          problemas.push(
            `Grupo muscular no válido: "${texto(args.grupoMuscular)}".`,
          );
        }
        break;
      }
      case "editar_ejercicio": {
        const resolucion = resolver(
          contexto.ejercicios,
          args.ejercicioNombre,
          args.ejercicioId,
          (ejercicio) => ejercicio.id,
          (ejercicio) => ejercicio.nombre,
        );
        if (!resolucion.encontrado) {
          problemas.push(
            `No se encontró el ejercicio "${describir(args.ejercicioNombre, args.ejercicioId)}".`,
          );
        } else if (args.nombre !== undefined) {
          const nuevoNombre = texto(args.nombre);
          if (nuevoNombre.length === 0) {
            problemas.push("El nuevo nombre del ejercicio no puede estar vacío.");
          } else if (
            contexto.ejercicios.some(
              (ejercicio) =>
                ejercicio.id !== resolucion.encontrado!.id &&
                normalizar(ejercicio.nombre) === normalizar(nuevoNombre),
            )
          ) {
            problemas.push(`Ya existe un ejercicio llamado "${nuevoNombre}".`);
          }
        }
        if (
          args.grupoMuscular !== undefined &&
          !GRUPOS_VALIDOS.includes(normalizar(texto(args.grupoMuscular)))
        ) {
          problemas.push(
            `Grupo muscular no válido: "${texto(args.grupoMuscular)}".`,
          );
        }
        if (
          args.nombre === undefined &&
          args.grupoMuscular === undefined &&
          args.tipo === undefined &&
          args.descripcion === undefined
        ) {
          problemas.push("No se indicó ningún cambio para el ejercicio.");
        }
        break;
      }
      case "crear_rutina":
        validarCrearRutina(args, contexto, problemas, avisos, indice);
        break;
      case "editar_rutina":
        validarEditarRutina(args, contexto, problemas, avisos);
        break;
      case "reordenar_rutina":
        validarReordenar(args, contexto, problemas);
        break;
      case "actualizar_planificacion_semanal": {
        const dias = (args.dias ?? {}) as Record<string, unknown>;
        if (Object.keys(dias).length === 0) {
          problemas.push("No se indicó ningún día para la planificación.");
        }
        for (const [dia, valor] of Object.entries(dias)) {
          if (!DIAS_VALIDOS.includes(normalizar(dia))) {
            problemas.push(`Día no válido: "${dia}".`);
            continue;
          }
          const nombre = texto(valor);
          if (nombre.length === 0) continue;
          const resolucion = resolver(
            rutinasActivas(contexto),
            nombre,
            nombre,
            (rutina) => rutina.id,
            (rutina) => rutina.nombre,
          );
          if (!resolucion.encontrado) {
            problemas.push(
              `No se encontró la rutina "${nombre}" para el ${dia} (la planificación no se modificará).`,
            );
          }
        }
        break;
      }
      case "registrar_peso": {
        const problema = fueraDeRango(
          args.valor,
          "El peso corporal",
          PESO_CORPORAL,
        );
        if (problema) problemas.push(problema);
        if (args.fecha !== undefined && !esFechaISO(diaDeFecha(texto(args.fecha)))) {
          problemas.push(`Fecha no válida: "${texto(args.fecha)}".`);
        }
        break;
      }
      case "editar_peso": {
        const problema = fueraDeRango(
          args.nuevoValor,
          "El nuevo peso corporal",
          PESO_CORPORAL,
        );
        if (problema) problemas.push(problema);

        const fecha = diaDeFecha(texto(args.fecha));
        if (!esFechaISO(fecha)) {
          problemas.push(`Fecha no válida: "${texto(args.fecha)}".`);
          break;
        }
        const registros = contexto.pesos.filter((peso) => peso.fecha === fecha);
        if (registros.length === 0) {
          problemas.push(`No hay ningún peso registrado el ${fecha}.`);
        } else if (registros.length > 1 && texto(args.hora).length === 0) {
          problemas.push(
            `Hay ${registros.length} pesajes el ${fecha}; indica la hora exacta.`,
          );
        } else if (
          texto(args.hora).length > 0 &&
          !registros.some((peso) => peso.hora === texto(args.hora))
        ) {
          problemas.push(`No hay ningún peso el ${fecha} a las ${texto(args.hora)}.`);
        }
        break;
      }
      case "registrar_entrenamiento": {
        const fecha = texto(args.fecha);
        if (fecha.length > 0 && !esFechaISO(diaDeFecha(fecha))) {
          problemas.push(`Fecha no válida: "${fecha}".`);
        }

        const tieneRutina = texto(args.rutinaId) || texto(args.rutinaNombre);
        const libres = objetos(args.ejercicios);

        if (tieneRutina) {
          const resolucionRutina = resolver(
            rutinasActivas(contexto),
            args.rutinaNombre,
            args.rutinaId,
            (rutina) => rutina.id,
            (rutina) => rutina.nombre,
          );
          if (!resolucionRutina.encontrado) {
            problemas.push(
              `No se encontró la rutina "${describir(args.rutinaNombre, args.rutinaId)}".`,
            );
          } else if (esFechaISO(diaDeFecha(fecha || ""))) {
            const duplicado = logsDelDia(contexto, diaDeFecha(fecha)).some(
              (log) => log.rutinaId === resolucionRutina.encontrado!.id,
            );
            if (duplicado) {
              problemas.push(
                `Ya hay un entrenamiento de esa rutina registrado el ${diaDeFecha(fecha)}.`,
              );
            }
          }
        } else if (libres.length === 0) {
          problemas.push(
            "El entrenamiento necesita una rutina o al menos un ejercicio.",
          );
        } else {
          libres.forEach((ref) => {
            validarEntrenamientoLibre(ref, contexto, "", problemas);
          });
        }
        break;
      }
      case "editar_entrenamiento": {
        const fecha = diaDeFecha(texto(args.fecha));
        if (!esFechaISO(fecha)) {
          problemas.push(`Fecha no válida: "${texto(args.fecha)}".`);
          break;
        }

        const logs = logsDelDia(contexto, fecha);
        if (logs.length === 0) {
          problemas.push(`No hay ningún entrenamiento registrado el ${fecha}.`);
          break;
        }

        const tieneReferencia = texto(args.rutinaId) || texto(args.rutinaNombre);
        let objetivo: LogEntrenamiento | null = logs[0] ?? null;

        if (tieneReferencia) {
          const nombreBuscado = normalizar(texto(args.rutinaNombre));
          const idBuscado = texto(args.rutinaId);
          const filtrados = logs.filter(
            (log) =>
              (idBuscado.length > 0 && log.rutinaId === idBuscado) ||
              (nombreBuscado.length > 0 &&
                normalizar(log.rutinaSnapshot ?? "") === nombreBuscado),
          );
          if (filtrados.length === 0) {
            problemas.push(
              `No hay ningún entrenamiento el ${fecha} para "${describir(args.rutinaNombre, args.rutinaId)}".`,
            );
            break;
          }
          if (filtrados.length > 1) {
            problemas.push(
              `Hay ${filtrados.length} entrenamientos ese día para esa rutina; no se puede editar sin ambigüedad.`,
            );
            break;
          }
          objetivo = filtrados[0];
        } else if (logs.length > 1) {
          problemas.push(
            `Hay ${logs.length} entrenamientos el ${fecha}; indica la rutina para editar el correcto.`,
          );
          break;
        }

        objetos(args.ejerciciosAgregar).forEach((ref) => {
          validarEntrenamientoLibre(ref, contexto, "", problemas);
        });

        objetos(args.ejerciciosModificar).forEach((mod, index) => {
          const etiqueta = `Modificación ${index + 1}`;
          // Un log puede contener ejercicios que después se archivaron.
          const resolucion = resolver(
            contexto.ejercicios,
            mod.ejercicioNombre,
            mod.ejercicioId,
            (ejercicio) => ejercicio.id,
            (ejercicio) => ejercicio.nombre,
          );
          if (!resolucion.encontrado) {
            problemas.push(
              `${etiqueta}: "${describir(mod.ejercicioNombre, mod.ejercicioId)}" no está en el catálogo activo.`,
            );
            return;
          }

          const delLog = objetivo?.ejercicios.find(
            (ejercicio) => ejercicio.ejercicioId === resolucion.encontrado!.id,
          );
          if (!delLog) {
            problemas.push(
              `${etiqueta}: "${resolucion.encontrado.nombre}" no está en ese entrenamiento.`,
            );
            return;
          }

          const series = objetos(mod.series);
          if (series.length === 0) {
            problemas.push(`${etiqueta}: no se indicó ninguna serie a modificar.`);
            return;
          }

          series.forEach((serie) => {
            const indice = numero(serie.serieIdx);
            if (
              indice === null ||
              !Number.isInteger(indice) ||
              indice < 0 ||
              indice >= delLog.series.length
            ) {
              problemas.push(
                `${etiqueta}: la serie ${String(serie.serieIdx)} no existe en "${resolucion.encontrado!.nombre}" (tiene ${delLog.series.length}).`,
              );
            }
          });
        });
        break;
      }
      default:
        break;
    }
  }

  return {
    errores: [...new Set(problemas)],
    avisos: [...new Set(avisos)],
  };
}
