import { useMemo } from "react";
import { useE1RM } from "./useE1RM";
import { usePesosOrdenados } from "../peso-tracker/usePesosOrdenados";
import type { PesoDiario } from "../../core/db";

export interface PuntoFuerzaRelativa {
  fecha: Date;
  /** e1RM / peso corporal */
  ratio: number;
  e1rm: number;
  peso: number;
}

export interface FuerzaRelativaData {
  puntos: PuntoFuerzaRelativa[];
  actual: number | null;
  delta30dias: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_MATCH_DAYS = 3;

/**
 * Encuentra el peso más cercano a una fecha dada.
 * - Si hay pesos en la misma fecha (YYYY-MM-DD), toma el último del día.
 * - Si no, busca el más cercano dentro de ±MAX_MATCH_DAYS días.
 */
function buscarPesoEnFecha(
  fecha: Date,
  pesos: PesoDiario[]
): number | null {
  if (pesos.length === 0) return null;

  const fechaStr = fecha.toISOString().split("T")[0];

  // Intento 1: coincidencia exacta de fecha
  const mismoDia = pesos.filter((p) => p.fecha === fechaStr);
  if (mismoDia.length > 0) {
    mismoDia.sort((a, b) => b.hora.localeCompare(a.hora));
    return mismoDia[0].valor;
  }

  // Intento 2: peso más cercano dentro de ±MAX_MATCH_DAYS
  const fechaTime = fecha.getTime();
  let mejor: PesoDiario | null = null;
  let mejorDiff = Infinity;

  for (const p of pesos) {
    const pTime = new Date(p.fecha).getTime();
    const diff = Math.abs(pTime - fechaTime);
    if (diff < mejorDiff) {
      mejorDiff = diff;
      mejor = p;
    }
  }

  if (mejor && mejorDiff <= MAX_MATCH_DAYS * MS_PER_DAY) {
    return mejor.valor;
  }

  return null;
}

/**
 * Hook que cruza los datos de e1RM con el peso corporal para obtener
 * el ratio de fuerza relativa (e1RM / peso corporal) a lo largo del tiempo.
 *
 * Fórmula: ratio = e1RM (kg) / peso corporal (kg)
 * Ej: press banca 100 kg con peso 70 kg → ratio = 1.43× BW
 */
export function useFuerzaRelativa(
  ejercicioId: string | null
): FuerzaRelativaData {
  const { puntos: e1rmPuntos } = useE1RM(ejercicioId);
  const { pesos } = usePesosOrdenados();

  return useMemo(() => {
    if (!ejercicioId || e1rmPuntos.length === 0 || pesos.length === 0) {
      return { puntos: [], actual: null, delta30dias: null };
    }

    // Cruzar cada punto e1RM con su peso corporal más cercano
    const puntos: PuntoFuerzaRelativa[] = [];
    for (const p of e1rmPuntos) {
      const peso = buscarPesoEnFecha(p.fecha, pesos);
      if (peso !== null && peso > 0) {
        puntos.push({
          fecha: p.fecha,
          ratio: p.e1rm / peso,
          e1rm: p.e1rm,
          peso,
        });
      }
    }

    if (puntos.length === 0) {
      return { puntos: [], actual: null, delta30dias: null };
    }

    // Ordenar cronológicamente (ya deberían estarlo, pero por si acaso)
    puntos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    const actual = puntos[puntos.length - 1].ratio;

    // Delta 30 días: comparar el último ratio con el máximo de hace ±7 días
    let delta30dias: number | null = null;
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    const puntosVentana = puntos.filter((p) => {
      const diff = p.fecha.getTime() - hace30Dias.getTime();
      return diff >= -7 * MS_PER_DAY && diff <= 7 * MS_PER_DAY;
    });

    if (puntosVentana.length > 0) {
      const refRatio = Math.max(
        ...puntosVentana.map((p) => p.ratio)
      );
      delta30dias = actual - refRatio;
    } else if (puntos.length >= 2) {
      delta30dias = actual - puntos[0].ratio;
    }

    return { puntos, actual, delta30dias };
  }, [ejercicioId, e1rmPuntos, pesos]);
}
