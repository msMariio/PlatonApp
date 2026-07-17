import {
  Box,
  Card,
  CardContent,
  IconButton,
  Typography,
  Collapse,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import AddIcon from "@mui/icons-material/Add";
// import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
// import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { useSortable } from "@dnd-kit/sortable";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Carpeta, Rutina } from "../../../core/db";
import { useStableNodeRef } from "../../../hooks/useStableNodeRef";
import { RutinaTile } from "./RutinaTile";
import { DragHandle } from "../../../components/DragHandle";

type Props = {
  carpeta: Carpeta;
  rutinas: Rutina[];
  onAddRutina: () => void;
  onEliminarCarpeta: () => void;
  onToggleCollapsed: () => void;
  onEliminarRutina: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOpenRutina: (id: string) => void;
  activeId: string | null;
};

/**
 * Carpeta visual + lista interna sortable.
 *
 * · El header es draggable SOLO desde el `DragHandle` (icono), siguiendo el
 *   patrón "Drag Handle" de dnd-kit.
 * · El body (visible cuando la carpeta está expandida) tiene un `useDroppable`
 *   adicional para que la carpeta siga siendo drop target cuando está VACÍA
 *   (sin sortable items). Su `data.containerId` permite que
 *   `resolveOverContainer` en RutinasView mapee este id a la carpeta.
 * · Las rutinas dentro de la carpeta viven en un `SortableContext` anidado,
 *   independiente del root, para que el sorting intra-carpeta funcione
 *   consistentemente.
 */
export function CarpetaCard({
  carpeta,
  rutinas,
  onAddRutina,
  onEliminarCarpeta,
  onToggleCollapsed,
  onEliminarRutina,
  // onMoveUp,
  // onMoveDown,
  onOpenRutina,
  activeId,
}: Props) {
  const isCollapsed = !!carpeta.collapsed;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: carpeta.id,
    data: { type: "carpeta" },
  });
  const safeSetNodeRef = useStableNodeRef(setNodeRef);

  const { setNodeRef: setBodyDropRef } = useDroppable({
    id: `carpeta-body-${carpeta.id}`,
    data: { type: "carpeta", containerId: carpeta.id },
    disabled: isCollapsed,
  });
  // Igual que para useSortable: bajo React 19 + StrictMode, el ref callback
  // recibe null en el cleanup y dnd-kit des-registra el droppable,
  // haciendo la carpeta invisible como drop target (incluida la carpeta
  // vacía). useStableNodeRef ignora el null y siempre registra.
  const safeBodyDropRef = useStableNodeRef(setBodyDropRef);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    border: 1,
    borderColor: "primary.main",
    bgcolor: "background.paper",
  } as const;

  return (
    <Card ref={safeSetNodeRef} sx={style}>
      <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            p: 1.5,
            gap: 1,
            borderBottom: isCollapsed ? 0 : 1,
            borderColor: "divider",
          }}
        >
          <DragHandle
            setActivatorNodeRef={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
            label={`Arrastrar carpeta ${carpeta.nombre}`}
          >
            <DragIndicatorIcon fontSize="small" />
          </DragHandle>
          <IconButton
            size="small"
            onClick={onToggleCollapsed}
            sx={{ borderRadius: 0, color: "primary.main" }}
            aria-label={isCollapsed ? "Expandir" : "Colapsar"}
          >
            {isCollapsed ? (
              <KeyboardArrowRightIcon fontSize="small" />
            ) : (
              <KeyboardArrowDownIcon fontSize="small" />
            )}
          </IconButton>
          <Box
            sx={{
              color: "primary.main",
              display: "flex",
              alignItems: "center",
            }}
          >
            {isCollapsed ? (
              <FolderIcon fontSize="small" />
            ) : (
              <FolderOpenIcon fontSize="small" />
            )}
          </Box>
          <Typography
            variant="body2"
            sx={{
              fontWeight: "bold",
              letterSpacing: "0.05em",
              flexGrow: 1,
              minWidth: 0,
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {carpeta.nombre.toUpperCase()}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ flexShrink: 0 }}
          >
            {rutinas.length}
          </Typography>
          {/* <IconButton
            size="small"
            onClick={onMoveUp}
            sx={{
              color: "text.secondary",
              "&:hover": { color: "primary.main" },
              borderRadius: 0,
              touchAction: "manipulation",
            }}
            aria-label="Mover carpeta arriba"
          >
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={onMoveDown}
            sx={{
              color: "text.secondary",
              "&:hover": { color: "primary.main" },
              borderRadius: 0,
              touchAction: "manipulation",
            }}
            aria-label="Mover carpeta abajo"
          >
            <ArrowDownwardIcon fontSize="small" />
          </IconButton> */}
          <IconButton
            size="small"
            onClick={onEliminarCarpeta}
            sx={{
              color: "text.secondary",
              "&:hover": { color: "error.main" },
              borderRadius: 0,
              touchAction: "manipulation",
            }}
            aria-label="Eliminar carpeta"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>

        <Collapse in={!isCollapsed}>
          <Box
            ref={safeBodyDropRef}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              p: 1.5,
            }}
          >
            {/*
             * SortableContext SIEMPRE montado (incluso con carpeta vacía).
             * Si lo renderizáramos condicionalmente, al arrastrar una rutina
             * sobre una carpeta vacía el placeholder desmontaría y el
             * SortableContext montaría a mitad del drag, lo que rompe
             * el tracking de @dnd-kit y deja over=null en handleDragEnd.
             */}
            <SortableContext
              items={rutinas.map((r) => r.id)}
              strategy={verticalListSortingStrategy}
            >
              {rutinas.length === 0 ? (
                <Box
                  sx={{
                    py: 2,
                    border: "1px dashed",
                    borderColor: "divider",
                    textAlign: "center",
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    [ VACÍA // SUELTA UNA RUTINA AQUÍ ]
                  </Typography>
                </Box>
              ) : (
                rutinas.map((r) => (
                  <SortableRutinaInter
                    key={r.id}
                    rutina={r}
                    containerId={carpeta.id}
                    activeId={activeId}
                    onEliminar={() => onEliminarRutina(r.id)}
                    onOpen={() => onOpenRutina(r.id)}
                  />
                ))
              )}
            </SortableContext>
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <IconButton
                size="small"
                onClick={onAddRutina}
                sx={{
                  borderRadius: 0,
                  border: 1,
                  borderColor: "divider",
                  color: "primary.main",
                  "&:hover": {
                    borderColor: "primary.main",
                    bgcolor: "transparent",
                  },
                  touchAction: "manipulation",
                }}
                aria-label="Añadir rutina en esta carpeta"
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

function SortableRutinaInter({
  rutina,
  containerId,
  activeId,
  onEliminar,
  onOpen,
}: {
  rutina: Rutina;
  containerId: string;
  activeId: string | null;
  onEliminar: () => void;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: rutina.id,
    data: { type: "rutina", containerId },
  });
  const safeSetNodeRef = useStableNodeRef(setNodeRef);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: activeId === rutina.id || isDragging ? 0.4 : 1,
  } as const;

  return (
    <Box ref={safeSetNodeRef} onClick={onOpen} sx={style}>
      <RutinaTile
        rutina={rutina}
        onEliminar={onEliminar}
        leftAdornment={
          <DragHandle
            setActivatorNodeRef={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
            label={`Arrastrar rutina ${rutina.nombre}`}
          >
            <DragIndicatorIcon fontSize="small" />
          </DragHandle>
        }
      />
    </Box>
  );
}
