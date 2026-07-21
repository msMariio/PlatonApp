import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Box,
  Button,
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
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  type EjercicioReal,
  type LogEntrenamiento,
  type Rutina,
} from "../../core/db";
import { PageHeader } from "../../components/PageHeader";
import { EmptyStateCard } from "../../components/EmptyStateCard";
import { AppTextField } from "../../components/AppTextField";
import { SelectEjercicioDialog } from "../rutinas/components/SelectEjercicioDialog";
import { EjercicioLoggerCard } from "./components/EjercicioLoggerCard";
import {
  getUltimoLogDeRutina,
  guardarLogEntrenamiento,
  actualizarLogEntrenamiento,
  eliminarLogEntrenamiento,
  buildEjerciciosRealesDesdeRutina,
  getPlaceholderSerie,
} from "./data";

export const CUSTOM_LIBRE_ID = "custom-libre";

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
  const [notas, setNotas] = useState("");
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [fecha, setFecha] = useState(() => new Date().toISOString().split("T")[0]);

  // Snapshot of the initial state to detect unsaved changes
  const initialSnapshot = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!rutina) return;

      if (isEditMode && logId !== undefined) {
        const logExistente = await db.logsEntrenamientos.get(logId);
        if (cancelled) return;
        if (logExistente) {
          setEjercicios(logExistente.ejercicios);
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
    setSelectOpen(false);
  };

  const handleDeleteEjercicio = (idx: number) => {
    setEjercicios((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleGuardar = async () => {
    if (!rutina) return;
    setGuardando(true);
    // Build ISO datetime from date and current time (or noon for past dates)
    const fechaISO = new Date(fecha + "T12:00:00").toISOString();
    if (isEditMode && logId !== undefined) {
      await actualizarLogEntrenamiento(logId, ejercicios, notas, fechaISO);
    } else {
      await guardarLogEntrenamiento(
        rutinaId,
        ejercicios,
        isCustomLibre ? rutina.nombre : undefined,
        notas || undefined,
        fechaISO
      );
    }
    // Update snapshot after saving so dirty check resets
    initialSnapshot.current = JSON.stringify({ ejercicios, notas, fecha });
    setGuardando(false);
    onSaved?.();
  };

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
            getPlaceholderSerie(ej.ejercicioId, sIdx, rutina, ultimoLog)
          );
          return (
            <EjercicioLoggerCard
              key={`${ej.ejercicioId}-${idx}`}
              ejercicio={ej}
              catalog={catalogoLookup.get(ej.ejercicioId)}
              placeholders={seriesPlaceholders}
              onChange={(next) => handleChangeEjercicio(idx, next)}
              onDelete={() => handleDeleteEjercicio(idx)}
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
        onPick={handleAddEjercicio}
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
