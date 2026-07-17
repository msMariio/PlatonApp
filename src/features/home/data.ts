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

export async function getPlanificacionDefault(): Promise<PlanificacionSemanal> {
  const plan = await db.planificacionSemanal.get("default");
  if (plan) return plan;
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

export async function setRutinaDelDia(
  dia: DiaSemana,
  rutinaId: string | null
): Promise<void> {
  const plan = await getPlanificacionDefault();
  plan.dias[dia] = { ...plan.dias[dia], rutinaId };
  await db.planificacionSemanal.put(plan);
}

export async function toggleDiaActivo(dia: DiaSemana): Promise<void> {
  const plan = await getPlanificacionDefault();
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
