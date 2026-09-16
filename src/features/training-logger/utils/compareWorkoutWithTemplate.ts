import {
  db,
  type EjercicioReal,
  type Rutina,
  type Serie,
} from "../../../core/db";

// ── Tipos de diff ────────────────────────────────────────────────────

export interface SerieMejora {
  serieIdx: number;
  pesoAnterior?: number;
  pesoNuevo: number;
  repsAnterior?: number;
  repsNuevo: number;
  duracionAnterior?: number;
  duracionNuevo?: number;
  distanciaAnterior?: number;
  distanciaNuevo?: number;
}

export interface EjercicioMejora {
  ejercicioId: string;
  /** Nombre del ejercicio desde el catálogo (lo rellena el caller). */
  nombre: string;
  mejoras: SerieMejora[];
  /** Número de series completadas extra (más allá de las que tiene la plantilla). */
  seriesExtra: number;
}

// ── Comparación ──────────────────────────────────────────────────────

/**
 * Compara los ejercicios reales del entrenamiento contra la plantilla
 * de la rutina. Detecta mejoras al alza en peso, reps, duración o
 * distancia, así como series extra completadas.
 *
 * Solo se comparan series marcadas como `completado: true`.
 * Los ejercicios se emparejan por `ejercicioId` (primera coincidencia
 * en la plantilla). Ejercicios añadidos ad-hoc (sin correspondencia)
 * se ignoran.
 */
export type SustitucionesLogger = Record<
  string,
  {
    rutinaEjercicioId: string;
    originalEjercicioId: string;
    nuevoEjercicioId: string;
  }
>;

function plantillaConSustituciones(
  rutina: Rutina,
  sustituciones?: SustitucionesLogger,
) {
  return rutina.ejercicios.map((ejTemplate) => {
    const sustitucion = Object.values(sustituciones ?? {}).find(
      (item) => item.rutinaEjercicioId === ejTemplate.id,
    );
    return sustitucion
      ? { ...ejTemplate, ejercicioId: sustitucion.nuevoEjercicioId }
      : ejTemplate;
  });
}

export function compareWorkoutWithTemplate(
  ejercicios: EjercicioReal[],
  rutina: Rutina,
  sustituciones?: SustitucionesLogger,
): EjercicioMejora[] {
  const resultado: EjercicioMejora[] = [];
  const ejerciciosPlantilla = plantillaConSustituciones(rutina, sustituciones);

  for (const ejReal of ejercicios) {
    const ejTemplate = ejerciciosPlantilla.find(
      (e) => e.ejercicioId === ejReal.ejercicioId,
    );
    if (!ejTemplate) continue;

    const completadas = ejReal.series.filter((s) => s.completado);
    if (completadas.length === 0) continue;

    const templateCount = ejTemplate.series.length;
    const realCount = completadas.length;

    const mejoras: SerieMejora[] = [];

    // Comparar series que existen en ambos lados
    const minLen = Math.min(templateCount, realCount);
    for (let i = 0; i < minLen; i++) {
      const tSerie = ejTemplate.series[i];
      const rSerie = completadas[i];

      const pesoUp =
        (rSerie.peso ?? 0) > (tSerie.pesoObjetivo ?? 0);
      const repsUp =
        (rSerie.reps ?? 0) > (tSerie.repsMax ?? 0);
      const durUp =
        (rSerie.duracionMinutos ?? 0) >
        (tSerie.duracionObjetivoMinutos ?? 0);
      const distUp =
        (rSerie.distanciaKm ?? 0) >
        (tSerie.distanciaObjetivoKm ?? 0);

      if (pesoUp || repsUp || durUp || distUp) {
        mejoras.push({
          serieIdx: i,
          pesoAnterior: tSerie.pesoObjetivo,
          pesoNuevo: rSerie.peso ?? 0,
          repsAnterior: tSerie.repsMax,
          repsNuevo: rSerie.reps ?? 0,
          duracionAnterior: tSerie.duracionObjetivoMinutos,
          duracionNuevo: rSerie.duracionMinutos ?? 0,
          distanciaAnterior: tSerie.distanciaObjetivoKm,
          distanciaNuevo: rSerie.distanciaKm ?? 0,
        });
      }
    }

    const seriesExtra = Math.max(0, realCount - templateCount);

    if (mejoras.length > 0 || seriesExtra > 0) {
      resultado.push({
        ejercicioId: ejReal.ejercicioId,
        nombre: "", // el caller lo rellena
        mejoras,
        seriesExtra,
      });
    }
  }

  return resultado;
}

// ── Actualización de plantilla ───────────────────────────────────────

/**
 * Actualiza la plantilla de la rutina con las nuevas marcas del
 * entrenamiento. Para cada serie existente toma el máximo entre el
 * valor objetivo actual y el valor real conseguido. Si hay series
 * extra completadas, las añade como nuevas series objetivo al final.
 */
export async function actualizarTemplateConMejoras(
  rutinaId: string,
  ejercicios: EjercicioReal[],
  rutina: Rutina,
  sustituciones?: SustitucionesLogger,
  instancias?: string[],
): Promise<void> {
  const ejerciciosPlantilla = plantillaConSustituciones(rutina, sustituciones);
  const ejerciciosActualizados = ejerciciosPlantilla.map((ejTemplate) => {
    const sustitucion = Object.entries(sustituciones ?? {}).find(
      ([, item]) => item.rutinaEjercicioId === ejTemplate.id,
    );
    const idxSesion = sustitucion
      ? (instancias?.indexOf(sustitucion[0]) ?? -1)
      : -1;
    const ejReal =
      idxSesion >= 0
        ? ejercicios[idxSesion]
        : ejercicios.find((e) => e.ejercicioId === ejTemplate.ejercicioId);
    if (!ejReal) return ejTemplate;

    const completadas = ejReal.series.filter((s) => s.completado);
    if (completadas.length === 0) return ejTemplate;

    // Actualizar series existentes con los máximos conseguidos
    const seriesActualizadas: Serie[] = ejTemplate.series.map((s, i) => {
      const rSerie = completadas[i];
      if (!rSerie) return s;

      return {
        ...s,
        pesoObjetivo:
          Math.max(s.pesoObjetivo ?? 0, rSerie.peso ?? 0) || undefined,
        repsMin:
          Math.max(s.repsMin ?? 0, rSerie.reps ?? 0) || undefined,
        repsMax:
          Math.max(s.repsMax ?? 0, rSerie.reps ?? 0) || undefined,
        duracionObjetivoMinutos:
          Math.max(
            s.duracionObjetivoMinutos ?? 0,
            rSerie.duracionMinutos ?? 0,
          ) || undefined,
        distanciaObjetivoKm:
          Math.max(
            s.distanciaObjetivoKm ?? 0,
            rSerie.distanciaKm ?? 0,
          ) || undefined,
      };
    });

    // Añadir series extra como nuevas series objetivo
    const extras: Serie[] = completadas
      .slice(ejTemplate.series.length)
      .map((rs) => ({
        repsMin: rs.reps,
        repsMax: rs.reps,
        pesoObjetivo: rs.peso,
        duracionObjetivoMinutos: rs.duracionMinutos,
        distanciaObjetivoKm: rs.distanciaKm,
      }));

    return {
      ...ejTemplate,
      series: [...seriesActualizadas, ...extras],
    };
  });

  await db.rutinas.update(rutinaId, {
    ejercicios: ejerciciosActualizados,
  });
}
