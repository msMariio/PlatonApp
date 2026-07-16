import { useMemo, useState } from "react";
import { Box, Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Carpeta, type Rutina } from "../../core/db";
import { PageHeader } from "../../components/PageHeader";
import {
  crearCarpeta,
  crearRutina,
  eliminarCarpeta,
  eliminarRutina,
  persistCarpetasOrder,
  persistRutinasMap,
  toggleCarpetaCollapsed,
  ROOT,
  type ContainerId,
} from "./data";
import { CarpetaCard } from "./components/CarpetaCard";
import { SortableRutinaRoot } from "./components/SortableRutinaRoot";
import { NuevaCarpetaDialog } from "./components/NuevaCarpetaDialog";
import { NuevaRutinaDialog } from "./components/NuevaRutinaDialog";
import { RutinaTile } from "./components/RutinaTile";
import { RutinaDetailView } from "./RutinaDetailView";
import { EmptyStateCard } from "../../components/EmptyStateCard";

/**
 * Contenedor del feature "Rutinas". Decide si mostrar la lista (DnD de
 * carpetas + rutinas) o el detalle de la rutina abierta.
 */
export function RutinasView() {
  const rutinas = useLiveQuery(() => db.rutinas.toArray(), []) ?? [];
  const [selectedRutinaId, setSelectedRutinaId] = useState<string | null>(null);

  // Si la rutina abierta desaparece (borrada desde fuera), salimos del detalle.
  const abierta = selectedRutinaId
    ? rutinas.find((r) => r.id === selectedRutinaId)
    : null;
  if (selectedRutinaId && !abierta) {
    setSelectedRutinaId(null);
  }
  if (selectedRutinaId && abierta) {
    return (
      <RutinaDetailView
        rutinaId={selectedRutinaId}
        onBack={() => setSelectedRutinaId(null)}
      />
    );
  }

  return (
    <RutinasListBody onOpenRutina={(id) => setSelectedRutinaId(id)} />
  );
}

type ListBodyProps = { onOpenRutina: (id: string) => void };

function RutinasListBody({ onOpenRutina }: ListBodyProps) {
  const carpetas = useLiveQuery(() => db.carpetas.toArray(), []) ?? [];
  const rutinas = useLiveQuery(() => db.rutinas.toArray(), []) ?? [];

  // Normaliza una vista consistente desde IndexedDB.
  const normalized = useMemo(() => {
    const carpetasOrd = [...carpetas].sort((a, b) => a.order - b.order);
    const grupos: Record<ContainerId, Rutina[]> = { [ROOT]: [] };
    carpetasOrd.forEach((c) => (grupos[c.id] = []));
    rutinas.forEach((r) => {
      const k = (r.carpetaId ?? ROOT) as ContainerId;
      if (!grupos[k]) grupos[k] = [];
      grupos[k].push(r);
    });
    for (const k of Object.keys(grupos)) {
      grupos[k].sort((a, b) => a.order - b.order);
    }
    return { carpetasOrd, grupos };
  }, [carpetas, rutinas]);

  // Draft durante el drag para que la UI reaccione entre contenedores.
  const [draft, setDraft] = useState<Record<ContainerId, Rutina[]> | null>(
    null
  );
  const visible = draft ?? normalized.grupos;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<
    "rutina" | "carpeta" | null
  >(null);
  const [nuevaCarpetaOpen, setNuevaCarpetaOpen] = useState(false);
  const [nuevaRutinaTarget, setNuevaRutinaTarget] =
    useState<ContainerId | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const findContainerForItem = (itemId: string): ContainerId | null => {
    if (carpetas.find((c) => c.id === itemId)) return ROOT;
    for (const k of Object.keys(visible) as ContainerId[]) {
      if (visible[k].find((r) => r.id === itemId)) return k;
    }
    return null;
  };

  /**
   * Resuelve el containerId destino a partir del "over":
   *  · carpeta física → su propio id (no usa el containerId declarado en data,
   *    porque las carpetas viven en ROOT aunque otra rutina pueda caer sobre ellas)
   *  · item con containerId en data → ese containerId
   *  · id "ROOT" → ROOT
   */
  const resolveOverContainer = (
    overDataType: string | undefined,
    overId: string | number,
    overContainerData: ContainerId | undefined
  ): ContainerId | null => {
    if (overDataType === "carpeta") return overId as ContainerId;
    if (overContainerData) return overContainerData;
    if (overId === ROOT) return ROOT;
    return null;
  };

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);
    const t = e.active.data.current?.type as string | undefined;
    setActiveKind(t === "carpeta" ? "carpeta" : "rutina");
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;
    const activeType = active.data.current?.type as string | undefined;
    if (activeType !== "rutina") return; // carpetas no cruzan

    const source = findContainerForItem(activeIdStr);
    const overType = over.data.current?.type as string | undefined;
    const overContainerData = over.data.current?.containerId as
      | ContainerId
      | undefined;
    const overContainer = resolveOverContainer(
      overType,
      over.id,
      overContainerData
    );

    if (!source || !overContainer || source === overContainer) return;

    setDraft((cur) => {
      const base = cur
        ? { ...cur }
        : {
            [ROOT]: [...(normalized.grupos[ROOT] ?? [])] as Rutina[],
            ...Object.fromEntries(
              carpetas.map((c) => [c.id, [...(normalized.grupos[c.id] ?? [])]])
            ),
          };
      const sourceList = [...(base[source] ?? [])];
      const targetList = [...(base[overContainer] ?? [])];
      const aIdx = sourceList.findIndex((r) => r.id === activeIdStr);
      if (aIdx === -1) return cur;
      const [moved] = sourceList.splice(aIdx, 1);
      const oIdx = targetList.findIndex((r) => r.id === overIdStr);
      const insertAt = oIdx >= 0 ? oIdx : targetList.length;
      targetList.splice(insertAt, 0, moved);
      base[source] = sourceList;
      base[overContainer] = targetList;
      return base;
    });
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    setActiveKind(null);
    if (!over) {
      setDraft(null);
      return;
    }
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) {
      setDraft(null);
      return;
    }
    const activeType = active.data.current?.type as string | undefined;
    const finalMap = draft ?? visible;

    // Carpeta: reorder dentro de ROOT
    if (activeType === "carpeta") {
      const oldIdx = normalized.carpetasOrd.findIndex(
        (c) => c.id === activeIdStr
      );
      const newIdx = normalized.carpetasOrd.findIndex(
        (c) => c.id === overIdStr
      );
      if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
        const reordered = arrayMove(normalized.carpetasOrd, oldIdx, newIdx);
        await persistCarpetasOrder(reordered);
      }
      setDraft(null);
      return;
    }

    // Rutina: resolver container destino
    const source = findContainerForItem(activeIdStr);
    const overType = over.data.current?.type as string | undefined;
    const overContainerData = over.data.current?.containerId as
      | ContainerId
      | undefined;
    const overContainer = resolveOverContainer(
      overType,
      over.id,
      overContainerData
    );
    if (!source || !overContainer) {
      setDraft(null);
      return;
    }
    if (source === overContainer) {
      const list = finalMap[source] ?? [];
      const oi = list.findIndex((r) => r.id === overIdStr);
      const ai = list.findIndex((r) => r.id === activeIdStr);
      if (oi >= 0 && ai >= 0 && oi !== ai) {
        const reordered = arrayMove(list, ai, oi);
        await persistRutinasMap({ ...finalMap, [source]: reordered });
      }
    } else {
      const carpetaId =
        overContainer === ROOT ? undefined : (overContainer as string);
      await persistRutinasMap({
        ...finalMap,
        [overContainer]: (finalMap[overContainer] ?? []).map((r) =>
          r.id === activeIdStr ? { ...r, carpetaId } : r
        ),
      });
    }
    setDraft(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setActiveKind(null);
    setDraft(null);
  };

  // Ghost en DragOverlay
  const ghostCarpeta = useMemo(() => {
    if (!activeId || activeKind !== "carpeta") return null;
    return carpetas.find((x) => x.id === activeId) ?? null;
  }, [activeId, activeKind, carpetas]);

  const ghostRutina = useMemo(() => {
    if (!activeId || activeKind !== "rutina") return null;
    return (
      visible[ROOT]?.find((x) => x.id === activeId) ??
      normalized.carpetasOrd
        .flatMap((c) => visible[c.id] ?? [])
        .find((x) => x.id === activeId) ??
      null
    );
  }, [activeId, activeKind, visible, normalized.carpetasOrd]);

  const rootRutinas = visible[ROOT] ?? [];

  // SortableContext raíz usa draft-visible para que dnd-kit refleje los
  // cruces de container en tiempo real.
  const rootSortableItems = [
    ...normalized.carpetasOrd.map((c) => c.id),
    ...rootRutinas.map((r) => r.id),
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1,
        }}
      >
        <PageHeader sx={{ flexGrow: 1, mr: "auto !important" }}>
          RUTINAS
        </PageHeader>
        <Button
          startIcon={<CreateNewFolderIcon />}
          variant="outlined"
          color="primary"
          onClick={() => setNuevaCarpetaOpen(true)}
          sx={{ touchAction: "manipulation" }}
        >
          CARPETA
        </Button>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          color="primary"
          disableElevation
          onClick={() => setNuevaRutinaTarget(ROOT)}
          sx={{ touchAction: "manipulation" }}
        >
          RUTINA
        </Button>
      </Box>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={rootSortableItems}
          strategy={verticalListSortingStrategy}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {normalized.carpetasOrd.map((carpeta) => (
              <CarpetaCard
                key={carpeta.id}
                carpeta={carpeta}
                rutinas={visible[carpeta.id] ?? []}
                activeId={activeId}
                onAddRutina={() => setNuevaRutinaTarget(carpeta.id)}
                onEliminarCarpeta={async () => {
                  const nombre = carpeta.nombre;
                  if (
                    window.confirm(
                      `¿Eliminar carpeta "${nombre}" y todas sus rutinas?`
                    )
                  ) {
                    await eliminarCarpeta(carpeta.id, true);
                  } else if (
                    window.confirm(
                      `¿Eliminar "${nombre}" pero mantener sus rutinas (irán a raíz)?`
                    )
                  ) {
                    await eliminarCarpeta(carpeta.id, false);
                  }
                }}
                onToggleCollapsed={() => toggleCarpetaCollapsed(carpeta.id)}
                onEliminarRutina={async (id) => {
                  if (window.confirm("¿Eliminar esta rutina?")) {
                    await eliminarRutina(id);
                  }
                }}
                onMoveUp={async () => {
                  const idx = normalized.carpetasOrd.findIndex(
                    (c) => c.id === carpeta.id
                  );
                  if (idx > 0) {
                    const reordered = arrayMove(
                      normalized.carpetasOrd,
                      idx,
                      idx - 1
                    );
                    await persistCarpetasOrder(reordered);
                  }
                }}
                onMoveDown={async () => {
                  const idx = normalized.carpetasOrd.findIndex(
                    (c) => c.id === carpeta.id
                  );
                  if (idx >= 0 && idx < normalized.carpetasOrd.length - 1) {
                    const reordered = arrayMove(
                      normalized.carpetasOrd,
                      idx,
                      idx + 1
                    );
                    await persistCarpetasOrder(reordered);
                  }
                }}
                onOpenRutina={onOpenRutina}
              />
            ))}

            {rootRutinas.length === 0 &&
            normalized.carpetasOrd.length === 0 ? (
              <EmptyStateCard height={140}>
                [ SIN RUTINAS // TOCA EL BOTÓN + PARA CREAR LA PRIMERA ]
              </EmptyStateCard>
            ) : (
              rootRutinas.map((r) => (
                <SortableRutinaRoot
                  key={r.id}
                  rutina={r}
                  activeId={activeId}
                  onEliminar={async () => {
                    if (window.confirm("¿Eliminar esta rutina?")) {
                      await eliminarRutina(r.id);
                    }
                  }}
                  onOpen={() => onOpenRutina(r.id)}
                />
              ))
            )}
          </Box>
        </SortableContext>

        <DragOverlay>
          {ghostCarpeta ? (
            <Box sx={{ opacity: 0.95 }}>
              <CarpetaGhost
                carpeta={ghostCarpeta}
                rutinas={visible[ghostCarpeta.id] ?? []}
              />
            </Box>
          ) : null}
          {ghostRutina ? (
            <Box sx={{ opacity: 0.95 }}>
              <RutinaTile rutina={ghostRutina} />
            </Box>
          ) : null}
        </DragOverlay>
      </DndContext>

      <NuevaCarpetaDialog
        open={nuevaCarpetaOpen}
        onClose={() => setNuevaCarpetaOpen(false)}
        onCreate={async (nombre) => {
          await crearCarpeta(nombre);
          setNuevaCarpetaOpen(false);
        }}
      />
      <NuevaRutinaDialog
        open={nuevaRutinaTarget !== null}
        onClose={() => setNuevaRutinaTarget(null)}
        onCreate={async (nombre) => {
          const target =
            nuevaRutinaTarget === ROOT
              ? undefined
              : nuevaRutinaTarget ?? undefined;
          await crearRutina(nombre, target);
          setNuevaRutinaTarget(null);
        }}
      />
    </Box>
  );
}

function CarpetaGhost({
  carpeta,
  rutinas,
}: {
  carpeta: Carpeta;
  rutinas: Rutina[];
}) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "primary.main",
        bgcolor: "background.paper",
        p: 1.5,
        opacity: 0.95,
      }}
    >
      <Box sx={{ fontWeight: "bold", letterSpacing: "0.05em" }}>
        {carpeta.nombre.toUpperCase()}
      </Box>
      <Box sx={{ color: "text.secondary", fontSize: 12 }}>
        {rutinas.length} RUTINA{rutinas.length === 1 ? "" : "S"}
      </Box>
    </Box>
  );
}
