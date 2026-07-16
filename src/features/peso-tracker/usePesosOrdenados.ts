import { useLiveQuery } from "dexie-react-hooks";
import { db, type PesoDiario } from "../../core/db";
import type { Timeframe } from "../../components/TimeframeSelector";

/**
 * Hook específico del feature peso-tracker.
 * Devuelve los pesos ordenados cronológicamente (fecha + hora)
 * y un helper para filtrarlos por timeframe.
 */
export function usePesosOrdenados() {
  const pesos =
    useLiveQuery(async () => {
      const data = await db.pesos.toArray();
      return data.sort((a, b) => {
        const fechaComp = a.fecha.localeCompare(b.fecha);
        if (fechaComp !== 0) return fechaComp;
        return a.hora.localeCompare(b.hora);
      });
    }) || [];

  const filtrarPesos = (all: PesoDiario[], tf: Timeframe): PesoDiario[] => {
    if (all.length === 0) return [];
    if (tf === "TODO") return all;

    const dias = tf === "7D" ? 7 : tf === "30D" ? 30 : 365;
    const limite = new Date();
    limite.setDate(limite.getDate() - dias);
    return all.filter((p) => new Date(p.fecha) >= limite);
  };

  return { pesos, filtrarPesos };
}
