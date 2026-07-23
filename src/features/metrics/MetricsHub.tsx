import { useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Stack,
  Button,
  IconButton,
  Typography,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Autocomplete,
  TextField,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import MonitorWeightIcon from "@mui/icons-material/MonitorWeight";
import { useTheme } from "@mui/material/styles";
import { useLiveQuery } from "dexie-react-hooks";
import InputNumber from "../../components/InputNumber";
import { AppTextField } from "../../components/AppTextField";
import { PageHeader } from "../../components/PageHeader";
import { SectionLabel } from "../../components/SectionLabel";
import { ChartCard } from "../../components/ChartCard";
import { EmptyStateCard } from "../../components/EmptyStateCard";
import type { Timeframe } from "../../components/TimeframeSelector";
import { usePesosOrdenados } from "../peso-tracker/usePesosOrdenados";
import { EditPesoDialog } from "../peso-tracker/components/EditPesoDialog";
import { ChartPesoCorporal } from "./components/ChartPesoCorporal";
import { db, type PesoDiario, type Ejercicio } from "../../core/db";
import {
  useE1RM,
  useEjerciciosConLogs,
  MAIN_LIFT_KEYWORDS,
} from "./useE1RM";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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
  const hh = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
};

const obtenerFechaHoy = () => new Date().toISOString().split("T")[0];
const obtenerHoraActual = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * Busca ejercicios que coincidan con los keywords principales.
 */
function findMainLifts(
  ejercicios: Ejercicio[]
): (Ejercicio & { keyword: string })[] {
  const result: (Ejercicio & { keyword: string })[] = [];
  for (const kw of MAIN_LIFT_KEYWORDS) {
    const found = ejercicios.find(
      (e) =>
        e.nombre.toLowerCase().includes(kw.toLowerCase()) &&
        !result.some((r) => r.id === e.id)
    );
    if (found) {
      result.push({ ...found, keyword: kw });
    }
  }
  return result;
}

/** Filtra ejercicios que no son main lifts para el dropdown. */
function getOtherExercises(
  ejercicios: Ejercicio[],
  mainLifts: (Ejercicio & { keyword: string })[]
): Ejercicio[] {
  const mainIds = new Set(mainLifts.map((e) => e.id));
  return ejercicios.filter((e) => !mainIds.has(e.id));
}

export function MetricsHub() {
  const theme = useTheme();

  // ─── PESO CORPORAL state ──────────────────────────────────
  const { pesos, filtrarPesos } = usePesosOrdenados();
  const [pesoInput, setPesoInput] = useState<number | null>(null);
  const [fechaInput, setFechaInput] = useState(obtenerFechaHoy());
  const [horaInput, setHoraInput] = useState(obtenerHoraActual());
  const [timeframePeso, setTimeframePeso] = useState<Timeframe>("30D");
  const [editando, setEditando] = useState<PesoDiario | null>(null);
  const [pesoExpanded, setPesoExpanded] = useState(true);

  const ultimoPeso = pesos.length > 0 ? pesos[pesos.length - 1] : null;
  const pesosFiltrados = filtrarPesos(pesos, timeframePeso);



  // ─── e1RM state ───────────────────────────────────────────
  const ejerciciosConLogs = useEjerciciosConLogs();
  const mainLifts = useMemo(
    () => findMainLifts(ejerciciosConLogs),
    [ejerciciosConLogs]
  );
  const otherExercises = useMemo(
    () => getOtherExercises(ejerciciosConLogs, mainLifts),
    [ejerciciosConLogs, mainLifts]
  );

  const [selectedEjercicioId, setSelectedEjercicioId] = useState<
    string | null
  >(null);

  // Auto-seleccionar primer main lift si no hay selección
  const activeEjercicioId =
    selectedEjercicioId ??
    (mainLifts.length > 0 ? mainLifts[0].id : null) ??
    (ejerciciosConLogs.length > 0 ? ejerciciosConLogs[0].id : null);

  const activeEjercicio = useLiveQuery(
    () =>
      activeEjercicioId ? db.ejercicios.get(activeEjercicioId) : null,
    [activeEjercicioId]
  );

  const { puntos, actual, delta30dias } = useE1RM(activeEjercicioId);

  const { e1rmYMin, e1rmYMax } = useMemo(() => {
    if (puntos.length === 0) return { e1rmYMin: 0, e1rmYMax: 100 };
    const minV = Math.min(...puntos.map((p) => p.e1rm));
    const maxV = Math.max(...puntos.map((p) => p.e1rm));
    return {
      e1rmYMin: Math.max(0, Math.floor(minV - minV * 0.1)),
      e1rmYMax: Math.ceil(maxV + maxV * 0.1),
    };
  }, [puntos]);

  // ─── Handlers Peso ────────────────────────────────────────
  const handleGuardarPeso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pesoInput === null || pesoInput <= 0 || !fechaInput || !horaInput) {
      return;
    }
    await db.pesos.add({
      fecha: fechaInput,
      hora: horaInput,
      valor: pesoInput,
    });
    setPesoInput(null);
    setFechaInput(obtenerFechaHoy());
    setHoraInput(obtenerHoraActual());
  };

  const handleEliminarPeso = async (id?: number) => {
    if (id === undefined) return;
    await db.pesos.delete(id);
  };

  const handleGuardarEdicion = async (
    changes: Pick<PesoDiario, "fecha" | "hora" | "valor">
  ) => {
    if (editando?.id === undefined) return;
    await db.pesos.update(editando.id, changes);
    setEditando(null);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <PageHeader>MÉTRICAS</PageHeader>

      {/* ═══════════════════════════════════════════════════════════
          SECCIÓN 1: RENDIMIENTO DE FUERZA
          ═══════════════════════════════════════════════════════════ */}
      <Card
        sx={{
          borderLeft: 4,
          borderColor: "primary.main",
        }}
      >
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <FitnessCenterIcon color="primary" fontSize="small" />
            <SectionLabel sx={{ mb: 0 }}>
              [ RENDIMIENTO DE FUERZA ]
            </SectionLabel>
          </Stack>

          {/* Exercise selector */}
          {mainLifts.length > 0 && (
            <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
              {mainLifts.map((ej) => (
                <Chip
                  key={ej.id}
                  label={ej.keyword.toUpperCase()}
                  onClick={() => setSelectedEjercicioId(ej.id)}
                  variant={
                    activeEjercicioId === ej.id ? "filled" : "outlined"
                  }
                  color="primary"
                  size="small"
                  sx={{
                    borderRadius: 0,
                    letterSpacing: "0.04em",
                    fontWeight:
                      activeEjercicioId === ej.id ? 700 : 400,
                  }}
                />
              ))}
            </Box>
          )}

          {otherExercises.length > 0 && (
            <Autocomplete
              size="small"
              options={otherExercises}
              getOptionLabel={(opt) => opt.nombre}
              value={
                activeEjercicio &&
                !mainLifts.some((m) => m.id === activeEjercicio.id)
                  ? activeEjercicio
                  : null
              }
              onChange={(_, newValue) => {
                if (newValue) setSelectedEjercicioId(newValue.id);
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="OTROS EJERCICIOS"
                  variant="outlined"
                  sx={{
                    "& .MuiOutlinedInput-root": { borderRadius: 0 },
                    "& .MuiInputLabel-root": {
                      letterSpacing: "0.05em",
                    },
                  }}
                />
              )}
              sx={{ mb: 2, maxWidth: 400 }}
            />
          )}

          {!activeEjercicioId ? (
            <EmptyStateCard height={120}>
              [ SIN EJERCICIOS REGISTRADOS // COMPLETA UN ENTRENAMIENTO ]
            </EmptyStateCard>
          ) : (
            <>
              {/* KPI Card */}
              <Card
                variant="outlined"
                sx={{
                  mb: 2,
                  borderRadius: 0,
                  bgcolor: "background.default",
                }}
              >
                <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    flexWrap="wrap"
                    gap={2}
                  >
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ letterSpacing: "0.05em" }}
                      >
                        e1RM ACTUAL — {activeEjercicio?.nombre.toUpperCase()}
                      </Typography>
                      <Typography
                        variant="h4"
                        sx={{
                          fontWeight: 700,
                          fontFamily: "monospace",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {actual !== null
                          ? `${actual.toLocaleString("es-ES", { maximumFractionDigits: 1 })} KG`
                          : "—"}
                      </Typography>
                    </Box>

                    {delta30dias !== null && delta30dias !== 0 && (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          px: 2,
                          py: 1,
                          border: 1,
                          borderColor:
                            delta30dias > 0 ? "success.main" : "error.main",
                          bgcolor:
                            delta30dias > 0
                              ? "rgba(76, 175, 80, 0.08)"
                              : "rgba(244, 67, 54, 0.08)",
                        }}
                      >
                        {delta30dias > 0 ? (
                          <TrendingUpIcon fontSize="small" color="success" />
                        ) : (
                          <TrendingDownIcon fontSize="small" color="error" />
                        )}
                        <Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", lineHeight: 1 }}
                          >
                            30 DÍAS
                          </Typography>
                          <Typography
                            variant="body1"
                            sx={{
                              fontWeight: "bold",
                              fontFamily: "monospace",
                              color:
                                delta30dias > 0
                                  ? "success.main"
                                  : "error.main",
                            }}
                          >
                            {delta30dias > 0 ? "+" : ""}
                            {delta30dias.toLocaleString("es-ES", {
                              maximumFractionDigits: 2,
                            })}{" "}
                            KG
                          </Typography>
                        </Box>
                      </Box>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              {/* e1RM Chart */}
              {puntos.length < 1 ? (
                <EmptyStateCard height={250}>
                  [ SIN DATOS DE e1RM // COMPLETA SERIES DE {activeEjercicio?.nombre.toUpperCase()} ]
                </EmptyStateCard>
              ) : (
                <ChartCard
                  title="PROGRESIÓN e1RM"
                  xData={puntos.map((p) => p.fecha)}
                  yData={puntos.map((p) => p.e1rm)}
                  seriesLabel="e1RM (KG)"
                  color={theme.palette.primary.main}
                  yMin={e1rmYMin}
                  yMax={e1rmYMax}
                  xValueFormatter={formatXAxis}
                  xTickMinStep={DAY_IN_MS}
                  xTickMaxStep={DAY_IN_MS}
                  chartType="line"
                  emptyMessage="[ SIN DATOS ]"
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════
          SECCIÓN 2: PESO CORPORAL
          ═══════════════════════════════════════════════════════════ */}
      <Card
        sx={{
          borderLeft: 4,
          borderColor: "warning.main",
        }}
      >
        <CardContent>
          <Accordion
            expanded={pesoExpanded}
            onChange={(_, expanded) => setPesoExpanded(expanded)}
            disableGutters
            elevation={0}
            sx={{
              bgcolor: "transparent",
              "&:before": { display: "none" },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                p: 0,
                minHeight: "auto",
                "& .MuiAccordionSummary-content": {
                  my: 0,
                },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <MonitorWeightIcon color="warning" fontSize="small" />
                <SectionLabel sx={{ mb: 0 }}>
                  [ PESO CORPORAL ]
                </SectionLabel>
                {ultimoPeso && (
                  <Chip
                    label={`${ultimoPeso.valor.toLocaleString("es-ES", { maximumFractionDigits: 3 })} KG`}
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{ borderRadius: 0, ml: 1 }}
                  />
                )}
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0, pt: 2 }}>
              {/* Quick input */}
              <Card variant="outlined" sx={{ mb: 2, borderRadius: 0 }}>
                <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                  <Box component="form" onSubmit={handleGuardarPeso}>
                    <Stack spacing={1.5}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.5}
                      >
                        <AppTextField
                          type="date"
                          label="FECHA"
                          size="small"
                          fullWidth
                          value={fechaInput}
                          onChange={(e) => setFechaInput(e.target.value)}
                        />
                        <AppTextField
                          type="time"
                          label="HORA"
                          size="small"
                          fullWidth
                          value={horaInput}
                          onChange={(e) => setHoraInput(e.target.value)}
                        />
                      </Stack>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.5}
                      >
                        <InputNumber
                          label="PESO (KG)"
                          size="small"
                          min={0}
                          step={0.01}
                          value={pesoInput}
                          onValueChange={(v) => setPesoInput(v)}
                          placeholder={
                            ultimoPeso
                              ? Number(
                                  ultimoPeso.valor.toFixed(3)
                                ).toString()
                              : undefined
                          }
                        />
                        <Button
                          type="submit"
                          variant="contained"
                          color="primary"
                          disableElevation
                          fullWidth
                          disabled={!pesoInput || !fechaInput || !horaInput}
                        >
                          REGISTRAR
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                </CardContent>
              </Card>

              {/* Weight Chart — recibe TODOS los pesos; la MA se calcula con el historial completo */}
              <ChartPesoCorporal
                pesos={pesos}
                timeframe={timeframePeso}
                onTimeframeChange={setTimeframePeso}
              />

              {/* Logs */}
              <Card
                variant="outlined"
                sx={{ mt: 2, borderRadius: 0 }}
              >
                <CardContent
                  sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                >
                  <SectionLabel sx={{ mb: 1 }}>REGISTROS</SectionLabel>
                  {pesosFiltrados.length === 0 ? (
                    <EmptyStateCard height={80}>
                      [ NO HAY REGISTROS EN ESTE PERIODO ]
                    </EmptyStateCard>
                  ) : (
                    [...pesosFiltrados].reverse().map((p) => (
                      <Stack
                        key={p.id}
                        direction="row"
                        spacing={2}
                        sx={{
                          py: 1,
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderBottom: 1,
                          borderColor: "divider",
                          "&:last-of-type": { borderBottom: "none" },
                        }}
                      >
                        <Stack direction="row" spacing={2}>
                          <Typography variant="body2">
                            {p.fecha}{" "}
                            <Box
                              component="span"
                              sx={{ color: "text.secondary" }}
                            >
                              [{p.hora}]
                            </Box>
                          </Typography>
                          <Typography
                            variant="body2"
                            color="warning.main"
                            sx={{ fontWeight: "bold" }}
                          >
                            {p.valor.toLocaleString("es-ES", {
                              maximumFractionDigits: 3,
                            })}{" "}
                            KG
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={1}>
                          <IconButton
                            size="small"
                            onClick={() => setEditando(p)}
                            aria-label="Editar registro"
                            sx={{
                              color: "text.secondary",
                              "&:hover": { color: "primary.main" },
                              borderRadius: 0,
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleEliminarPeso(p.id)}
                            aria-label="Eliminar registro"
                            sx={{
                              color: "text.secondary",
                              "&:hover": { color: "error.main" },
                              borderRadius: 0,
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Stack>
                    ))
                  )}
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      {editando !== null && (
        <EditPesoDialog
          key={editando.id ?? "__closed__"}
          peso={editando}
          onClose={() => setEditando(null)}
          onSave={handleGuardarEdicion}
        />
      )}
    </Box>
  );
}
