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
  useDroppable,
  type DragStartEvent,
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
  checkRutinaTieneLogs,
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
import { useStableNodeRef } from "../../hooks/useStableNodeRef";
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
  const todasLasRutinas = useLiveQuery(() => db.rutinas.toArray(), []) ?? [];
  // Excluir rutinas archivadas de la vista normal
  const rutinas = todasLasRutinas.filter((r) => !r.isArchived);

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

  // Los items NUNCA se mueven visualmente entre contenedores durante el
  // drag — solo el ghost de DragOverlay sigue al cursor. Esto evita
  // unmounts/remounts de componentes sortable con el mismo id de @dnd-kit
  // (que causaban corrupción de estado y pantallas en blanco).
  // Al hacer drop, handleDragEnd persiste directamente desde `grupos`.

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

  /**
   * Resuelve el containerId destino a partir del "over":
   *  · Prioriza `containerId` del data prop (rutinas dentro de carpetas,
   *    body de CarpetaCard vía `useDroppable`).
   *  · Header de CarpetaCard (useSortable sin containerId) → ROOT (para
   *    que el sort intra-root no se convierta accidentalmente en
   *    cross-container).
   *  · id "ROOT" → ROOT.
   */
  const resolveOverContainer = (
    overDataType: string | undefined,
    overId: string | number,
    overContainerData: ContainerId | undefined
  ): ContainerId | null => {
    if (overContainerData) return overContainerData;
    // El header de una carpeta (useSortable sin containerId) NO es un
    // destino de cross-container para rutinas. Si una rutina pasa sobre
    // el header de una carpeta durante un sort, queremos mantenerla en
    // ROOT (mismo contenedor) para que handleDragEnd aplique el reorder
    // intra-root. El cross-container hacia la carpeta se hace vía el
    // droppable del body (que SÍ tiene containerId).
    if (overDataType === "carpeta") return ROOT;
    if (overId === ROOT) return ROOT;
    return null;
  };

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);
    const t = e.active.data.current?.type as string | undefined;
    setActiveKind(t === "carpeta" ? "carpeta" : "rutina");
  };

  // No hay handleDragOver: los items no se mueven visualmente entre
  // contenedores durante el drag. Solo el ghost de DragOverlay sigue
  // al cursor. handleDragEnd persiste los cambios al hacer drop.

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    setActiveKind(null);
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const activeType = active.data.current?.type as string | undefined;

    // Carpeta: reorder dentro de ROOT
    if (activeType === "carpeta") {
      const oldIdx = carpetasOrd.findIndex((c) => c.id === activeIdStr);
      const newIdx = carpetasOrd.findIndex((c) => c.id === overIdStr);
      if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
        await persistCarpetasOrder(arrayMove(carpetasOrd, oldIdx, newIdx));
      }
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
    if (!overContainer) return;

    // Contenedor originario del item activo (siempre desde grupos reales).
    const originalContainer = (Object.keys(grupos) as ContainerId[]).find((k) =>
      (grupos[k] ?? []).some((r) => r.id === activeIdStr)
    );
    if (!originalContainer) return;

    if (originalContainer === overContainer) {
      // Reorder intra-contenedor (intra-carpeta o intra-root).
      const list = grupos[overContainer] ?? [];
      const oi = list.findIndex((r) => r.id === overIdStr);
      const ai = list.findIndex((r) => r.id === activeIdStr);
      if (oi >= 0 && ai >= 0 && oi !== ai) {
        await persistRutinasMap({
          ...grupos,
          [overContainer]: arrayMove(list, ai, oi),
        });
      }
      return;
    }

    // CROSS-CONTAINER: mover item de originalContainer a overContainer.
    const carpetaId =
      overContainer === ROOT ? undefined : (overContainer as string);
    const targetList = grupos[overContainer] ?? [];
    const originalItem = (grupos[originalContainer] ?? []).find(
      (r) => r.id === activeIdStr
    );
    if (!originalItem) return;

    // Insertar en la posición correcta dentro del contenedor destino.
    // Si el drop fue sobre el header de una carpeta (overType === "carpeta"),
    // no hay una rutina de referencia en targetList. Insertamos al principio
    // de ROOT para que la rutina sea visible. Tradeoff: si el usuario suelta
    // sobre el header de la misma carpeta de origen, la rutina también va a
    // ROOT en vez de quedarse en la carpeta.
    const oIdx = targetList.findIndex((r) => r.id === overIdStr);
    const insertAt =
      overType === "carpeta"
        ? 0
        : oIdx >= 0
          ? oIdx + 1
          : targetList.length;
    const newTargetList = [
      ...targetList.slice(0, insertAt),
      { ...originalItem, carpetaId },
      ...targetList.slice(insertAt),
    ];

    const mapToPersist: Record<ContainerId, Rutina[]> = {};
    for (const k of Object.keys(grupos) as ContainerId[]) {
      if (k === overContainer) {
        mapToPersist[k] = newTargetList;
      } else {
        mapToPersist[k] = (grupos[k] ?? []).filter(
          (r) => r.id !== activeIdStr
        );
      }
    }
    await persistRutinasMap(mapToPersist);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setActiveKind(null);
  };

  // Ghost en DragOverlay (React Compiler memoiza automáticamente)
  const ghostCarpeta =
    !activeId || activeKind !== "carpeta"
      ? null
      : carpetas.find((x) => x.id === activeId) ?? null;

  const ghostRutina =
    !activeId || activeKind !== "rutina"
      ? null
      : (grupos[ROOT]?.find((x) => x.id === activeId) ??
        carpetasOrd
          .flatMap((c) => grupos[c.id] ?? [])
          .find((x) => x.id === activeId) ??
        null);

  const rootRutinas = grupos[ROOT] ?? [];

  // Droppable sobre el area ROOT. Permite soltar una rutina desde una
  // carpeta directamente en la raiz sin necesidad de apuntar a otra rutina.
  const { setNodeRef: setRootDropRef } = useDroppable({
    id: ROOT,
    data: { type: "root" },
  });
  const safeRootDropRef = useStableNodeRef(setRootDropRef, ROOT);

  // SortableContext raiz incluye solo carpetas + rutinas en root. Las rutinas
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
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={rootSortableItems}
          strategy={verticalListSortingStrategy}
        >
          <Box
            ref={safeRootDropRef}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              pb: activeId ? 4 : 0,
            }}
          >
            {carpetasOrd.map((carpeta) => (
              <CarpetaCard
                key={carpeta.id}
                carpeta={carpeta}
                rutinas={grupos[carpeta.id] ?? []}
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
                  const enUso = await checkRutinaTieneLogs(id);
                  const mensaje = enUso
                    ? "Esta rutina tiene entrenamientos registrados. No se puede eliminar físicamente.\n\nSe archivará para ocultarla de la lista sin perder tu historial. ¿Continuar?"
                    : "¿Eliminar esta rutina permanentemente?\n\nEsta acción no se puede deshacer.";
                  if (!window.confirm(mensaje)) return;
                  await eliminarRutina(id);
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
              <Box
                sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
              >
                <EmptyStateCard height={140}>
                  [ SIN RUTINAS // TOCA EL BOTÓN + PARA CREAR LA PRIMERA ]
                </EmptyStateCard>
              </Box>
            ) : (
              <Box
                sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
              >
                {rootRutinas.map((r) => (
                  <SortableRutinaRoot
                    key={r.id}
                    rutina={r}
                    activeId={activeId}
                    onEliminar={async () => {
                      const enUso = await checkRutinaTieneLogs(r.id);
                      const mensaje = enUso
                        ? "Esta rutina tiene entrenamientos registrados. No se puede eliminar físicamente.\n\nSe archivará para ocultarla de la lista sin perder tu historial. ¿Continuar?"
                        : "¿Eliminar esta rutina permanentemente?\n\nEsta acción no se puede deshacer.";
                      if (!window.confirm(mensaje)) return;
                      await eliminarRutina(r.id);
                    }}
                    onOpen={() => onOpenRutina(r.id)}
                  />
                ))}
              </Box>
            )}
          </Box>
        </SortableContext>

        <DragOverlay>
          {ghostCarpeta ? (
            <Box sx={{ opacity: 0.95 }}>
              <CarpetaGhost
                carpeta={ghostCarpeta}
                rutinas={grupos[ghostCarpeta.id] ?? []}
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
