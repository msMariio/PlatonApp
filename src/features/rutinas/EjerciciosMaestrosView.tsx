import { useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import UndoIcon from "@mui/icons-material/Undo";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "../../components/PageHeader";
import { AppTextField } from "../../components/AppTextField";
import { EmptyStateCard } from "../../components/EmptyStateCard";
import { db, type Ejercicio } from "../../core/db";
import { eliminarEjercicio, desarchivarEjercicio } from "./data";
import { SelectEjercicioDialog } from "./components/SelectEjercicioDialog";
import { EditarEjercicioDialog } from "./components/EditarEjercicioDialog";

type Props = {
  onBack: () => void;
  onOpenAnalytics: (ejercicioId: string) => void;
};

type VistaArchivados = "activos" | "archivados";

function EjercicioCard({
  ejercicio,
  isArchived,
  onDelete,
  onUnarchive,
  onEdit,
  onOpenAnalytics,
}: {
  ejercicio: Ejercicio;
  isArchived: boolean;
  onDelete: () => void;
  onUnarchive: () => void;
  onEdit: () => void;
  onOpenAnalytics: () => void;
}) {
  const tipoLabel =
    ejercicio.tipo === "fuerza"
      ? "FUERZA"
      : ejercicio.tipo === "cardio"
        ? "CARDIO"
        : ejercicio.tipo === "tiempo"
          ? "TIEMPO"
          : "CALISTENIA";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        p: 2,
        gap: 1.5,
        border: 1,
        borderColor: isArchived ? "text.disabled" : "divider",
        bgcolor: isArchived ? "action.disabledBackground" : "background.paper",
        cursor: isArchived ? "default" : "pointer",
        opacity: isArchived ? 0.7 : 1,
        "&:hover": isArchived
          ? {}
          : { borderColor: "primary.main" },
      }}
      onClick={isArchived ? undefined : onOpenAnalytics}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isArchived ? "text.disabled" : "primary.main",
          fontSize: 20,
        }}
        aria-hidden
      >
        <FitnessCenterIcon fontSize="small" />
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography
          variant="body1"
          sx={{
            fontWeight: "bold",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textDecoration: isArchived ? "line-through" : "none",
            color: isArchived ? "text.disabled" : "text.primary",
          }}
        >
          {ejercicio.nombre}
        </Typography>
        <Typography
          variant="caption"
          color={isArchived ? "text.disabled" : "text.secondary"}
        >
          {ejercicio.grupoMuscular.toUpperCase()} · {tipoLabel}
          {isArchived ? " · ARCHIVADO" : ""}
        </Typography>
      </Box>
      {isArchived ? (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onUnarchive();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          sx={{
            color: "text.secondary",
            "&:hover": { color: "primary.main" },
            borderRadius: 0,
            touchAction: "manipulation",
          }}
          aria-label={`Desarchivar ejercicio ${ejercicio.nombre}`}
        >
          <UndoIcon fontSize="small" />
        </IconButton>
      ) : (
        <>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            sx={{
              color: "text.secondary",
              "&:hover": { color: "primary.main" },
              borderRadius: 0,
              touchAction: "manipulation",
            }}
            aria-label={`Editar ejercicio ${ejercicio.nombre}`}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            sx={{
              color: "text.secondary",
              "&:hover": { color: "error.main" },
              borderRadius: 0,
              touchAction: "manipulation",
            }}
            aria-label={`Eliminar ejercicio ${ejercicio.nombre}`}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </>
      )}
    </Box>
  );
}

export function EjerciciosMaestrosView({ onBack, onOpenAnalytics }: Props) {
  const ejercicios = useLiveQuery(() => db.ejercicios.toArray(), []) ?? [];
  const [filtro, setFiltro] = useState("");
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Ejercicio | null>(null);
  const [vista, setVista] = useState<VistaArchivados>("activos");

  const f = filtro.trim().toLowerCase();
  const activos = ejercicios.filter((e) => !e.isArchived);
  const archivados = ejercicios.filter((e) => e.isArchived);

  const fuente = vista === "activos" ? activos : archivados;
  const filtrados = [...fuente]
    .filter(
      (e) =>
        e.nombre.toLowerCase().includes(f) ||
        e.grupoMuscular.toLowerCase().includes(f),
    )
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const handleDelete = async (ej: Ejercicio) => {
    // Calcular si está en uso ANTES de confirmar, para mostrar el mensaje correcto
    const rutinas = await db.rutinas.toArray();
    const enRutina = rutinas.some((r) =>
      r.ejercicios.some((ex) => ex.ejercicioId === ej.id),
    );
    const logs = await db.logsEntrenamientos.toArray();
    const enLog = logs.some((l) =>
      l.ejercicios.some((ex) => ex.ejercicioId === ej.id),
    );

    const enUso = enRutina || enLog;

    const mensaje = enUso
      ? `"${ej.nombre}" está siendo usado en ${enRutina && enLog ? "rutinas y entrenamientos" : enRutina ? "alguna rutina" : "algún entrenamiento"}. No se puede eliminar físicamente.\n\nSe archivará para ocultarlo de la lista sin perder sus datos históricos. Podrás desarchivarlo más tarde.`
      : `¿Eliminar "${ej.nombre}" permanentemente?\n\nEsta acción no se puede deshacer. El ejercicio no se usa en ninguna rutina ni entrenamiento.`;

    if (!window.confirm(mensaje)) return;

    const resultado = await eliminarEjercicio(ej.id);
    // Si se archivó, cambiamos a vista activos para evitar confusión
    if (resultado === "archivado") {
      setVista("activos");
    }
  };

  const handleUnarchive = async (ej: Ejercicio) => {
    await desarchivarEjercicio(ej.id);
    // Si no quedan más archivados, volver a activos
    if (archivados.length <= 1) {
      setVista("activos");
    }
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
        <PageHeader sx={{ flexGrow: 1 }}>EJERCICIOS</PageHeader>
      </Box>
      <Box sx={{ display: "flex", gap: 1 }}>
        <AppTextField
          label="BUSCAR"
          fullWidth
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <Button
          variant="contained"
          color="primary"
          disableElevation
          onClick={() => setCreando(true)}
          sx={{ minWidth: 48, px: 1 }}
        >
          <AddIcon />
        </Button>
      </Box>
      {archivados.length > 0 && (
        <ToggleButtonGroup
          exclusive
          size="small"
          value={vista}
          onChange={(_, v) => v && setVista(v as VistaArchivados)}
          sx={{ alignSelf: "flex-start" }}
        >
          <ToggleButton
            value="activos"
            sx={{ borderRadius: "0 !important" }}
          >
            ACTIVOS ({activos.length})
          </ToggleButton>
          <ToggleButton
            value="archivados"
            sx={{ borderRadius: "0 !important" }}
          >
            ARCHIVADOS ({archivados.length})
          </ToggleButton>
        </ToggleButtonGroup>
      )}
      {filtrados.length === 0 ? (
        <EmptyStateCard height={160}>
          {vista === "activos"
            ? "[ NO HAY EJERCICIOS // CREA UNO NUEVO ]"
            : "[ NO HAY EJERCICIOS ARCHIVADOS ]"}
        </EmptyStateCard>
      ) : (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            maxHeight: 500,
            overflowY: "auto",
          }}
        >
          {filtrados.map((e) => {
            const isArchived = !!e.isArchived;
            return (
              <EjercicioCard
                key={e.id}
                ejercicio={e}
                isArchived={isArchived}
                onDelete={() => handleDelete(e)}
                onUnarchive={() => handleUnarchive(e)}
                onEdit={() => setEditando(e)}
                onOpenAnalytics={() => onOpenAnalytics(e.id)}
              />
            );
          })}
        </Box>
      )}

      <SelectEjercicioDialog
        open={creando}
        onClose={() => setCreando(false)}
        onPick={(id) => {
          setCreando(false);
          onOpenAnalytics(id);
        }}
        startCreating
      />

      <EditarEjercicioDialog
        open={editando !== null}
        ejercicio={editando}
        onClose={() => setEditando(null)}
        onSaved={() => setEditando(null)}
      />
    </Box>
  );
}
