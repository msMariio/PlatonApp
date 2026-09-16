import { db, type PlanificacionSemanal, type DiaSemana, type LogEntrenamiento } from "../../core/db";

export const DIAS_SEMANA: DiaSemana[] = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

export function getDiaSemanaDesdeFecha(date: Date): DiaSemana {
  // getDay(): 0 = domingo, 1 = lunes, ..., 6 = sabado
  const idx = date.getDay();
  // Mapear a lunes=0 ... domingo=6
  const mapped = idx === 0 ? 6 : idx - 1;
  return DIAS_SEMANA[mapped];
}

/**
 * Lectura pura: NO escribe. Es la versión segura para usar dentro de
 * `useLiveQuery` (Dexie desaconseja escribir dentro del observer porque
 * dispara la re-suscripción y, combinado con el doble-render de StrictMode,
 * puede lanzar excepciones no capturadas que dejan la PWA en blanco).
 */
export async function readPlanificacionDefault(): Promise<
  PlanificacionSemanal | undefined
> {
  return db.planificacionSemanal.get("default");
}

/**
 * Versión seed: si no existe el plan, lo crea. Usa una transacción rw
 * para ser race-safe. Sólo se debe llamar desde handlers de usuario
 * (`onClick`, etc.) o desde un `useEffect`, nunca dentro de un observer.
 *
 * Además normaliza planes antiguos: garantiza que existan los siete días
 * (incluidos sábado y domingo) y que cada uno tenga `activo` booleano. Un
 * día sin `activo` quedaba fuera de métricas como la adherencia aunque el
 * usuario tuviera una rutina planificada ese día.
 */
export async function ensurePlanificacionDefault(): Promise<PlanificacionSemanal> {
  return db.transaction("rw", db.planificacionSemanal, async () => {
    const existing = await db.planificacionSemanal.get("default");
    if (!existing) {
      const nueva: PlanificacionSemanal = {
        id: "default",
        nombre: "Planificación por defecto",
        dias: {
          lunes: { rutinaId: null, activo: true },
          martes: { rutinaId: null, activo: true },
          miercoles: { rutinaId: null, activo: true },
          jueves: { rutinaId: null, activo: true },
          viernes: { rutinaId: null, activo: true },
          sabado: { rutinaId: null, activo: true },
          domingo: { rutinaId: null, activo: true },
        },
      };
      await db.planificacionSemanal.add(nueva);
      return nueva;
    }

    const dias = { ...existing.dias };
    let normalizado = false;
    for (const dia of DIAS_SEMANA) {
      const config = dias[dia];
      if (!config) {
        dias[dia] = { rutinaId: null, activo: true };
        normalizado = true;
      } else if (typeof config.activo !== "boolean") {
        dias[dia] = { ...config, activo: true };
        normalizado = true;
      }
    }
    if (!normalizado) return existing;

    const plan: PlanificacionSemanal = { ...existing, dias };
    await db.planificacionSemanal.put(plan);
    return plan;
  });
}

export async function setRutinaDelDia(
  dia: DiaSemana,
  rutinaId: string | null
): Promise<void> {
  const plan = await ensurePlanificacionDefault();
  // Asignar una rutina implica que el día está activo; marcar descanso
  // conserva el estado previo del día.
  plan.dias[dia] = {
    ...plan.dias[dia],
    rutinaId,
    activo: rutinaId !== null ? true : plan.dias[dia]?.activo ?? true,
  };
  await db.planificacionSemanal.put(plan);
}

export async function toggleDiaActivo(dia: DiaSemana): Promise<void> {
  const plan = await ensurePlanificacionDefault();
  plan.dias[dia] = {
    ...plan.dias[dia],
    activo: !plan.dias[dia].activo,
  };
  await db.planificacionSemanal.put(plan);
}

export function getFechaHoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getLogsDeHoy(): Promise<LogEntrenamiento[]> {
  const hoy = getFechaHoyISO();
  const logs = await db.logsEntrenamientos
    .where("fecha")
    .startsWith(hoy)
    .toArray();
  return logs.sort(
    (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
  );
}
