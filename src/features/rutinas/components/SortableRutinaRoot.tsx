import { Box } from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Rutina } from "../../../core/db";
import { useStableNodeRef } from "../../../hooks/useStableNodeRef";
import { RutinaTile } from "./RutinaTile";
import { ROOT } from "../data";

type Props = {
  rutina: Rutina;
  activeId: string | null;
  onEliminar: () => void;
  onOpen: () => void;
};

export function SortableRutinaRoot({
  rutina,
  activeId,
  onEliminar,
  onOpen,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: rutina.id,
    data: { type: "rutina", containerId: ROOT },
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
            sx={{
              display: "flex",
              alignItems: "center",
              color: "text.secondary",
            }}
            aria-hidden
          >
            <DragIndicatorIcon fontSize="small" />
          </Box>
        }
      />
    </Box>
  );
}
