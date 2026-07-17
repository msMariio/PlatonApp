import { useState } from "react";
import { Box, Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import ListAltIcon from "@mui/icons-material/ListAlt";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
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
import { EjerciciosMaestrosView } from "./EjerciciosMaestrosView";
import { EjercicioAnalyticsView } from "../analytics/EjercicioAnalyticsView";
import { EmptyStateCard } from "../../components/EmptyStateCard";

type RutinasViewState =
  | { view: "list" }
  | { view: "rutina"; id: string }
  | { view: "ejercicios" }
  | {
      view: "analytics";
      ejercicioId: string;
      backTo?: "list" | "rutina";
      rutinaId?: string;
    };

/**
 * Contenedor del feature "Rutinas". Decide si mostrar la lista (DnD de
 * carpetas + rutinas), el detalle de la rutina abierta, el listado de
 * ejercicios maestros o las analytics de un ejercicio.
 */
export function RutinasView() {
  const rutinas = useLiveQuery(() => db.rutinas.toArray(), []) ?? [];
  const [state, setState] = useState<RutinasViewState>({ view: "list" });

  // Si la rutina abierta desaparece (borrada desde fuera), salimos del detalle.
  if (state.view === "rutina") {
    const abierta = rutinas.find((r) => r.id === state.id);
    if (!abierta) {
      setState({ view: "list" });
    }
  }

  if (state.view === "analytics") {
    return (
      <EjercicioAnalyticsView
        ejercicioId={state.ejercicioId}
        onBack={() =>
          setState(
            state.backTo === "rutina" && state.rutinaId
              ? { view: "rutina", id: state.rutinaId }
              : { view: "list" }
          )
        }
      />
    );
  }

  if (state.view === "rutina") {
    return (
      <RutinaDetailView
        rutinaId={state.id}
        onBack={() => setState({ view: "list" })}
        onOpenAnalytics={(ejercicioId) =>
          setState({
            view: "analytics",
            ejercicioId,
            backTo: "rutina",
            rutinaId: state.id,
          })
        }
      />
    );
  }

  if (state.view === "ejercicios") {
    return (
      <EjerciciosMaestrosView
        onBack={() => setState({ view: "list" })}
        onOpenAnalytics={(ejercicioId) =>
          setState({ view: "analytics", ejercicioId, backTo: "list" })
        }
      />
    );
  }

  return (
    <RutinasListBody
      onOpenRutina={(id) => setState({ view: "rutina", id })}
      onOpenEjercicios={() => setState({ view: "ejercicios" })}
    />
  );
}

type ListBodyProps = {
  onOpenRutina: (id: string) => void;
  onOpenEjercicios: () => void;
};

function RutinasListBody({
  onOpenRutina,
  onOpenEjercicios,
}: ListBodyProps) {
  const carpetas = useLiveQuery(() => db.carpetas.toArray(), []) ?? [];
  const rutinas = useLiveQuery(() => db.rutinas.toArray(), []) ?? [];

  // Normaliza una vista consistente desde IndexedDB. El React Compiler
  // memoiza automáticamente; no necesitamos useMemo aquí.
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

  // Draft durante el drag para que la UI reaccione entre contenedores.
  const [draft, setDraft] = useState<Record<ContainerId, Rutina[]> | null>(
    null
  );
  const visible = draft ?? grupos;

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
   *  · Prioriza `containerId` del data prop (rutinas dentro de carpetas,
   *    body de CarpetaCard vía `useDroppable`). Evita que "carpeta-body-{id}"
   *    termine como ContainerId.
   *  · Header de CarpetaCard (useSortable sin containerId) → su propio id.
   *  · id "ROOT" → ROOT.
   */
  const resolveOverContainer = (
    overDataType: string | undefined,
    overId: string | number,
    overContainerData: ContainerId | undefined
  ): ContainerId | null => {
    if (overContainerData) return overContainerData;
    if (overDataType === "carpeta") return overId as ContainerId;
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
            [ROOT]: [...(grupos[ROOT] ?? [])] as Rutina[],
            ...Object.fromEntries(
              carpetas.map((c) => [c.id, [...(grupos[c.id] ?? [])]])
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
    const activeType = active.data.current?.type as string | undefined;
    const finalMap = draft ?? grupos;

    // Carpeta: reorder dentro de ROOT
    if (activeType === "carpeta") {
      const oldIdx = carpetasOrd.findIndex((c) => c.id === activeIdStr);
      const newIdx = carpetasOrd.findIndex((c) => c.id === overIdStr);
      if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
        await persistCarpetasOrder(arrayMove(carpetasOrd, oldIdx, newIdx));
      }
      setDraft(null);
      return;
    }

    const overType = over.data.current?.type as string | undefined;
    const overContainerData = over.data.current?.containerId as
      | ContainerId
      | undefined;
    const overContainer = resolveOverContainer(
      overType,
      over.id,
      overContainerData
    );
    if (!overContainer) {
      setDraft(null);
      return;
    }

    // CRÍTICO: el contenedor ORIGINARIO (pre-draft) del item activo, no el
    // de visible. Si lo buscásemos en visible, después de que draft movió el
    // item a la carpeta destino detectaríamos source == overContainer y el
    // branch same-container fallaría (oi = findIndex sobre el id de carpeta
    // → -1) sin persistir nada. Esto era el bug del drop en carpeta vacía.
    const originalContainer = (Object.keys(grupos) as ContainerId[]).find((k) =>
      (grupos[k] ?? []).some((r) => r.id === activeIdStr)
    );
    if (!originalContainer) {
      setDraft(null);
      return;
    }

    if (originalContainer === overContainer) {
      // Reorder intra-contenedor (intra-carpeta o intra-root). El caso
      // active === over ya cae en oi === ai ⇒ no se persiste y el
      // setDraft(null) del final limpia el estado.
      const list = finalMap[overContainer] ?? [];
      const oi = list.findIndex((r) => r.id === overIdStr);
      const ai = list.findIndex((r) => r.id === activeIdStr);
      if (oi >= 0 && ai >= 0 && oi !== ai) {
        await persistRutinasMap({
          ...finalMap,
          [overContainer]: arrayMove(list, ai, oi),
        });
      }
      setDraft(null);
      return;
    }

    // CROSS-CONTAINER: insertar el item activo en overContainer y quitarlo
    // del resto del mapa. Persistimos el mapa completo (con restantes sin el
    // item), sin importar si draft lo había movido o no.
    const carpetaId =
      overContainer === ROOT ? undefined : (overContainer as string);
    const targetList = finalMap[overContainer] ?? [];
    const originalItem = (grupos[originalContainer] ?? []).find(
      (r) => r.id === activeIdStr
    );
    if (!originalItem) {
      setDraft(null);
      return;
    }

    let newTargetList: Rutina[];
    if (targetList.some((r) => r.id === activeIdStr)) {
      // handleDragOver ya puso el item en target; sólo actualizamos carpetaId.
      newTargetList = targetList.map((r) =>
        r.id === activeIdStr ? { ...r, carpetaId } : r
      );
    } else {
      const oIdx = targetList.findIndex((r) => r.id === overIdStr);
      const insertAt = oIdx >= 0 ? oIdx + 1 : targetList.length;
      newTargetList = [
        ...targetList.slice(0, insertAt),
        { ...originalItem, carpetaId },
        ...targetList.slice(insertAt),
      ];
    }

    const mapToPersist: Record<ContainerId, Rutina[]> = {};
    for (const k of Object.keys(finalMap) as ContainerId[]) {
      if (k === overContainer) {
        mapToPersist[k] = newTargetList;
      } else {
        mapToPersist[k] = (finalMap[k] ?? []).filter(
          (r) => r.id !== activeIdStr
        );
      }
    }
    await persistRutinasMap(mapToPersist);
    setDraft(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setActiveKind(null);
    setDraft(null);
  };

  // Ghost en DragOverlay (React Compiler memoiza automáticamente)
  const ghostCarpeta =
    !activeId || activeKind !== "carpeta"
      ? null
      : carpetas.find((x) => x.id === activeId) ?? null;

  const ghostRutina =
    !activeId || activeKind !== "rutina"
      ? null
      : (visible[ROOT]?.find((x) => x.id === activeId) ??
        carpetasOrd
          .flatMap((c) => visible[c.id] ?? [])
          .find((x) => x.id === activeId) ??
        null);

  const rootRutinas = visible[ROOT] ?? [];

  // SortableContext raíz incluye sólo carpetas + rutinas en root. Las rutinas
  // dentro de carpetas viven en el SortableContext anidado de cada CarpetaCard.
  const rootSortableItems = [
    ...carpetasOrd.map((c) => c.id),
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
          startIcon={<ListAltIcon />}
          variant="outlined"
          color="primary"
          onClick={onOpenEjercicios}
          sx={{ touchAction: "manipulation" }}
        >
          EJERCICIOS
        </Button>
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
        collisionDetection={closestCorners}
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
            {carpetasOrd.map((carpeta) => (
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
                  const idx = carpetasOrd.findIndex((c) => c.id === carpeta.id);
                  if (idx > 0) {
                    await persistCarpetasOrder(
                      arrayMove(carpetasOrd, idx, idx - 1)
                    );
                  }
                }}
                onMoveDown={async () => {
                  const idx = carpetasOrd.findIndex((c) => c.id === carpeta.id);
                  if (idx >= 0 && idx < carpetasOrd.length - 1) {
                    await persistCarpetasOrder(
                      arrayMove(carpetasOrd, idx, idx + 1)
                    );
                  }
                }}
                onOpenRutina={onOpenRutina}
              />
            ))}

            {rootRutinas.length === 0 && carpetasOrd.length === 0 ? (
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
