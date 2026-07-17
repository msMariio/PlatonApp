import { useState, useMemo } from "react";
import { Box, Button, Card, CardContent, IconButton } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useLiveQuery } from "dexie-react-hooks";
import { useTheme } from "@mui/material/styles";
import { db } from "../../core/db";
import { PageHeader } from "../../components/PageHeader";
import { SectionLabel } from "../../components/SectionLabel";
import { ChartCard } from "../../components/ChartCard";
import { EmptyStateCard } from "../../components/EmptyStateCard";
import { calcularPuntosAnalytics } from "./data";

type Props = {
  ejercicioId: string;
  onBack: () => void;
};

export function EjercicioAnalyticsView({ ejercicioId, onBack }: Props) {
  const theme = useTheme();

  const ejercicio = useLiveQuery(
    () => db.ejercicios.get(ejercicioId),
    [ejercicioId]
  );

  const puntos = useLiveQuery(async () => {
    const logs = await db.logsEntrenamientos.toArray();
    return calcularPuntosAnalytics(logs, ejercicioId);
  }, [ejercicioId]);

  const [metrica, setMetrica] = useState<"volumen" | "oneRm">("volumen");

  const { xData, yData, yMin, yMax } = useMemo(() => {
    const data = puntos ?? [];
    const x = data.map((p) => p.fecha);
    const y = data.map((p) => (metrica === "volumen" ? p.volumen : p.oneRm));
    let minY = 0;
    let maxY = 100;
    if (y.length > 0) {
      minY = Math.max(0, Math.floor(Math.min(...y) - Math.min(...y) * 0.1));
      maxY = Math.ceil(Math.max(...y) + Math.max(...y) * 0.1);
    }
    return { xData: x, yData: y, yMin: minY, yMax: maxY };
  }, [puntos, metrica]);

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
            <Button
              variant={metrica === "volumen" ? "contained" : "outlined"}
              color="primary"
              disableElevation
              onClick={() => setMetrica("volumen")}
            >
              VOLUMEN TOTAL
            </Button>
            <Button
              variant={metrica === "oneRm" ? "contained" : "outlined"}
              color="primary"
              disableElevation
              onClick={() => setMetrica("oneRm")}
            >
              1RM ESTIMADO
            </Button>
          </Box>
        </CardContent>
      </Card>

      {puntos && puntos.length < 2 ? (
        <EmptyStateCard height={250}>
          [ INSUFICIENTES DATOS // REGISTRA AL MENOS 2 SESIONES ]
        </EmptyStateCard>
      ) : (
        <ChartCard
          title={metrica === "volumen" ? "VOLUMEN TOTAL" : "1RM ESTIMADO"}
          xData={xData}
          yData={yData}
          seriesLabel={metrica === "volumen" ? "Volumen" : "1RM (kg)"}
          color={theme.palette.primary.main}
          yMin={yMin}
          yMax={yMax}
          xValueFormatter={formatXAxis}
          xScaleType="time"
          emptyMessage="[ INSUFICIENTES DATOS ]"
        />
      )}
    </Box>
  );
}
