import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  uid,
  type EjercicioReal,
  type LogEntrenamiento,
  type Rutina,
} from "../../core/db";
import { PageHeader } from "../../components/PageHeader";
import { EmptyStateCard } from "../../components/EmptyStateCard";
import { AppTextField } from "../../components/AppTextField";
import { SelectEjercicioDialog } from "../rutinas/components/SelectEjercicioDialog";
import { EjercicioLoggerCard } from "./components/EjercicioLoggerCard";
import { OverloadDetectionModal } from "./components/OverloadDetectionModal";
import { PersonalRecordsModal } from "./components/PersonalRecordsModal";
import {
  compareWorkoutWithTemplate,
  actualizarTemplateConMejoras,
  type EjercicioMejora,
} from "./utils/compareWorkoutWithTemplate";
import {
  getUltimoLogDeRutina,
  getUltimosLogsPorEjercicio,
  guardarLogEntrenamiento,
  actualizarLogEntrenamiento,
  eliminarLogEntrenamiento,
  buildEjerciciosRealesDesdeRutina,
  getPlaceholderSerie,
  calcularVolumenTotal,
  detectarRecordsPersonales,
  type RecordPersonal,
  CUSTOM_LIBRE_ID,
} from "./data";

type Props = {
  rutinaId: string;
  onBack: () => void;
  onSaved?: () => void;
  /** Si se pasa, el logger carga el log existente y actualiza en vez de crear. */
  logId?: number;
};

export function TrainingLoggerView({ rutinaId, onBack, onSaved, logId }: Props) {
  const isEditMode = logId !== undefined;
  const dbRutina = useLiveQuery(() => db.rutinas.get(rutinaId), [rutinaId]);
  const ejerciciosCatalogo =
    useLiveQuery(() => db.ejercicios.toArray(), []) ?? [];

  const isCustomLibre = rutinaId === CUSTOM_LIBRE_ID;

  const rutina: Rutina | undefined = useMemo(() => {
    if (isCustomLibre) {
      return {
        id: CUSTOM_LIBRE_ID,
        nombre: "ENTRENAMIENTO LIBRE",
        descripcion: "",
        ejercicios: [],
        order: 0,
        createdAt: new Date().toISOString(),
      };
    }
    return dbRutina;
  }, [isCustomLibre, dbRutina]);

  const [guardando, setGuardando] = useState(false);
  const [ejercicios, setEjercicios] = useState<EjercicioReal[]>([]);
  const [ultimoLog, setUltimoLog] = useState<LogEntrenamiento | undefined>();
  const [initialized, setInitialized] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const [replaceInstanceId, setReplaceInstanceId] = useState<string | null>(null);
  const [ejercicioInstanceIds, setEjercicioInstanceIds] = useState<string[]>([]);
  const [ultimosLogsPorEjercicio, setUltimosLogsPorEjercicio] = useState(
    new Map<string, LogEntrenamiento>(),
  );
  const [sustituciones, setSustituciones] = useState<
    Record<
      string,
      {
        rutinaEjercicioId: string;
        originalEjercicioId: string;
        nuevoEjercicioId: string;
      }
    >
  >({});
  const [notas, setNotas] = useState("");
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showOverloadModal, setShowOverloadModal] = useState(false);
  const [overloadDiff, setOverloadDiff] = useState<EjercicioMejora[]>([]);
  const [overloadSubstitutions, setOverloadSubstitutions] = useState<
    { anterior: string; nuevo: string }[]
  >([]);
  const [personalRecords, setPersonalRecords] = useState<RecordPersonal[]>([]);
  const [showPersonalRecords, setShowPersonalRecords] = useState(false);
  const [fecha, setFecha] = useState(() => new Date().toISOString().split("T")[0]);

  // Snapshot of the initial state to detect unsaved changes
  const initialSnapshot = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!rutina) return;

      const logsGlobales = await getUltimosLogsPorEjercicio();
      if (cancelled) return;
      setUltimosLogsPorEjercicio(logsGlobales);

      if (isEditMode && logId !== undefined) {
        const logExistente = await db.logsEntrenamientos.get(logId);
        if (cancelled) return;
        if (logExistente) {
          setEjercicios(logExistente.ejercicios);
          setEjercicioInstanceIds(logExistente.ejercicios.map(() => uid()));
          setSustituciones({});
          setNotas(logExistente.notas ?? "");
          const fechaLog = new Date(logExistente.fecha).toISOString().split("T")[0];
          setFecha(fechaLog);
          initialSnapshot.current = JSON.stringify({
            ejercicios: logExistente.ejercicios,
            notas: logExistente.notas ?? "",
            fecha: fechaLog,
          });
          setInitialized(true);
          return;
        }
      }

      const log = isCustomLibre
        ? undefined
        : await getUltimoLogDeRutina(rutinaId);
      if (cancelled) return;
      setUltimoLog(log);
      if (!initialized) {
        const iniciales = isCustomLibre
          ? []
          : buildEjerciciosRealesDesdeRutina(rutina, log);
        setEjercicios(iniciales);
        setEjercicioInstanceIds(
          isCustomLibre ? [] : rutina.ejercicios.map((ejercicio) => ejercicio.id),
        );
        setSustituciones({});
        setNotas("");
        initialSnapshot.current = JSON.stringify({
          ejercicios: iniciales,
          notas: "",
          fecha: new Date().toISOString().split("T")[0],
        });
        setInitialized(true);
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [rutina, rutinaId, initialized, isCustomLibre, isEditMode, logId]);

  const isDirty = useMemo(() => {
    const current = JSON.stringify({ ejercicios, notas, fecha });
    return current !== initialSnapshot.current;
  }, [ejercicios, notas, fecha]);

  const volumenTotal = useMemo(() => calcularVolumenTotal(ejercicios), [ejercicios]);

  const handleBackClick = useCallback(() => {
    if (isDirty) {
      setShowExitDialog(true);
    } else {
      onBack();
    }
  }, [isDirty, onBack]);

  const handleDiscardAndExit = useCallback(() => {
    setShowExitDialog(false);
    onBack();
  }, [onBack]);

  const handleDeleteClick = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (logId === undefined) return;
    await eliminarLogEntrenamiento(logId);
    setShowDeleteDialog(false);
    onSaved?.();
    onBack();
  }, [logId, onSaved, onBack]);

  const catalogoLookup = new Map(ejerciciosCatalogo.map((e) => [e.id, e]));

  const handleChangeEjercicio = (idx: number, next: EjercicioReal) => {
    setEjercicios((prev) => prev.map((e, i) => (i === idx ? next : e)));
  };

  const handleAddEjercicio = (ejercicioId: string) => {
    setEjercicios((prev) => [
      ...prev,
      {
        ejercicioId,
        series: [
          { peso: 0, reps: 0, duracionMinutos: 0, distanciaKm: 0, nivelInclinacion: 0, completado: false },
        ],
      },
    ]);
    setEjercicioInstanceIds((prev) => [...prev, uid()]);
    setSelectOpen(false);
  };

  const handleSelectEjercicio = (ejercicioId: string) => {
    if (replaceInstanceId === null) {
      handleAddEjercicio(ejercicioId);
      return;
    }

    const instanceId = replaceInstanceId;
    const idx = ejercicioInstanceIds.indexOf(instanceId);
    const actual = ejercicios[idx];
    if (!actual || idx < 0) return;
    const originalEjercicioId =
      sustituciones[instanceId]?.originalEjercicioId ?? actual.ejercicioId;
    const rutinaEjercicioId =
      sustituciones[instanceId]?.rutinaEjercicioId ?? instanceId;
    setSustituciones((prev) => ({
      ...prev,
      [instanceId]: { rutinaEjercicioId, originalEjercicioId, nuevoEjercicioId: ejercicioId },
    }));
    setEjercicios((prev) =>
      prev.map((ejercicio, i) =>
        i === idx
          ? {
              ...ejercicio,
              ejercicioId,
              series: ejercicio.series.map(() => ({
                peso: 0,
                reps: 0,
                duracionMinutos: 0,
                distanciaKm: 0,
                nivelInclinacion: 0,
                completado: false,
              })),
            }
          : ejercicio,
      ),
    );
    setReplaceInstanceId(null);
    setSelectOpen(false);
  };

  const handleReplaceEjercicio = (instanceId: string) => {
    setReplaceInstanceId(instanceId);
    setSelectOpen(true);
  };

  const handleDeleteEjercicio = (idx: number) => {
    const instanceId = ejercicioInstanceIds[idx];
    setEjercicios((prev) => prev.filter((_, i) => i !== idx));
    setEjercicioInstanceIds((prev) => prev.filter((_, i) => i !== idx));
    if (instanceId) {
      setSustituciones((prev) => {
        const next = { ...prev };
        delete next[instanceId];
        return next;
      });
    }
  };

  /** Guarda el entrenamiento (sin actualizar plantilla). */
  const ejecutarGuardadoSimple = useCallback(async () => {
    if (!rutina) return;
    setGuardando(true);
    let records: RecordPersonal[] = [];
    try {
      records = await detectarRecordsPersonales(ejercicios, logId);
    } catch {
      // El registro del entrenamiento no debe bloquearse por un fallo analítico.
    }
    const fechaISO = new Date(fecha + "T12:00:00").toISOString();
    if (isEditMode && logId !== undefined) {
      await actualizarLogEntrenamiento(logId, ejercicios, notas, fechaISO);
    } else {
      await guardarLogEntrenamiento(
        rutinaId,
        ejercicios,
        isCustomLibre ? rutina.nombre : undefined,
        notas || undefined,
        fechaISO,
      );
    }
    initialSnapshot.current = JSON.stringify({ ejercicios, notas, fecha });
    setGuardando(false);
    if (records.length > 0) {
      setPersonalRecords(records);
      setShowPersonalRecords(true);
    } else {
      onSaved?.();
    }
  }, [
    rutina,
    fecha,
    isEditMode,
    logId,
    rutinaId,
    ejercicios,
    notas,
    isCustomLibre,
    onSaved,
  ]);

  const handleGuardar = useCallback(async () => {
    if (!rutina) return;

    // Modo edición o entrenamiento libre: guardar directamente
    if (isEditMode || isCustomLibre) {
      await ejecutarGuardadoSimple();
      return;
    }

    // Comparar contra la plantilla para detectar sobrecarga progresiva
    const diff = compareWorkoutWithTemplate(ejercicios, rutina, sustituciones);
    const sustitucionesParaMostrar = Object.values(sustituciones).map((s) => ({
      anterior: ejerciciosCatalogo.find((e) => e.id === s.originalEjercicioId)?.nombre ?? s.originalEjercicioId,
      nuevo: ejerciciosCatalogo.find((e) => e.id === s.nuevoEjercicioId)?.nombre ?? s.nuevoEjercicioId,
    }));

    if (diff.length === 0 && sustitucionesParaMostrar.length === 0) {
      // Sin mejoras detectadas → guardar directamente
      await ejecutarGuardadoSimple();
      return;
    }

    // Rellenar nombres de ejercicios desde el catálogo (ya en memoria)
    const lookup = new Map(ejerciciosCatalogo.map((e) => [e.id, e]));
    const diffConNombre: EjercicioMejora[] = diff.map((d) => ({
      ...d,
      nombre: lookup.get(d.ejercicioId)?.nombre ?? d.ejercicioId,
    }));

    setOverloadDiff(diffConNombre);
    setOverloadSubstitutions(sustitucionesParaMostrar);
    setShowOverloadModal(true);
  }, [
    rutina,
    isEditMode,
    isCustomLibre,
    ejercicios,
    ejecutarGuardadoSimple,
    sustituciones,
    ejerciciosCatalogo,
  ]);

  /** Guardar + actualizar plantilla con las nuevas marcas. */
  const handleUpdateTemplate = useCallback(async () => {
    if (!rutina) return;
    setShowOverloadModal(false);
    setGuardando(true);
    try {
      try {
        await actualizarTemplateConMejoras(
          rutinaId,
          ejercicios,
          rutina,
          sustituciones,
          ejercicioInstanceIds,
        );
      } catch {
        // Si falla la actualización de plantilla, seguimos guardando el log
      }
      await ejecutarGuardadoSimple();
    } finally {
      setGuardando(false);
    }
  }, [
    rutina,
    rutinaId,
    ejercicios,
    ejecutarGuardadoSimple,
    sustituciones,
    ejercicioInstanceIds,
  ]);

  /** Guardar sin tocar la plantilla. */
  const handleSkipUpdate = useCallback(async () => {
    setShowOverloadModal(false);
    await ejecutarGuardadoSimple();
  }, [ejecutarGuardadoSimple]);

  if (!rutina) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          [ CARGANDO RUTINA… ]
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton
          onClick={handleBackClick}
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
          {isEditMode ? "EDITAR " : ""}{rutina.nombre.toUpperCase()}
        </PageHeader>
        {isEditMode && (
          <IconButton
            onClick={handleDeleteClick}
            sx={{
              color: "error.main",
              borderRadius: 0,
              touchAction: "manipulation",
              "&:hover": { bgcolor: "error.main", color: "error.contrastText" },
            }}
            aria-label="Eliminar entrenamiento"
          >
            <DeleteIcon />
          </IconButton>
        )}
      </Box>

      <Typography variant="body2" color="text.secondary">
        {isEditMode
          ? "EDITA LAS SERIES Y GUARDA LOS CAMBIOS."
          : "REGISTRA LAS SERIES REALES. EL CHECK AUTO-RELLENA EL PLACEHOLDER."}
      </Typography>

      <AppTextField
        type="date"
        label="FECHA DEL ENTRENAMIENTO"
        fullWidth
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
      />

      {ejercicios.length === 0 ? (
        <EmptyStateCard height={160}>
          {isCustomLibre
            ? "[ ENTRENAMIENTO EN BLANCO // AÑADE EL PRIMER EJERCICIO ]"
            : "[ RUTINA VACÍA // NO HAY EJERCICIOS PARA REGISTRAR ]"}
        </EmptyStateCard>
      ) : (
        ejercicios.map((ej, idx) => {
          const seriesPlaceholders = ej.series.map((_, sIdx) =>
            getPlaceholderSerie(
              ej.ejercicioId,
              sIdx,
              rutina,
              sustituciones[ejercicioInstanceIds[idx]] ? undefined : ultimoLog,
              ultimosLogsPorEjercicio.get(ej.ejercicioId),
            ),
          );
          return (
            <EjercicioLoggerCard
              key={ejercicioInstanceIds[idx]}
              ejercicio={ej}
              catalog={catalogoLookup.get(ej.ejercicioId)}
              placeholders={seriesPlaceholders}
              onChange={(next) => handleChangeEjercicio(idx, next)}
              onDelete={() => handleDeleteEjercicio(idx)}
              onReplace={() => handleReplaceEjercicio(ejercicioInstanceIds[idx])}
            />
          );
        })
      )}

      <Button
        variant="outlined"
        color="primary"
        fullWidth
        startIcon={<AddIcon />}
        onClick={() => setSelectOpen(true)}
        sx={{ mt: 1 }}
      >
        AÑADIR EJERCICIO
      </Button>

      <TextField
        label="NOTAS / DESCRIPCIÓN DEL ENTRENO"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        multiline
        minRows={2}
        maxRows={4}
        fullWidth
        variant="outlined"
        placeholder="EJ: ME SENTÍ FUERTE HOY, SUBÍ PESO EN PRESS BANCA…"
        slotProps={{
          input: { sx: { borderRadius: 0 } },
        }}
        sx={{ mt: 1 }}
      />

      {volumenTotal > 0 && (
        <Card sx={{ mt: 2 }}>
          <CardContent
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              py: 2,
              "&:last-child": { pb: 2 },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FitnessCenterIcon
                sx={{ fontSize: 20, color: "primary.main" }}
              />
              <Typography variant="button" color="text.secondary">
                VOLUMEN TOTAL
              </Typography>
            </Box>
            <Typography
              variant="h6"
              sx={{ fontWeight: "bold", color: "primary.main" }}
            >
              {volumenTotal.toLocaleString("es-ES")} kg
            </Typography>
          </CardContent>
        </Card>
      )}

      <Button
        variant="contained"
        color="primary"
        disableElevation
        fullWidth
        disabled={guardando}
        onClick={handleGuardar}
        sx={{ mt: 1 }}
      >
        {guardando
          ? "GUARDANDO…"
          : isEditMode
            ? "GUARDAR CAMBIOS"
            : "FINALIZAR Y GUARDAR"}
      </Button>

      <SelectEjercicioDialog
        open={selectOpen}
        onClose={() => setSelectOpen(false)}
        onPick={handleSelectEjercicio}
        title={replaceInstanceId === null ? "AÑADIR EJERCICIO" : "SUSTITUIR EJERCICIO"}
      />

      {/* Overload detection modal */}
      <OverloadDetectionModal
        open={showOverloadModal}
        mejoras={overloadDiff}
        sustituciones={overloadSubstitutions}
        onUpdateTemplate={handleUpdateTemplate}
        onSkipUpdate={handleSkipUpdate}
        onClose={() => setShowOverloadModal(false)}
        disabled={guardando}
      />

      <PersonalRecordsModal
        open={showPersonalRecords}
        records={personalRecords}
        nombresEjercicios={catalogoLookup.size > 0 ? new Map([...catalogoLookup].map(([id, ejercicio]) => [id, ejercicio.nombre])) : new Map()}
        onClose={() => {
          setShowPersonalRecords(false);
          onSaved?.();
        }}
      />

      {/* Unsaved changes confirmation dialog */}
      <Dialog
        open={showExitDialog}
        onClose={() => setShowExitDialog(false)}
        slotProps={{
          paper: { sx: { borderRadius: 0, border: 1, borderColor: "divider" } },
        }}
      >
        <DialogTitle sx={{ letterSpacing: "0.05em" }}>
          CAMBIOS SIN GUARDAR
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            TIENES CAMBIOS SIN GUARDAR EN ESTE ENTRENAMIENTO. ¿QUIERES SALIR Y
            DESCARTAR LOS CAMBIOS?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setShowExitDialog(false)}
            color="inherit"
            disableElevation
          >
            SEGUIR EDITANDO
          </Button>
          <Button
            onClick={handleDiscardAndExit}
            variant="contained"
            color="error"
            disableElevation
          >
            DESCARTAR CAMBIOS
          </Button>
        </DialogActions>
      </Dialog>
      {/* Delete confirmation dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        slotProps={{
          paper: { sx: { borderRadius: 0, border: 1, borderColor: "divider" } },
        }}
      >
        <DialogTitle sx={{ letterSpacing: "0.05em" }}>
          ELIMINAR ENTRENAMIENTO
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿ESTÁS SEGURO DE QUE QUIERES ELIMINAR ESTE ENTRENAMIENTO? ESTA
            ACCIÓN NO SE PUEDE DESHACER Y PERDERÁS TODOS LOS DATOS DE LAS
            SERIES REGISTRADAS.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setShowDeleteDialog(false)}
            color="inherit"
            disableElevation
          >
            CANCELAR
          </Button>
          <Button
            onClick={handleConfirmDelete}
            variant="contained"
            color="error"
            disableElevation
            startIcon={<DeleteIcon />}
          >
            ELIMINAR
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
