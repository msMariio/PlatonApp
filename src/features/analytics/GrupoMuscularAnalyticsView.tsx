import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import AccessibilityNewIcon from "@mui/icons-material/AccessibilityNew";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { db } from "../../core/db";
import { ChartCard } from "../../components/ChartCard";
import { EmptyStateCard } from "../../components/EmptyStateCard";
import { SectionLabel } from "../../components/SectionLabel";
import { PageHeader } from "../../components/PageHeader";
import { calcularAnaliticaGrupoMuscular, type GrupoMuscularAnalitica } from "./data";
import { useTheme } from "@mui/material/styles";

const NOMBRES: Record<GrupoMuscularAnalitica, string> = {
  pecho: "Pecho",
  espalda: "Espalda",
  cuadriceps: "Cuádriceps",
  isquios: "Isquios",
  hombro: "Hombro",
  biceps: "Bíceps",
  triceps: "Tríceps",
  core: "Core",
  gluteo: "Glúteo",
};

function formatSemana(fecha: Date): string {
  return fecha.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}

function formatNumero(valor: number): string {
  return valor.toLocaleString("es-ES", { maximumFractionDigits: 1 });
}

export function GrupoMuscularAnalyticsView() {
  const theme = useTheme();
  const logsQuery = useLiveQuery(() => db.logsEntrenamientos.toArray(), []);
  const ejerciciosQuery = useLiveQuery(() => db.ejercicios.toArray(), []);
  const logs = useMemo(() => logsQuery ?? [], [logsQuery]);
  const ejercicios = useMemo(() => ejerciciosQuery ?? [], [ejerciciosQuery]);
  const analitica = useMemo(
    () => calcularAnaliticaGrupoMuscular(logs, ejercicios),
    [logs, ejercicios],
  );
  const semanaActual = analitica.actual;
  const semanaAnterior = analitica.semanas[analitica.semanas.length - 2].grupos;
  const volumenSemanal = semanaActual.reduce((total, grupo) => total + grupo.volumen, 0);
  const seriesSemanales = semanaActual.reduce((total, grupo) => total + grupo.seriesEfectivas, 0);
  const frecuenciaSemanal = semanaActual.reduce((total, grupo) => total + grupo.frecuencia, 0);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader>ANALÍTICA MUSCULAR</PageHeader>
      <Typography variant="body2" color="text.secondary">
        VOLUMEN, SERIES EFECTIVAS Y FRECUENCIA DE LA SEMANA ACTUAL. LAS ALERTAS COMPARAN CON LA SEMANA ANTERIOR.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        {[{
          label: "VOLUMEN SEMANAL", value: `${formatNumero(volumenSemanal)} kg`,
        }, {
          label: "SERIES EFECTIVAS", value: String(seriesSemanales),
        }, {
          label: "FRECUENCIA MUSCULAR", value: String(frecuenciaSemanal),
        }].map((kpi) => (
          <Card key={kpi.label} sx={{ flex: 1 }}>
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">{kpi.label}</Typography>
              <Typography variant="h6" color="primary.main" sx={{ fontWeight: "bold" }}>{kpi.value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {(analitica.abandonados.length > 0 || analitica.sobrecargados.length > 0) && (
        <Card sx={{ borderLeft: 4, borderColor: "warning.main" }}>
          <CardContent>
            <Stack spacing={1}>
              {analitica.abandonados.length > 0 && (
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                  <WarningAmberIcon color="warning" fontSize="small" />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: "bold" }}>GRUPOS ABANDONADOS</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {analitica.abandonados.map((grupo) => NOMBRES[grupo]).join(" · ")}
                    </Typography>
                  </Box>
                </Box>
              )}
              {analitica.sobrecargados.length > 0 && (
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                  <TrendingUpIcon color="warning" fontSize="small" />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: "bold" }}>POSIBLE SOBRECARGA</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {analitica.sobrecargados.map((grupo) => NOMBRES[grupo]).join(" · ")} // +50% VS SEMANA ANTERIOR
                    </Typography>
                  </Box>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
            <AccessibilityNewIcon color="primary" fontSize="small" />
            <SectionLabel sx={{ mb: 0 }}>ESTADO POR GRUPO // SEMANA ACTUAL</SectionLabel>
          </Stack>
          <Stack spacing={1}>
            {semanaActual.map((grupo) => {
              const anterior = semanaAnterior.find((item) => item.grupo === grupo.grupo)!;
              const delta = grupo.volumen - anterior.volumen;
              return (
                <Box key={grupo.grupo} sx={{ border: 1, borderColor: "divider", p: 1.25 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: "bold" }}>{NOMBRES[grupo.grupo].toUpperCase()}</Typography>
                    <Chip label={`${grupo.frecuencia} ${grupo.frecuencia === 1 ? "DÍA" : "DÍAS"}`} size="small" variant="outlined" sx={{ borderRadius: 0 }} />
                  </Box>
                  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 0.5 }}>
                    <Typography variant="caption" color="primary.main">{formatNumero(grupo.volumen)} kg</Typography>
                    <Typography variant="caption" color="text.secondary">{grupo.seriesEfectivas} SERIES EFECTIVAS</Typography>
                    <Typography variant="caption" color={delta >= 0 ? "success.main" : "error.main"}>
                      {delta >= 0 ? "+" : ""}{formatNumero(delta)} kg VS ANTERIOR
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      <ChartCard
        title="EVOLUCIÓN DE VOLUMEN MUSCULAR"
        xData={analitica.semanas.map((semana) => semana.inicio)}
        yData={analitica.semanas.map((semana) => semana.grupos.reduce((total, grupo) => total + grupo.volumen, 0))}
        seriesLabel="Volumen semanal (kg)"
        color={theme.palette.primary.main}
        chartType="bar"
        xScaleType="band"
        xValueFormatter={(value) => value instanceof Date ? `SEM ${formatSemana(value)}` : String(value)}
        emptyMessage="[ SIN VOLUMEN // REGISTRA ENTRENAMIENTOS ]"
      />

      {analitica.ejerciciosSinClasificar > 0 && (
        <EmptyStateCard height={80}>
          [ {analitica.ejerciciosSinClasificar} EJERCICIOS REGISTRADOS SIN GRUPO // RECLASIFÍCALOS DESDE EL CATÁLOGO ]
        </EmptyStateCard>
      )}
    </Box>
  );
}
