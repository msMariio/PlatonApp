import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import AccessibilityNewIcon from "@mui/icons-material/AccessibilityNew";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { db } from "../../core/db";
import { ChartCard } from "../../components/ChartCard";
import { EmptyStateCard } from "../../components/EmptyStateCard";
import { SectionLabel } from "../../components/SectionLabel";
import { PageHeader } from "../../components/PageHeader";
import {
  calcularAdherenciaPlanificacion,
  calcularAnaliticaGrupoMuscular,
  calcularFrecuenciaPromedioMuscular,
  clasificarSeriesMusculares,
  sincronizarSnapshotAdherenciaActual,
  type EstadoSeriesMusculares,
  type GrupoMuscularAnalitica,
} from "./data";
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

const COLOR_ESTADO: Record<EstadoSeriesMusculares, "default" | "error" | "warning" | "success" | "secondary"> = {
  INACTIVO: "default",
  BAJO: "error",
  MEDIO: "warning",
  OPTIMO: "success",
  ALTO: "secondary",
};

export function GrupoMuscularAnalyticsView() {
  const theme = useTheme();
  const [metricaGrafico, setMetricaGrafico] = useState<"series" | "volumen">("series");
  const logsQuery = useLiveQuery(() => db.logsEntrenamientos.toArray(), []);
  const ejerciciosQuery = useLiveQuery(() => db.ejercicios.toArray(), []);
  const planificacionQuery = useLiveQuery(() => db.planificacionSemanal.get("default"), []);
  const rutinasQuery = useLiveQuery(() => db.rutinas.toArray(), []);
  const logs = useMemo(() => logsQuery ?? [], [logsQuery]);
  const ejercicios = useMemo(() => ejerciciosQuery ?? [], [ejerciciosQuery]);
  const rutinas = useMemo(() => rutinasQuery ?? [], [rutinasQuery]);
  const analitica = useMemo(
    () => calcularAnaliticaGrupoMuscular(logs, ejercicios),
    [logs, ejercicios],
  );
  const adherencia = useMemo(
    () => calcularAdherenciaPlanificacion(planificacionQuery, logs, rutinas),
    [planificacionQuery, logs, rutinas],
  );
  useEffect(() => {
    void sincronizarSnapshotAdherenciaActual(planificacionQuery, logs, rutinas);
  }, [planificacionQuery, logs, rutinas]);
  const semanaActual = analitica.actual;
  const semanaAnterior = analitica.semanas[analitica.semanas.length - 2].grupos;
  const volumenSemanal = semanaActual.reduce((total, grupo) => total + grupo.volumen, 0);
  const seriesSemanales = semanaActual.reduce((total, grupo) => total + grupo.seriesEfectivas, 0);
  const frecuenciaPromedio = calcularFrecuenciaPromedioMuscular(semanaActual);
  const datosGrafico = analitica.semanas.map((semana) =>
    semana.grupos.reduce(
      (total, grupo) => total + (metricaGrafico === "series" ? grupo.seriesEfectivas : grupo.volumen),
      0,
    ),
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader>ANALÍTICA MUSCULAR</PageHeader>
      <Typography variant="body2" color="text.secondary">
        VOLUMEN, SERIES EFECTIVAS Y FRECUENCIA DE LA SEMANA ACTUAL. LAS ALERTAS COMPARAN CON LA SEMANA ANTERIOR.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Card sx={{ flex: 1, borderLeft: 4, borderColor: "primary.main" }}>
          <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Typography variant="caption" color="text.secondary">SERIES EFECTIVAS TOTALES</Typography>
            <Typography variant="h4" color="primary.main" sx={{ fontWeight: "bold", fontFamily: "monospace" }}>
              {seriesSemanales}
            </Typography>
            <Typography variant="caption" color="text.secondary">SEMANA ACTUAL</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Typography variant="caption" color="text.secondary">FRECUENCIA PROMEDIO</Typography>
            <Typography variant="h6" color="primary.main" sx={{ fontWeight: "bold" }}>{frecuenciaPromedio.toFixed(1)}x</Typography>
            <Typography variant="caption" color="text.secondary">DÍAS / SEMANA POR MÚSCULO</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, opacity: 0.72 }}>
          <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Typography variant="caption" color="text.secondary">TONELAJE ACUMULADO</Typography>
            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: "bold" }}>{formatNumero(volumenSemanal)} KG</Typography>
            <Typography variant="caption" color="text.secondary">MÉTRICA SECUNDARIA</Typography>
          </CardContent>
        </Card>
      </Stack>

      <Card sx={{ borderLeft: 4, borderColor: "info.main" }}>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", mb: 2 }}>
            <SectionLabel sx={{ mb: 0 }}>ADHERENCIA A LA PLANIFICACIÓN // SEMANA ACTUAL</SectionLabel>
            <Chip label={`${adherencia.entrenamientosCompletados}/${adherencia.entrenamientosPlanificados} COMPLETADOS`} size="small" color="info" variant="outlined" sx={{ borderRadius: 0, alignSelf: { xs: "flex-start", sm: "auto" } }} />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
            {[
              { label: "CUMPLIMIENTO", value: `${adherencia.porcentajeCumplimiento.toFixed(0)}%` },
              { label: "PLANIFICADOS", value: String(adherencia.entrenamientosPlanificados) },
              { label: "COMPLETADOS", value: String(adherencia.entrenamientosCompletados) },
              { label: "RACHA", value: `${adherencia.diasConsecutivos} ${adherencia.diasConsecutivos === 1 ? "DÍA" : "DÍAS"}` },
              { label: "OMITIDOS", value: String(adherencia.sesionesOmitidas) },
            ].map((indicador) => (
              <Box key={indicador.label} sx={{ flex: 1, border: 1, borderColor: "divider", p: 1 }}>
                <Typography variant="caption" color="text.secondary">{indicador.label}</Typography>
                <Typography variant="h6" color={indicador.label === "CUMPLIMIENTO" ? "info.main" : "text.primary"} sx={{ fontWeight: "bold", fontFamily: "monospace" }}>
                  {indicador.value}
                </Typography>
              </Box>
            ))}
          </Stack>
          {adherencia.rutinas.length > 0 ? (
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">CUMPLIMIENTO POR RUTINA</Typography>
              {adherencia.rutinas.map((rutina) => (
                <Box key={rutina.rutinaId} sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "center", borderTop: 1, borderColor: "divider", pt: 0.75 }}>
                  <Typography variant="body2" sx={{ fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis" }}>{rutina.nombre.toUpperCase()}</Typography>
                  <Typography variant="caption" color={rutina.porcentaje === 100 ? "success.main" : "text.secondary"} sx={{ whiteSpace: "nowrap" }}>
                    {rutina.completados}/{rutina.planificados} · {rutina.porcentaje.toFixed(0)}%
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography variant="caption" color="text.secondary">[ SIN SESIONES PLANIFICADAS ESTA SEMANA ]</Typography>
          )}
        </CardContent>
      </Card>

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
              const deltaSeries = grupo.seriesEfectivas - anterior.seriesEfectivas;
              const clasificacion = clasificarSeriesMusculares(grupo.seriesEfectivas);
              const colorEstado = COLOR_ESTADO[clasificacion.estado];
              const colorBarra = colorEstado === "default"
                ? theme.palette.action.disabled
                : theme.palette[colorEstado].main;
              return (
                <Box key={grupo.grupo} sx={{ border: 1, borderColor: "divider", p: 1.25 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: "bold" }}>{NOMBRES[grupo.grupo].toUpperCase()}</Typography>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Chip
                        label={clasificacion.badge}
                        size="small"
                        color={colorEstado}
                        variant="outlined"
                        sx={{ borderRadius: 0, fontFamily: "monospace", fontWeight: "bold" }}
                      />
                      <Chip label={`${grupo.frecuencia} ${grupo.frecuencia === 1 ? "DÍA" : "DÍAS"}`} size="small" variant="outlined" sx={{ borderRadius: 0 }} />
                    </Stack>
                  </Box>
                  <Box sx={{ mt: 1, height: 10, border: 1, borderColor: clasificacion.estado === "INACTIVO" ? "action.disabled" : colorBarra, p: "1px" }} aria-label={`${grupo.seriesEfectivas} series efectivas de 20`}>
                    <Box sx={{ height: "100%", width: `${Math.min((grupo.seriesEfectivas / 20) * 100, 100)}%`, bgcolor: colorBarra, transition: "width 0.2s ease" }} />
                  </Box>
                  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 0.5, alignItems: "baseline" }}>
                    <Typography variant="body2" color={clasificacion.estado === "INACTIVO" ? "text.secondary" : colorEstado} sx={{ fontWeight: "bold", fontFamily: "monospace", fontSize: "0.82rem", letterSpacing: "0.02em" }}>
                      {grupo.seriesEfectivas} SERIES EFECTIVAS
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.58 }}>{formatNumero(grupo.volumen)} KG</Typography>
                    <Typography variant="caption" color={deltaSeries >= 0 ? "success.main" : "error.main"}>
                      {deltaSeries >= 0 ? "+" : ""}{deltaSeries} {Math.abs(deltaSeries) === 1 ? "SERIE" : "SERIES"} VS SEM. ANT.
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", mb: 2 }}>
            <SectionLabel sx={{ mb: 0 }}>EVOLUCIÓN SEMANAL</SectionLabel>
            <Stack direction="row" sx={{ width: { xs: "100%", sm: 320 }, border: 1, borderColor: "divider" }}>
              <Button size="small" onClick={() => setMetricaGrafico("series")} variant={metricaGrafico === "series" ? "contained" : "text"} disableElevation sx={{ flex: "1 1 0", minWidth: 0, borderRadius: 0, px: 0.5, whiteSpace: "nowrap" }}>
                SERIES EFECTIVAS
              </Button>
              <Button size="small" onClick={() => setMetricaGrafico("volumen")} variant={metricaGrafico === "volumen" ? "contained" : "text"} disableElevation sx={{ flex: "1 1 0", minWidth: 0, borderRadius: 0, px: 0.5, whiteSpace: "nowrap" }}>
                TONELAJE (KG)
              </Button>
            </Stack>
          </Stack>
          <ChartCard
            title={metricaGrafico === "series" ? "SERIES EFECTIVAS TOTALES POR SEMANA" : "TONELAJE TOTAL POR SEMANA"}
            xData={analitica.semanas.map((semana) => semana.inicio)}
            yData={datosGrafico}
            seriesLabel={metricaGrafico === "series" ? "Series efectivas" : "Tonelaje semanal (kg)"}
            color={theme.palette.primary.main}
            chartType="bar"
            xScaleType="band"
            xValueFormatter={(value) => value instanceof Date ? `SEM ${formatSemana(value)}` : String(value)}
            emptyMessage="[ SIN DATOS // REGISTRA ENTRENAMIENTOS ]"
          />
        </CardContent>
      </Card>

      {analitica.ejerciciosSinClasificar > 0 && (
        <EmptyStateCard height={80}>
          [ {analitica.ejerciciosSinClasificar} EJERCICIOS REGISTRADOS SIN GRUPO // RECLASIFÍCALOS DESDE EL CATÁLOGO ]
        </EmptyStateCard>
      )}
    </Box>
  );
}
