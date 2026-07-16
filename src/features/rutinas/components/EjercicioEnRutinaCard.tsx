import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Ejercicio, EjercicioEnRutina, Serie } from "../../../core/db";
import { useStableNodeRef } from "../../../hooks/useStableNodeRef";
import InputNumber from "../../../components/InputNumber";

type Props = {
  ejercicio: EjercicioEnRutina;
  catalog: Ejercicio | undefined;
  activeId: string | null;
  onChange: (next: EjercicioEnRutina) => void;
  onDelete: () => void;
};

const stopAll = (e: React.SyntheticEvent) => e.stopPropagation();

export function EjercicioEnRutinaCard({
  ejercicio,
  catalog,
  activeId,
  onChange,
  onDelete,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: ejercicio.id,
    data: { type: "ejercicio" },
  });
  const safeSetNodeRef = useStableNodeRef(setNodeRef);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: activeId === ejercicio.id || isDragging ? 0.4 : 1,
    touchAction: "none",
    cursor: "grab",
    "&:active": { cursor: "grabbing" },
  } as const;

  const handleSerieChange = (idx: number, patch: Partial<Serie>) => {
    const nuevas = ejercicio.series.map((s, i) =>
      i === idx ? { ...s, ...patch } : s
    );
    onChange({ ...ejercicio, series: nuevas });
  };

  const handleAddSerie = () => {
    const ult = ejercicio.series[ejercicio.series.length - 1];
    const nueva: Serie = ult ? { ...ult } : { repsObjetivo: 8 };
    onChange({
      ...ejercicio,
      series: [...ejercicio.series, nueva],
    });
  };

  const handleRemoveSerie = (idx: number) => {
    onChange({
      ...ejercicio,
      series: ejercicio.series.filter((_, i) => i !== idx),
    });
  };

  return (
    <Card
      ref={safeSetNodeRef}
      {...attributes}
      {...listeners}
      sx={style}
    >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 1,
          }}
        >
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
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography
              variant="body1"
              sx={{
                fontWeight: "bold",
                textOverflow: "ellipsis",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {catalog?.nombre ?? "[ EJERCICIO SIN NOMBRE ]"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {catalog?.grupoMuscular.toUpperCase()}
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={(e) => {
              stopAll(e);
              onDelete();
            }}
            onPointerDown={stopAll}
            sx={{
              color: "text.secondary",
              "&:hover": { color: "error.main" },
              borderRadius: 0,
              touchAction: "manipulation",
            }}
            aria-label="Eliminar ejercicio de la rutina"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {ejercicio.series.map((s, idx) => (
            <Box
              key={idx}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1,
                border: 1,
                borderColor: "divider",
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ minWidth: 28 }}
              >
                S{idx + 1}
              </Typography>
              <InputNumber
                size="small"
                label="REPS"
                min={0}
                step={1}
                value={s.repsObjetivo ?? 0}
                onValueChange={(v) =>
                  handleSerieChange(idx, { repsObjetivo: v ?? 0 })
                }
                sx={{ flex: 1 }}
              />
              <InputNumber
                size="small"
                label="PESO"
                min={0}
                step={0.5}
                value={s.pesoObjetivo ?? 0}
                onValueChange={(v) =>
                  handleSerieChange(idx, { pesoObjetivo: v ?? 0 })
                }
                sx={{ flex: 1 }}
              />
              <InputNumber
                size="small"
                label="RPE"
                min={0}
                max={10}
                step={0.5}
                value={s.rpeObjetivo ?? 0}
                onValueChange={(v) =>
                  handleSerieChange(idx, { rpeObjetivo: v ?? 0 })
                }
                sx={{ flex: 1 }}
              />
              <IconButton
                size="small"
                onClick={(e) => {
                  stopAll(e);
                  handleRemoveSerie(idx);
                }}
                onPointerDown={stopAll}
                sx={{
                  color: "text.secondary",
                  "&:hover": { color: "error.main" },
                  borderRadius: 0,
                  touchAction: "manipulation",
                }}
                aria-label={`Eliminar serie ${idx + 1}`}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <IconButton
              size="small"
              onClick={(e) => {
                stopAll(e);
                handleAddSerie();
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
              aria-label="Añadir serie"
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {catalog?.descripcion && (
          <Box
            sx={{
              mt: 1,
              p: 1,
              border: "1px solid",
              borderColor: "divider",
              color: "text.secondary",
              fontSize: 13,
              whiteSpace: "pre-wrap",
            }}
          >
            {catalog.descripcion}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
