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
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Carpeta, Rutina } from "../../../core/db";
import { useStableNodeRef } from "../../../hooks/useStableNodeRef";
import { RutinaTile } from "./RutinaTile";

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
 * Helper: stopPropagation en pointerdown y click. Evita que el botón
 * dispare el drag del wrapper ni el onClick del wrapper Sortable al
 * pulsar IconButtons internos.
 */
const stopAll = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * Carpeta visual + lista interna droppable.
 * El header entero es arrastrable (drag handle con listeners).
 */
export function CarpetaCard({
  carpeta,
  rutinas,
  onAddRutina,
  onEliminarCarpeta,
  onToggleCollapsed,
  onEliminarRutina,
  onMoveUp,
  onMoveDown,
  onOpenRutina,
  activeId,
}: Props) {
  const isCollapsed = !!carpeta.collapsed;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: carpeta.id,
    data: { type: "carpeta" },
  });
  const safeSetNodeRef = useStableNodeRef(setNodeRef);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "manipulation",
    border: 1,
    borderColor: "primary.main",
    bgcolor: "background.paper",
  } as const;

  return (
    <Card ref={safeSetNodeRef} sx={style}>
      <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
        <Box
          {...attributes}
          {...listeners}
          sx={{
            display: "flex",
            alignItems: "center",
            p: 1.5,
            gap: 1,
            borderBottom: isCollapsed ? 0 : 1,
            borderColor: "divider",
            cursor: "grab",
            touchAction: "none",
            "&:active": { cursor: "grabbing" },
          }}
          aria-label="Arrastrar carpeta"
        >
          <DragIndicatorIcon fontSize="small" />
          <IconButton
            size="small"
            onClick={(e) => {
              stopAll(e);
              onToggleCollapsed();
            }}
            onPointerDown={stopAll}
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
          <IconButton
            size="small"
            onClick={(e) => {
              stopAll(e);
              onMoveUp();
            }}
            onPointerDown={stopAll}
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
            onClick={(e) => {
              stopAll(e);
              onMoveDown();
            }}
            onPointerDown={stopAll}
            sx={{
              color: "text.secondary",
              "&:hover": { color: "primary.main" },
              borderRadius: 0,
              touchAction: "manipulation",
            }}
            aria-label="Mover carpeta abajo"
          >
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => {
              stopAll(e);
              onEliminarCarpeta();
            }}
            onPointerDown={stopAll}
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
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 1.5 }}>
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
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <IconButton
                size="small"
                onClick={(e) => {
                  stopAll(e);
                  onAddRutina();
                }}
                onPointerDown={stopAll}
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
    touchAction: "none",
    cursor: "grab",
    "&:active": { cursor: "grabbing" },
  } as const;

  return (
    <Box
      ref={safeSetNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      sx={style}
    >
      <RutinaTile
        rutina={rutina}
        onEliminar={onEliminar}
        leftAdornment={
          <Box
            sx={{ display: "flex", alignItems: "center", color: "text.secondary" }}
            aria-hidden
          >
            <DragIndicatorIcon fontSize="small" />
          </Box>
        }
      />
    </Box>
  );
}
