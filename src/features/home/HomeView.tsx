import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  TextField,
  IconButton,
  Chip,
  Divider,
  Collapse,
} from "@mui/material";
import { useLiveQuery } from "dexie-react-hooks";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AddIcon from "@mui/icons-material/Add";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import { PageHeader } from "../../components/PageHeader";
import { EmptyStateCard } from "../../components/EmptyStateCard";
import { SectionLabel } from "../../components/SectionLabel";
import {
  db,
  type DiaSemana,
  type LogEntrenamiento,
  type Ejercicio,
  type TipoEjercicio,
} from "../../core/db";
import {
  readPlanificacionDefault,
  ensurePlanificacionDefault,
  getDiaSemanaDesdeFecha,
  setRutinaDelDia,
  getLogsDeHoy,
  DIAS_SEMANA,
} from "./data";
import { actualizarLogEntrenamiento, calcularVolumenTotal } from "../training-logger/data";

const TIPO_LABEL: Record<TipoEjercicio, string> = {
  fuerza: "FUERZA",
  cardio: "CARDIO",
  tiempo: "TIEMPO",
  calistenia: "CALIST",
};

const TIPO_COLOR: Record<TipoEjercicio, string> = {
  fuerza: "#f44336",
  cardio: "#4caf50",
  tiempo: "#2196f3",
  calistenia: "#ff9800",
};

type HomeViewProps = {
  onStartTraining: (rutinaId: string, logId?: number) => void;
};

export function HomeView({ onStartTraining }: HomeViewProps) {
  const [hoy] = useState(() => new Date());
  const diaSemana = getDiaSemanaDesdeFecha(hoy);

  const plan = useLiveQuery(() => readPlanificacionDefault(), []);
  // Seed del plan por defecto en un useEffect separado: nunca dentro del
  // observer de useLiveQuery, para no disparar la re-suscripción y causar
  // excepciones en el doble-render de StrictMode.
  useEffect(() => {
    ensurePlanificacionDefault().catch(() => {
      // Best-effort: si falla el seed aquí, los handlers de mutación
      // (setRutinaDelDia, toggleDiaActivo) lo intentarán de nuevo.
    });
  }, []);
  const todasLasRutinas = useLiveQuery(() => db.rutinas.toArray(), []) ?? [];
  // Excluir rutinas archivadas del selector de planificación y del diálogo libre
  const rutinas = todasLasRutinas.filter((r) => !r.isArchived);
  const ejerciciosCatalogo =
    useLiveQuery(() => db.ejercicios.toArray(), []) ?? [];
  const logsHoy = useLiveQuery(() => getLogsDeHoy(), []) ?? [];
  const logsRecientes =
    useLiveQuery(
      () =>
        db.logsEntrenamientos.orderBy("fecha").reverse().limit(10).toArray(),
      [],
    ) ?? [];

  const [freeOpen, setFreeOpen] = useState(false);
  // Per-log notes editing: tracks which logId is being edited and its draft text
  const [notasEditando, setNotasEditando] = useState<{
    logId: number;
    texto: string;
  } | null>(null);
  const [guardandoNotas, setGuardandoNotas] = useState(false);
  // Track expanded exercises: key = "sessionIndex-ejercicioIdx"
  // Empty set = all collapsed by default
  const [ejerciciosExpandidos, setEjerciciosExpandidos] = useState<Set<string>>(
    new Set(),
  );

  const catalogoLookup = new Map(
    ejerciciosCatalogo.map((e: Ejercicio) => [e.id, e]),
  );

  const rutinaHoy =
    plan?.dias[diaSemana]?.rutinaId &&
    plan.dias[diaSemana].activo &&
    plan.dias[diaSemana].rutinaId
      ? rutinas.find((r) => r.id === plan.dias[diaSemana].rutinaId)
      : null;

  const diaLabel = diaSemana.toUpperCase();

  const handlePlanChange = async (dia: DiaSemana, rutinaId: string | null) => {
    await setRutinaDelDia(dia, rutinaId);
  };

  const getTiposRutina = (rutinaId: string | null): TipoEjercicio[] => {
    if (!rutinaId) return [];
    const rutina = rutinas.find((r) => r.id === rutinaId);
    if (!rutina) return [];
    const tipos = new Set<TipoEjercicio>();
    for (const ej of rutina.ejercicios) {
      const t = catalogoLookup.get(ej.ejercicioId)?.tipo;
      if (t) tipos.add(t);
    }
    return [...tipos].sort();
  };

  const getNombreRutina = (rutinaId: string | null) => {
    if (!rutinaId) return "DÍA DE DESCANSO";
    if (rutinaId === "custom-libre") return "ENTRENAMIENTO LIBRE";
    // Buscar en TODAS las rutinas (incluidas archivadas) para que los logs
    // históricos que referencian rutinas archivadas sigan mostrando el nombre.
    const rutina = todasLasRutinas.find((r) => r.id === rutinaId);
    return rutina?.nombre.toUpperCase() ?? "RUTINA DESCONOCIDA";
  };

  const getNombreRutinaFromLog = (log: LogEntrenamiento) => {
    return (
      log.rutinaSnapshot ??
      (log.rutinaId === "custom-libre"
        ? "ENTRENAMIENTO LIBRE"
        : getNombreRutina(log.rutinaId))
    );
  };

  const handleStartEditNotas = (log: LogEntrenamiento) => {
    setNotasEditando({ logId: log.id!, texto: log.notas ?? "" });
  };

  const handleSaveNotas = useCallback(
    async (log: LogEntrenamiento) => {
      if (!log.id || !notasEditando) return;
      setGuardandoNotas(true);
      await actualizarLogEntrenamiento(
        log.id,
        log.ejercicios,
        notasEditando.texto,
      );
      setGuardandoNotas(false);
      setNotasEditando(null);
    },
    [notasEditando],
  );

  const getTipoEjercicio = (ejercicioId: string): TipoEjercicio => {
    return catalogoLookup.get(ejercicioId)?.tipo ?? "fuerza";
  };

  const calcularCardioTotales = (
    log: LogEntrenamiento,
  ): { minutos: number; distancia: number } => {
    return log.ejercicios.reduce(
      (acc, ej) => {
        const tipo = getTipoEjercicio(ej.ejercicioId);
        if (tipo !== "cardio" && tipo !== "tiempo") return acc;
        return ej.series.reduce((sAcc, s) => {
          if (!s.completado) return sAcc;
          return {
            minutos: sAcc.minutos + (s.duracionMinutos ?? 0),
            distancia: sAcc.distancia + (s.distanciaKm ?? 0),
          };
        }, acc);
      },
      { minutos: 0, distancia: 0 },
    );
  };

  const hasCardioEjercicios = (log: LogEntrenamiento): boolean => {
    return log.ejercicios.some((ej) => {
      const tipo = getTipoEjercicio(ej.ejercicioId);
      return tipo === "cardio" || tipo === "tiempo";
    });
  };

  const formatSerieDisplay = (
    s: LogEntrenamiento["ejercicios"][number]["series"][number],
    tipo: TipoEjercicio,
  ): string => {
    if (!s.completado) return "NO COMPLETADA";
    if (tipo === "cardio") {
      const min =
        (s.duracionMinutos ?? 0) > 0 ? `${s.duracionMinutos}min` : "—";
      const km = (s.distanciaKm ?? 0) > 0 ? `${s.distanciaKm}km` : "";
      return [min, km].filter(Boolean).join(" // ") || "—";
    }
    if (tipo === "tiempo") {
      const min =
        (s.duracionMinutos ?? 0) > 0 ? `${s.duracionMinutos}min` : "—";
      const kg = (s.peso ?? 0) > 0 ? `${s.peso}kg` : "";
      return [min, kg].filter(Boolean).join(" // ") || "—";
    }
    // fuerza / calistenia
    const kg = (s.peso ?? 0) > 0 ? `${s.peso}kg` : "—";
    const reps = (s.reps ?? 0) > 0 ? `${s.reps}` : "—";
    return `${kg} × ${reps}`;
  };

  const formatSerieChip = (
    s: LogEntrenamiento["ejercicios"][number]["series"][number],
    tipo: TipoEjercicio,
  ): string | null => {
    if (!s.completado) return null;
    if (tipo === "cardio") {
      const km = s.distanciaKm ?? 0;
      return km > 0 ? `${km}km` : null;
    }
    if (tipo === "tiempo") {
      const min = s.duracionMinutos ?? 0;
      return min > 0 ? `${min}min` : null;
    }
    const vol = (s.peso ?? 0) * (s.reps ?? 0);
    return vol > 0 ? `${vol}kg` : null;
  };

  const necesitaChipFuerza = (
    s: LogEntrenamiento["ejercicios"][number]["series"][number],
    tipo: TipoEjercicio,
  ): boolean => {
    if (tipo === "cardio" || tipo === "tiempo") return false;
    return (s.peso ?? 0) * (s.reps ?? 0) > 0;
  };

  const getNombreEjercicio = (ejercicioId: string): string => {
    return (
      catalogoLookup.get(ejercicioId)?.nombre ??
      `[EJERCICIO ${ejercicioId.slice(0, 6)}]`
    );
  };

  const formatHora = (fechaISO: string): string => {
    return new Date(fechaISO).toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const toggleEjercicioExpandido = (key: string) => {
    setEjerciciosExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandirTodosEjercicios = (
    sessionIndex: number,
    log: LogEntrenamiento,
  ) => {
    setEjerciciosExpandidos((prev) => {
      const next = new Set(prev);
      log.ejercicios.forEach((_, idx) => {
        next.add(`${sessionIndex}-${idx}`);
      });
      return next;
    });
  };

  const colapsarTodosEjercicios = (
    sessionIndex: number,
    log: LogEntrenamiento,
  ) => {
    setEjerciciosExpandidos((prev) => {
      const next = new Set(prev);
      log.ejercicios.forEach((_, idx) => {
        next.delete(`${sessionIndex}-${idx}`);
      });
      return next;
    });
  };

  const todosExpandidos = (
    sessionIndex: number,
    log: LogEntrenamiento,
  ): boolean => {
    if (log.ejercicios.length === 0) return false;
    return log.ejercicios.every((_, idx) =>
      ejerciciosExpandidos.has(`${sessionIndex}-${idx}`),
    );
  };

  const renderResumenEntrenamiento = (
    log: LogEntrenamiento,
    index: number,
    total: number,
  ) => {
    const volumenTotal = calcularVolumenTotal(log.ejercicios);
    const cardioTotales = calcularCardioTotales(log);
    const hayCardio = hasCardioEjercicios(log);
    const nombreRutina = getNombreRutinaFromLog(log);
    const esNotasEditando = notasEditando?.logId === log.id;

    return (
      <Card key={log.id ?? index}>
        <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Header */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CheckCircleIcon color="success" fontSize="small" />
            <Typography
              variant="button"
              color="success.main"
              sx={{ flexGrow: 1 }}
            >
              {total > 1
                ? `SESIÓN ${index + 1} DE HOY COMPLETADA ✓`
                : `ENTRENAMIENTO DE HOY COMPLETADO ✓`}
            </Typography>
            <Chip
              label={formatHora(log.fecha)}
              size="small"
              variant="outlined"
              sx={{ borderRadius: 0 }}
            />
          </Box>

          <Box>
            <Typography variant="h6" sx={{ fontWeight: "bold" }}>
              {nombreRutina.toUpperCase()}
            </Typography>
          </Box>

          <Divider />

          {/* Ejercicios con series */}
          <Stack spacing={1.5}>
            {log.ejercicios.map((ej, idx) => {
              const ejercicioKey = `${index}-${idx}`;
              const isExpanded = ejerciciosExpandidos.has(ejercicioKey);

              return (
                <Box key={`${ej.ejercicioId}-${idx}`}>
                  <Box
                    onClick={() => toggleEjercicioExpandido(ejercicioKey)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      mb: 0.5,
                      cursor: "pointer",
                      userSelect: "none",
                      "&:hover": { color: "primary.main" },
                      transition: "color 0.15s",
                    }}
                  >
                    {isExpanded ? (
                      <KeyboardArrowUpIcon fontSize="small" color="action" />
                    ) : (
                      <KeyboardArrowDownIcon fontSize="small" color="action" />
                    )}
                    <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
                      {getNombreEjercicio(ej.ejercicioId)}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: "auto" }}
                    >
                      {ej.series.filter((s) => s.completado).length}/
                      {ej.series.length}
                    </Typography>
                  </Box>
                  <Collapse in={isExpanded}>
                    <Stack spacing={0.5}>
                      {ej.series.map((s, sIdx) => {
                        const tipoEj = getTipoEjercicio(ej.ejercicioId);
                        const chipLabel = formatSerieChip(s, tipoEj);
                        const showChipFuerza = necesitaChipFuerza(s, tipoEj);
                        return (
                          <Box
                            key={sIdx}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              pl: 1,
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ minWidth: 20 }}
                            >
                              S{sIdx + 1}
                            </Typography>
                            {s.completado ? (
                              <Typography variant="body2">
                                {formatSerieDisplay(s, tipoEj)}
                              </Typography>
                            ) : (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ fontStyle: "italic" }}
                              >
                                NO COMPLETADA
                              </Typography>
                            )}
                            {chipLabel && !showChipFuerza && (
                              <Chip
                                label={chipLabel}
                                size="small"
                                variant="outlined"
                                sx={{
                                  borderRadius: 0,
                                  fontSize: "0.65rem",
                                  height: 18,
                                }}
                              />
                            )}
                            {s.completado && showChipFuerza && (
                              <Chip
                                label={`${(s.peso ?? 0) * (s.reps ?? 0)}kg`}
                                size="small"
                                variant="outlined"
                                sx={{
                                  borderRadius: 0,
                                  fontSize: "0.65rem",
                                  height: 18,
                                }}
                              />
                            )}
                          </Box>
                        );
                      })}
                    </Stack>
                  </Collapse>
                </Box>
              );
            })}
          </Stack>

          {/* Collapse/expand all toggle */}
          {log.ejercicios.length > 0 && (
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                size="small"
                variant="text"
                color="inherit"
                startIcon={
                  todosExpandidos(index, log) ? (
                    <UnfoldLessIcon fontSize="small" />
                  ) : (
                    <UnfoldMoreIcon fontSize="small" />
                  )
                }
                onClick={() =>
                  todosExpandidos(index, log)
                    ? colapsarTodosEjercicios(index, log)
                    : expandirTodosEjercicios(index, log)
                }
                sx={{
                  fontSize: "0.7rem",
                  letterSpacing: "0.05em",
                  borderRadius: 0,
                  opacity: 0.6,
                  "&:hover": { opacity: 1 },
                }}
              >
                {todosExpandidos(index, log)
                  ? "COLAPSAR TODOS"
                  : "EXPANDIR TODOS"}
              </Button>
            </Box>
          )}

          <Divider />

          {/* Resumen: Volumen + Cardio */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              p: 1.5,
              bgcolor: "action.hover",
            }}
          >
            {volumenTotal > 0 && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Typography variant="button" color="text.secondary">
                  VOLUMEN TOTAL
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: "bold", color: "primary.main" }}
                >
                  {volumenTotal.toLocaleString("es-ES")} kg
                </Typography>
              </Box>
            )}
            {cardioTotales.minutos > 0 && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Typography variant="button" color="text.secondary">
                  MINUTOS TOTALES
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: "bold", color: "primary.main" }}
                >
                  {cardioTotales.minutos.toLocaleString("es-ES")} min
                </Typography>
              </Box>
            )}
            {cardioTotales.distancia > 0 && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Typography variant="button" color="text.secondary">
                  DISTANCIA TOTAL
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: "bold", color: "primary.main" }}
                >
                  {cardioTotales.distancia.toLocaleString("es-ES")} km
                </Typography>
              </Box>
            )}
            {volumenTotal === 0 && !hayCardio && (
              <Typography variant="button" color="text.secondary">
                SIN DATOS
              </Typography>
            )}
          </Box>

          {/* Notas */}
          <Box>
            {esNotasEditando ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <TextField
                  label="NOTAS / DESCRIPCIÓN"
                  value={notasEditando!.texto}
                  onChange={(e) =>
                    setNotasEditando((prev) =>
                      prev ? { ...prev, texto: e.target.value } : null,
                    )
                  }
                  multiline
                  minRows={2}
                  maxRows={4}
                  fullWidth
                  variant="outlined"
                  size="small"
                  placeholder="EJ: ME SENTÍ FUERTE HOY, SUBÍ PESO EN PRESS BANCA…"
                  slotProps={{
                    input: { sx: { borderRadius: 0 } },
                  }}
                  autoFocus
                />
                <Box
                  sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}
                >
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    onClick={() => setNotasEditando(null)}
                    sx={{ borderRadius: 0 }}
                  >
                    CANCELAR
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    disableElevation
                    startIcon={<SaveIcon />}
                    onClick={() => handleSaveNotas(log)}
                    disabled={guardandoNotas}
                    sx={{ borderRadius: 0 }}
                  >
                    {guardandoNotas ? "GUARDANDO…" : "GUARDAR"}
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ letterSpacing: "0.05em" }}
                  >
                    NOTAS
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => handleStartEditNotas(log)}
                    sx={{
                      borderRadius: 0,
                      color: "text.secondary",
                      "&:hover": { color: "primary.main" },
                      touchAction: "manipulation",
                    }}
                    aria-label="Editar notas"
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Typography
                  variant="body2"
                  color={log.notas ? "text.primary" : "text.secondary"}
                  sx={{
                    fontStyle: log.notas ? "normal" : "italic",
                    mt: 0.5,
                    p: 1,
                    border: 1,
                    borderColor: "divider",
                    minHeight: 40,
                  }}
                >
                  {log.notas ||
                    "[ SIN DESCRIPCIÓN — TOCA EL LÁPIZ PARA AÑADIR ]"}
                </Typography>
              </Box>
            )}
          </Box>

          {/* Botón editar */}
          <Button
            variant="contained"
            color="primary"
            disableElevation
            fullWidth
            startIcon={<EditIcon />}
            onClick={() => onStartTraining(log.rutinaId, log.id)}
          >
            EDITAR ENTRENAMIENTO
          </Button>
        </CardContent>
      </Card>
    );
  };

  const renderRutinaAsignada = () => {
    if (!rutinaHoy) {
      return (
        <EmptyStateCard height={200}>
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              DÍA DE DESCANSO
            </Typography>
            <Typography variant="body2" color="text.secondary">
              NO HAY ENTRENAMIENTO PROGRAMADO
            </Typography>
          </Box>
        </EmptyStateCard>
      );
    }

    return (
      <Card>
        <CardContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            alignItems: "flex-start",
          }}
        >
          <Typography variant="button" color="text.secondary">
            RUTINA ASIGNADA
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: "bold" }}>
            {rutinaHoy.nombre.toUpperCase()}
          </Typography>
          {rutinaHoy.descripcion && (
            <Typography variant="body2" color="text.secondary">
              {rutinaHoy.descripcion}
            </Typography>
          )}
          <Button
            variant="contained"
            color="primary"
            disableElevation
            fullWidth
            startIcon={<FitnessCenterIcon />}
            onClick={() => onStartTraining(rutinaHoy.id)}
            sx={{ mt: 1 }}
          >
            INICIAR ENTRENAMIENTO // {rutinaHoy.nombre.toUpperCase()}
          </Button>
        </CardContent>
      </Card>
    );
  };

  const hayEntrenosHoy = logsHoy.length > 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <PageHeader>INICIO</PageHeader>

      <Typography variant="h5" color="primary">
        HOY // {diaLabel}
      </Typography>

      {/* Si ya entrenó hoy: resúmenes de todas las sesiones; si no: rutina asignada */}
      {hayEntrenosHoy ? (
        <Stack spacing={2}>
          {logsHoy.map((log, idx) =>
            renderResumenEntrenamiento(log, idx, logsHoy.length),
          )}

          {rutinaHoy && (
            <Button
              variant="outlined"
              color="primary"
              fullWidth
              startIcon={<FitnessCenterIcon />}
              onClick={() => onStartTraining(rutinaHoy.id)}
              sx={{ mt: 1 }}
            >
              INICIAR OTRO ENTRENAMIENTO // {rutinaHoy.nombre.toUpperCase()}
            </Button>
          )}
        </Stack>
      ) : (
        renderRutinaAsignada()
      )}

      <Button
        variant="outlined"
        color="primary"
        fullWidth
        startIcon={<AddIcon />}
        onClick={() => setFreeOpen(true)}
        sx={{ mt: -1 }}
      >
        INICIAR ENTRENAMIENTO LIBRE // FUERA_DE_AGENDA
      </Button>

      <Card>
        <CardContent>
          <SectionLabel sx={{ mb: 2 }}>PLANIFICACIÓN SEMANAL</SectionLabel>
          <Stack spacing={2}>
            {DIAS_SEMANA.map((dia) => {
              const rutinaId = plan?.dias[dia]?.rutinaId ?? null;
              const tipos = getTiposRutina(rutinaId);
              return (
                <Box
                  key={dia}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    px: 1,
                    py: 2,
                    border: 1,
                    borderColor: dia === diaSemana ? "primary.main" : "divider",
                    bgcolor:
                      dia === diaSemana
                        ? "action.selected"
                        : "background.paper",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <Typography
                      variant="button"
                      sx={{
                        minWidth: 80,
                        color:
                          dia === diaSemana ? "primary.main" : "text.primary",
                      }}
                    >
                      {dia.toUpperCase()}
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <InputLabel id={`plan-${dia}-label`}>RUTINA</InputLabel>
                      <Select
                        labelId={`plan-${dia}-label`}
                        value={rutinaId ?? ""}
                        label="RUTINA"
                        onChange={(e) =>
                          handlePlanChange(
                            dia,
                            e.target.value === "" ? null : e.target.value,
                          )
                        }
                      >
                        <MenuItem value="">
                          <em>DÍA DE DESCANSO</em>
                        </MenuItem>
                        {rutinas.map((r) => (
                          <MenuItem key={r.id} value={r.id}>
                            {r.nombre}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                  {tipos.length > 0 && (
                    <Box
                      sx={{
                        display: "flex",
                        gap: 0.5,
                        justifyContent: "flex-end",
                      }}
                    >
                      {tipos.map((t) => (
                        <Chip
                          key={t}
                          label={TIPO_LABEL[t]}
                          size="small"
                          sx={{
                            borderRadius: 0,
                            fontSize: "0.6rem",
                            height: 18,
                            bgcolor: TIPO_COLOR[t],
                            color: "#fff",
                            fontWeight: "bold",
                            letterSpacing: "0.03em",
                          }}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <SectionLabel sx={{ mb: 2 }}>HISTORIAL RECIENTE</SectionLabel>
          {logsRecientes.length === 0 ? (
            <EmptyStateCard height={120}>
              [ NO HAY ENTRENAMIENTOS REGISTRADOS ]
            </EmptyStateCard>
          ) : (
            <Stack spacing={1}>
              {logsRecientes.map((log) => {
                const volLog = calcularVolumenTotal(log.ejercicios);
                const cardioLog = calcularCardioTotales(log);
                return (
                <Box
                  key={log.id}
                  onClick={() => onStartTraining(log.rutinaId, log.id)}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    p: 1.5,
                    border: 1,
                    borderColor: "divider",
                    cursor: "pointer",
                    "&:hover": { bgcolor: "action.hover" },
                    transition: "background-color 0.15s",
                  }}
                >
                  <Box sx={{ minWidth: 0, flexGrow: 1, mr: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                      {getNombreRutinaFromLog(log)}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1.5, mt: 0.25, flexWrap: "wrap" }}>
                      {volLog > 0 && (
                        <Typography
                          variant="caption"
                          color="primary.main"
                          sx={{ fontFamily: '"Courier New", Courier, monospace', letterSpacing: "0.03em" }}
                        >
                          {volLog.toLocaleString("es-ES")} kg
                        </Typography>
                      )}
                      {cardioLog.minutos > 0 && (
                        <Typography
                          variant="caption"
                          color="primary.main"
                          sx={{ fontFamily: '"Courier New", Courier, monospace', letterSpacing: "0.03em" }}
                        >
                          {cardioLog.minutos.toLocaleString("es-ES")} min
                        </Typography>
                      )}
                      {cardioLog.distancia > 0 && (
                        <Typography
                          variant="caption"
                          color="primary.main"
                          sx={{ fontFamily: '"Courier New", Courier, monospace', letterSpacing: "0.03em" }}
                        >
                          {cardioLog.distancia.toLocaleString("es-ES")} km
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(log.fecha).toLocaleDateString("es-ES")}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartTraining(log.rutinaId, log.id);
                      }}
                      sx={{
                        borderRadius: 0,
                        color: "text.secondary",
                        "&:hover": { color: "primary.main" },
                        touchAction: "manipulation",
                      }}
                      aria-label="Editar entrenamiento"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              )})}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={freeOpen}
        onClose={() => setFreeOpen(false)}
        fullWidth
        maxWidth="sm"
        slotProps={{
          paper: { sx: { borderRadius: 0, border: 1, borderColor: "divider" } },
        }}
      >
        <DialogTitle sx={{ letterSpacing: "0.05em" }}>
          ENTRENAMIENTO LIBRE
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 4 }}>
          <Stack spacing={2}>
            <Button
              variant="outlined"
              color="primary"
              fullWidth
              onClick={() => {
                setFreeOpen(false);
                onStartTraining("custom-libre");
              }}
            >
              ENTRENAMIENTO COMPLETAMENTE EN BLANCO
            </Button>
            <SectionLabel>// O ELIGE UNA RUTINA EXISTENTE</SectionLabel>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              {rutinas.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  [ NO HAY RUTINAS GUARDADAS ]
                </Typography>
              ) : (
                rutinas.map((r) => (
                  <Button
                    key={r.id}
                    variant="outlined"
                    color="primary"
                    onClick={() => {
                      setFreeOpen(false);
                      onStartTraining(r.id);
                    }}
                    sx={{ justifyContent: "flex-start" }}
                  >
                    {r.nombre.toUpperCase()}
                  </Button>
                ))
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setFreeOpen(false)}
            color="inherit"
            disableElevation
          >
            CANCELAR
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
