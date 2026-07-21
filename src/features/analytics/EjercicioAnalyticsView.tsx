import { useState, useMemo } from "react";
import { Box, Button, Card, CardContent, IconButton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import { useLiveQuery } from "dexie-react-hooks";
import { useTheme } from "@mui/material/styles";
import { db } from "../../core/db";
import { PageHeader } from "../../components/PageHeader";
import { SectionLabel } from "../../components/SectionLabel";
import { ChartCard } from "../../components/ChartCard";
import { EmptyStateCard } from "../../components/EmptyStateCard";
import { calcularPuntosAnalytics, getTipoEjercicio } from "./data";

type Props = {
  ejercicioId: string;
  onBack: () => void;
};

type Metrica =
  | "volumen"
  | "oneRm"
  | "volumenMedioPorSerie"
  | "duracionTotal"
  | "distanciaTotal"
  | "ritmoMedio";

const METRICAS_FUERZA: { value: Metrica; label: string }[] = [
  { value: "volumen", label: "VOLUMEN TOTAL" },
  { value: "oneRm", label: "1RM ESTIMADO" },
  { value: "volumenMedioPorSerie", label: "VOL. MEDIO/SERIE" },
];

const METRICAS_CARDIO: { value: Metrica; label: string }[] = [
  { value: "duracionTotal", label: "MINUTOS TOTALES" },
  { value: "distanciaTotal", label: "DISTANCIA ACUM. KM" },
  { value: "ritmoMedio", label: "RITMO MEDIO" },
];

const METRICAS_TIEMPO: { value: Metrica; label: string }[] = [
  { value: "duracionTotal", label: "MINUTOS TOTALES" },
];

function getDefaultMetrica(
  tipo: string | undefined
): Metrica {
  if (tipo === "cardio") return "duracionTotal";
  if (tipo === "tiempo") return "duracionTotal";
  return "volumen";
}

function getMetricasDisponibles(
  tipo: string | undefined
): { value: Metrica; label: string }[] {
  if (tipo === "cardio") return METRICAS_CARDIO;
  if (tipo === "tiempo") return METRICAS_TIEMPO;
  return METRICAS_FUERZA;
}

function getMetricaLabel(metrica: Metrica): string {
  switch (metrica) {
    case "volumen":
      return "Volumen";
    case "oneRm":
      return "1RM (kg)";
    case "volumenMedioPorSerie":
      return "Vol. Medio (kg)";
    case "duracionTotal":
      return "Minutos";
    case "distanciaTotal":
      return "Km";
    case "ritmoMedio":
      return "Ritmo (min/km)";
  }
}

/** Extrae el valor numérico de un PuntoAnalytics según la métrica. */
function getPuntoValor(
  p: { volumen: number; oneRm: number; duracionTotal?: number; distanciaTotal?: number; ritmoMedio?: number; volumenMedioPorSerie?: number },
  metrica: Metrica
): number {
  switch (metrica) {
    case "volumen": return p.volumen;
    case "oneRm": return p.oneRm;
    case "volumenMedioPorSerie": return p.volumenMedioPorSerie ?? 0;
    case "duracionTotal": return p.duracionTotal ?? 0;
    case "distanciaTotal": return p.distanciaTotal ?? 0;
    case "ritmoMedio": return p.ritmoMedio ?? 0;
  }
}

function formatMetricaValor(
  valor: number,
  metrica: Metrica
): string {
  switch (metrica) {
    case "volumen":
    case "oneRm":
    case "volumenMedioPorSerie":
      return `${valor.toLocaleString("es-ES", { maximumFractionDigits: 1 })} kg`;
    case "duracionTotal":
      return `${valor.toLocaleString("es-ES", { maximumFractionDigits: 1 })} min`;
    case "distanciaTotal":
      return `${valor.toLocaleString("es-ES", { maximumFractionDigits: 2 })} km`;
    case "ritmoMedio":
      return `${valor.toLocaleString("es-ES", { maximumFractionDigits: 2 })} min/km`;
  }
}

export function EjercicioAnalyticsView({ ejercicioId, onBack }: Props) {
  const theme = useTheme();

  const ejercicio = useLiveQuery(
    () => db.ejercicios.get(ejercicioId),
    [ejercicioId]
  );

  const tipo = useLiveQuery(() => getTipoEjercicio(ejercicioId), [ejercicioId]);

  const puntos = useLiveQuery(async () => {
    const logs = await db.logsEntrenamientos.toArray();
    return calcularPuntosAnalytics(logs, ejercicioId, tipo);
  }, [ejercicioId, tipo]);

  const metricaInicial = getDefaultMetrica(tipo);
  const [metrica, setMetrica] = useState<Metrica>(metricaInicial);
  const metricasDisponibles = getMetricasDisponibles(tipo);

  // Reset metrica when tipo changes
  if (tipo && metrica !== metricaInicial && !metricasDisponibles.some((m) => m.value === metrica)) {
    setMetrica(metricaInicial);
  }

  const { xData, yData, yMin, yMax } = useMemo(() => {
    const data = puntos ?? [];
    const x = data.map((p) => p.fecha);
    const y = data.map((p) => getPuntoValor(p, metrica));
    let minY = 0;
    let maxY = 100;
    if (y.length > 0) {
      minY = Math.max(0, Math.floor(Math.min(...y) - Math.min(...y) * 0.1));
      maxY = Math.ceil(Math.max(...y) + Math.max(...y) * 0.1);
    }
    return { xData: x, yData: y, yMin: minY, yMax: maxY };
  }, [puntos, metrica]);

  // Último valor y delta (progresión)
  const { ultimoValor, delta } = useMemo(() => {
    const data = puntos ?? [];
    if (data.length === 0) return { ultimoValor: 0, delta: null as number | null };
    const ultimo = getPuntoValor(data[data.length - 1], metrica);
    if (data.length < 2) return { ultimoValor: ultimo, delta: null };
    const penultimo = getPuntoValor(data[data.length - 2], metrica);
    return { ultimoValor: ultimo, delta: ultimo - penultimo };
  }, [puntos, metrica]);

  // Para ritmoMedio, un delta negativo es favorable (más rápido)
  const deltaEsPositivo = metrica === "ritmoMedio" ? (delta ?? 0) < 0 : (delta ?? 0) >= 0;

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

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton
          onClick={onBack}
          sx={{
            color: "primary.main",
            borderRadius: 0,
            touchAction: "manipulation",
          }}
          aria-label="Volver"
        >
          <ArrowBackIcon />
        </IconButton>
        <PageHeader sx={{ flexGrow: 1 }}>
          {ejercicio?.nombre.toUpperCase() ?? "ANALYTICS"}
        </PageHeader>
      </Box>

      <Card>
        <CardContent>
          <SectionLabel sx={{ mb: 1 }}>MÉTRICA</SectionLabel>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {metricasDisponibles.map((m) => (
              <Button
                key={m.value}
                variant={metrica === m.value ? "contained" : "outlined"}
                color="primary"
                disableElevation
                onClick={() => setMetrica(m.value)}
              >
                {m.label}
              </Button>
            ))}
          </Box>
        </CardContent>
      </Card>

      {puntos && puntos.length > 0 && (
        <Card>
          <CardContent>
            <SectionLabel sx={{ mb: 1 }}>ÚLTIMA SESIÓN</SectionLabel>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 1,
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {
                    metricasDisponibles.find((m) => m.value === metrica)
                      ?.label
                  }
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: "bold" }}>
                  {formatMetricaValor(ultimoValor, metrica)}
                </Typography>
              </Box>
              {delta !== null && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    px: 1.5,
                    py: 0.5,
                    border: 1,
                    borderColor: deltaEsPositivo ? "success.main" : "error.main",
                    bgcolor:
                      deltaEsPositivo
                        ? "rgba(76, 175, 80, 0.08)"
                        : "rgba(244, 67, 54, 0.08)",
                  }}
                >
                  {deltaEsPositivo ? (
                    <TrendingUpIcon
                      fontSize="small"
                      color="success"
                    />
                  ) : (
                    <TrendingDownIcon
                      fontSize="small"
                      color="error"
                    />
                  )}
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", lineHeight: 1 }}
                    >
                      VS ANTERIOR
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: "bold",
                        color: deltaEsPositivo ? "success.main" : "error.main",
                      }}
                    >
                      {delta >= 0 ? "+" : ""}
                      {formatMetricaValor(delta, metrica)}
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {puntos && puntos.length < 1 ? (
        <EmptyStateCard height={250}>
          [ SIN DATOS // REGISTRA AL MENOS 1 SESIÓN ]
        </EmptyStateCard>
      ) : (
        <ChartCard
          title={
            metricasDisponibles.find((m) => m.value === metrica)?.label ??
            "MÉTRICA"
          }
          xData={xData}
          yData={yData}
          seriesLabel={getMetricaLabel(metrica)}
          color={theme.palette.primary.main}
          yMin={yMin}
          yMax={yMax}
          xValueFormatter={formatXAxis}
          chartType={tipo === "fuerza" || tipo === "calistenia" ? "bar" : "line"}
          emptyMessage="[ SIN DATOS ]"
        />
      )}
    </Box>
  );
}
