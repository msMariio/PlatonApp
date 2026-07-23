import { useMemo } from "react";
import { Box, Typography, Stack, Chip } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import { useTheme } from "@mui/material/styles";
import { SectionLabel } from "../../../components/SectionLabel";
import { EmptyStateCard } from "../../../components/EmptyStateCard";
import {
  TimeframeSelector,
  type Timeframe,
} from "../../../components/TimeframeSelector";
import type { PesoDiario } from "../../../core/db";

interface PuntoDiario {
  date: Date;
  valor: number;
}

interface ChartPesoCorporalProps {
  pesos: PesoDiario[];
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}

const STEEL_COLOR = "rgba(158, 158, 158, 0.35)";

/**
 * Agrupa los pesajes por fecha (YYYY-MM-DD) y calcula el promedio diario.
 */
function agruparPromedioDiario(pesos: PesoDiario[]): PuntoDiario[] {
  const mapa = new Map<string, number[]>();
  for (const p of pesos) {
    const existente = mapa.get(p.fecha) ?? [];
    existente.push(p.valor);
    mapa.set(p.fecha, existente);
  }
  const resultado: PuntoDiario[] = [];
  for (const [fecha, valores] of mapa) {
    const avg = valores.reduce((a, b) => a + b, 0) / valores.length;
    resultado.push({ date: new Date(`${fecha}T00:00:00`), valor: avg });
  }
  resultado.sort((a, b) => a.date.getTime() - b.date.getTime());
  return resultado;
}

/**
 * Calcula la media móvil simple de N días sobre los promedios diarios.
 * Los primeros N-1 días devuelven null (sin historial suficiente).
 */
function calcularMA(diarios: PuntoDiario[], ventana: number): (number | null)[] {
  const ma: (number | null)[] = [];
  for (let i = 0; i < diarios.length; i++) {
    if (i < ventana - 1) {
      ma.push(null);
      continue;
    }
    const slice = diarios.slice(i - (ventana - 1), i + 1);
    const avg = slice.reduce((acc, p) => acc + p.valor, 0) / slice.length;
    ma.push(avg);
  }
  return ma;
}

/**
 * Regresión lineal simple (OLS).
 * Devuelve { slope, intercept } o null si no hay suficientes datos.
 */
function linearRegression(
  points: { x: number; y: number }[]
): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

const MA_WINDOW = 7;

/** Filtra los puntos diarios al rango del timeframe. */
function filtrarPorTimeframe(diarios: PuntoDiario[], tf: Timeframe): PuntoDiario[] {
  if (tf === "TODO") return diarios;
  const dias = tf === "7D" ? 7 : tf === "30D" ? 30 : 365;
  const limite = new Date();
  limite.setDate(limite.getDate() - dias);
  limite.setHours(0, 0, 0, 0);
  return diarios.filter((p) => p.date >= limite);
}

/**
 * Calcula la velocidad semanal (kg/semana) mediante regresión lineal
 * sobre los últimos 14 días de tendencia.
 */
function calcularVelocidadSemanal(
  diarios: PuntoDiario[],
  trend: (number | null)[]
): number | null {
  // Recoger los últimos 14 puntos con tendencia válida
  const ultimos: { diasDesdePrimero: number; y: number }[] = [];
  for (let i = diarios.length - 1; i >= 0 && ultimos.length < 14; i--) {
    if (trend[i] !== null) {
      const diasDesdePrimero =
        (diarios[i].date.getTime() - diarios[0].date.getTime()) /
        (24 * 60 * 60 * 1000);
      ultimos.unshift({ diasDesdePrimero, y: trend[i]! });
    }
  }
  if (ultimos.length < 2) return null;

  // Regresión con días reales como x para obtener slope en kg/día
  const puntosLR = ultimos.map((p) => ({ x: p.diasDesdePrimero, y: p.y }));
  const reg = linearRegression(puntosLR);
  if (!reg) return null;

  // slope en kg/día → kg/semana (*7)
  return reg.slope * 7;
}

const formatXAxis = (
  d: Date | string | number,
  context?: {
    location?: "tick" | "tooltip" | "legend" | "zoom-slider-tooltip";
  }
) => {
  if (!(d instanceof Date)) return String(d);
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  if (context?.location === "tick") return `${dd}/${mm}`;
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

export function ChartPesoCorporal({
  pesos,
  timeframe,
  onTimeframeChange,
}: ChartPesoCorporalProps) {
  const theme = useTheme();
  const maWindow = MA_WINDOW;

  // ─── Procesamiento de datos ───────────────────────────────
  // La MA se calcula con TODOS los datos históricos, luego se filtra
  // por timeframe solo para la visualización en el gráfico.
  const { diarios, trend, velocity, dates, rawValues, trendValues, trendLabel } =
    useMemo(() => {
      const all = agruparPromedioDiario(pesos);
      const t = calcularMA(all, maWindow);
      const v = calcularVelocidadSemanal(all, t);

      // Filtrar para mostrar solo el rango del timeframe
      const d = filtrarPorTimeframe(all, timeframe);

      // Encontrar el índice de inicio en el array completo que corresponde
      // al primer elemento del rango filtrado (d es un sufijo contiguo de all)
      const startIdx = d.length > 0
        ? all.findIndex((p) => p.date.getTime() === d[0].date.getTime())
        : all.length;
      const dates = all.slice(startIdx).map((p) => p.date);
      const rawValues = all.slice(startIdx).map((p) => p.valor);
      const trendValues = t.slice(startIdx);

      const trendLabel = `Tendencia (MA7)`;

      return { diarios: d, trend: t, velocity: v, dates, rawValues, trendValues, trendLabel };
    }, [pesos, timeframe]);

  const isEmpty = diarios.length < 2;

  // ─── Rangos Y ─────────────────────────────────────────────
  const { yMin, yMax } = useMemo(() => {
    if (diarios.length === 0) return { yMin: 0, yMax: 100 };
    const allVals = [
      ...diarios.map((p) => p.valor),
      ...(trend.filter((v) => v !== null) as number[]),
    ];
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    return {
      yMin: Math.max(0, Math.floor(minV - 5)),
      yMax: Math.ceil(maxV + 5),
    };
  }, [diarios, trend]);

  // ─── Tooltip value formatters ─────────────────────────────
  const rawFormatter = (v: number | null) =>
    v !== null ? `Pesaje Bruto: ${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} kg` : "";

  const trendFormatter = (v: number | null) =>
    v !== null ? `Tendencia Real: ${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} kg` : "";

  return (
    <>
      {/* ── Timeframe + Velocity KPI ────────────────────────── */}
      <Stack
        direction="row"
        sx={{
          mb: 1.5,
          gap: 1.5,
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <SectionLabel sx={{ mb: 0 }}>TENDENCIA</SectionLabel>

          {!isEmpty && velocity !== null && (
            <Chip
              icon={
                velocity < -0.05 ? (
                  <TrendingDownIcon
                    sx={{ fontSize: 16, color: "success.main !important" }}
                  />
                ) : velocity > 0.05 ? (
                  <TrendingUpIcon
                    sx={{ fontSize: 16, color: "error.main !important" }}
                  />
                ) : (
                  <TrendingFlatIcon
                    sx={{ fontSize: 16, color: "text.secondary !important" }}
                  />
                )
              }
              label={
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: "monospace",
                    fontWeight: 700,
                    letterSpacing: "0.03em",
                    color:
                      velocity < -0.05
                        ? "success.main"
                        : velocity > 0.05
                          ? "error.main"
                          : "text.secondary",
                  }}
                >
                  {velocity > 0 ? "+" : ""}
                  {velocity.toLocaleString("es-ES", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  kg/sem
                </Typography>
              }
              size="small"
              variant="outlined"
              sx={{
                borderRadius: 0,
                borderColor:
                  velocity < -0.05
                    ? "success.main"
                    : velocity > 0.05
                      ? "error.main"
                      : "divider",
              }}
            />
          )}
        </Stack>
        <TimeframeSelector value={timeframe} onChange={onTimeframeChange} />
      </Stack>

      {/* ── Chart ────────────────────────────────────────────── */}
      {isEmpty ? (
        <EmptyStateCard height={280}>
          [ INSUFICIENTES DATOS // INGRESA MÍNIMO 2 REGISTROS ]
        </EmptyStateCard>
      ) : (
        <Box sx={{ width: "100%", height: 280 }}>
          <LineChart
            xAxis={[
              {
                data: dates,
                scaleType: "time" as const,
                valueFormatter: formatXAxis,
                tickMinStep: 24 * 60 * 60 * 1000,
                tickMaxStep: 7 * 24 * 60 * 60 * 1000,
              },
            ]}
            yAxis={[{ min: yMin, max: yMax }]}
            series={[
              {
                data: rawValues,
                label: "Pesaje Bruto",
                color: STEEL_COLOR,
                showMark: true,
                valueFormatter: rawFormatter,
                curve: "linear",
              },
              {
                data: trendValues,
                label: trendLabel,
                color: theme.palette.warning.main,
                showMark: false,
                valueFormatter: trendFormatter,
                curve: "linear",
              },
            ]}
            grid={{ vertical: true, horizontal: true }}
            slotProps={{
              tooltip: { trigger: "axis" as const },
            }}
            sx={{
              // Estilo industrial: limpio, sin adornos
              "& .MuiLineElement-root": {
                strokeWidth: 2,
              },
              "& .MuiMarkElement-root": {
                strokeWidth: 0,
              },
            }}
          />
        </Box>
      )}
    </>
  );
}
