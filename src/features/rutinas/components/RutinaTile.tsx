import { Box, IconButton, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import type { Rutina } from "../../../core/db";

type Props = {
  rutina: Rutina;
  onEliminar?: () => void;
  /** No se usa en sortable context — el wrapper Sortable ya maneja el click. */
  onOpen?: () => void;
  leftAdornment?: React.ReactNode;
};

/**
 * Tile puramente visual de una rutina.
 * En sortable context, el click y el teclado los maneja el wrapper
 * (que es el que recibe los listeners de @dnd-kit). Aquí NO interceptamos
 * Space/Enter para no competir con dnd-kit KeyboardSensor.
 */
export function RutinaTile({ rutina, onEliminar, leftAdornment }: Props) {
  const numEjercicios = rutina.ejercicios.length;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        p: 2,
        gap: 1.5,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      {leftAdornment}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "primary.main",
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
          }}
        >
          {rutina.nombre}
        </Typography>
        {rutina.descripcion && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {rutina.descripcion}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          {numEjercicios} EJERCICIO{numEjercicios === 1 ? "" : "S"}
        </Typography>
      </Box>
      {onEliminar && (
        <IconButton
          size="small"
          onClick={(e) => {
            // CRÍTICO: stopPropagation evita que el click burbujee al
            // wrapper Sortable (que tiene onClick={onOpen}). Sin esto,
            // borrar la rutina también abre el detalle.
            e.stopPropagation();
            onEliminar();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          sx={{
            color: "text.secondary",
            "&:hover": { color: "error.main" },
            borderRadius: 0,
            touchAction: "manipulation",
          }}
          aria-label="Eliminar rutina"
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}
