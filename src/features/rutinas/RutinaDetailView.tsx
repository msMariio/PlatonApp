import { useState } from "react";
import { Box, Button, IconButton, Typography } from "@mui/material";
import { AppTextField } from "../../components/AppTextField";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../core/db";
import type { EjercicioEnRutina } from "../../core/db";
import { PageHeader } from "../../components/PageHeader";
import {
  renombrarRutina,
  setRutinaDescripcion,
  setEjerciciosEnRutina,
  buildEjercicioInicial,
} from "./data";
import { EjercicioEnRutinaCard } from "./components/EjercicioEnRutinaCard";
import { SelectEjercicioDialog } from "./components/SelectEjercicioDialog";

type Props = {
  rutinaId: string;
  onBack: () => void;
};

export function RutinaDetailView({ rutinaId, onBack }: Props) {
  const rutina = useLiveQuery(() => db.rutinas.get(rutinaId), [rutinaId]);
  const ejerciciosCatalogo =
    useLiveQuery(() => db.ejercicios.toArray(), []) ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectOpen, setSelectOpen] = useState(false);

  // Edit local del nombre/descripción. Hidratamos en render-phase pattern
  // (no useEffect setState) cuando rutina.id cambia — patrón oficial de React.
  const [nombreDraft, setNombreDraft] = useState<string>("");
  const [descDraft, setDescDraft] = useState<string>("");
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  if (rutina && rutina.id !== hydratedFor) {
    setHydratedFor(rutina.id);
    setNombreDraft(rutina.nombre);
    setDescDraft(rutina.descripcion ?? "");
  }

  const catalogoLookup = new Map(ejerciciosCatalogo.map((e) => [e.id, e]));

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const ejercicios: EjercicioEnRutina[] = rutina
    ? [...rutina.ejercicios].sort((a, b) => a.order - b.order)
    : [];

  if (!rutina) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          [ CARGANDO RUTINA… ]
        </Typography>
      </Box>
    );
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || String(active.id) === String(over.id)) return;
    const oi = ejercicios.findIndex((x) => x.id === active.id);
    const ni = ejercicios.findIndex((x) => x.id === over.id);
    if (oi < 0 || ni < 0 || oi === ni) return;
    const reordered = arrayMove(ejercicios, oi, ni);
    await setEjerciciosEnRutina(
      rutinaId,
      reordered.map((ej, i) => ({ ...ej, order: i })),
    );
  };

  const handleAddEjercicio = async (ejercicioId: string) => {
    const nuevo = buildEjercicioInicial(ejercicioId);
    const next = [...ejercicios, { ...nuevo, order: ejercicios.length }];
    await setEjerciciosEnRutina(
      rutinaId,
      next.map((e, i) => ({ ...e, order: i })),
    );
    setSelectOpen(false);
  };

  const handleChangeEjercicio = async (next: EjercicioEnRutina) => {
    const updated = ejercicios.map((e) => (e.id === next.id ? next : e));
    await setEjerciciosEnRutina(
      rutinaId,
      updated.map((e, i) => ({ ...e, order: i })),
    );
  };

  const handleDeleteEjercicio = async (id: string) => {
    if (!window.confirm("¿Eliminar este ejercicio de la rutina?")) return;
    const updated = ejercicios.filter((e) => e.id !== id);
    await setEjerciciosEnRutina(
      rutinaId,
      updated.map((e, i) => ({ ...e, order: i })),
    );
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
          {nombreDraft || rutina.nombre}
        </PageHeader>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <AppTextField
          label="NOMBRE"
          value={nombreDraft}
          onChange={(e) => setNombreDraft(e.target.value)}
          onBlur={() => {
            const v = nombreDraft.trim();
            if (v && v !== rutina.nombre) {
              void renombrarRutina(rutinaId, v);
            }
          }}
        />
        <AppTextField
          label="DESCRIPCIÓN"
          multiline
          minRows={2}
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => {
            if (descDraft !== (rutina.descripcion ?? "")) {
              void setRutinaDescripcion(rutinaId, descDraft);
            }
          }}
        />
      </Box>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext
          items={ejercicios.map((e) => e.id)}
          strategy={verticalListSortingStrategy}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {ejercicios.length === 0 ? (
              <Box
                sx={{
                  py: 4,
                  textAlign: "center",
                  border: "1px dashed",
                  borderColor: "divider",
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  [ SIN EJERCICIOS // AÑADE EL PRIMERO CON + ]
                </Typography>
              </Box>
            ) : (
              ejercicios.map((e) => (
                <EjercicioEnRutinaCard
                  key={e.id}
                  ejercicio={e}
                  catalog={catalogoLookup.get(e.ejercicioId)}
                  activeId={activeId}
                  onChange={(next) => {
                    void handleChangeEjercicio(next);
                  }}
                  onDelete={() => {
                    void handleDeleteEjercicio(e.id);
                  }}
                />
              ))
            )}
          </Box>
        </SortableContext>
      </DndContext>

      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          color="primary"
          disableElevation
          onClick={() => setSelectOpen(true)}
          sx={{ touchAction: "manipulation" }}
        >
          AÑADIR EJERCICIO
        </Button>
      </Box>

      <SelectEjercicioDialog
        open={selectOpen}
        onClose={() => setSelectOpen(false)}
        onPick={(id) => {
          void handleAddEjercicio(id);
        }}
      />
    </Box>
  );
}
