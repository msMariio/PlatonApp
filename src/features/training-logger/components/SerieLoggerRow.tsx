import { Box, IconButton, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import InputNumber from "../../../components/InputNumber";
import type { SerieReal } from "../../../core/db";

type Props = {
  index: number;
  serie: SerieReal;
  placeholder: { peso: number; reps: number };
  onChange: (next: SerieReal) => void;
};

export function SerieLoggerRow({ index, serie, placeholder, onChange }: Props) {
  const handleCheck = () => {
    const nextCompletado = !serie.completado;
    if (!nextCompletado) {
      onChange({ ...serie, completado: false });
      return;
    }
    // Auto-fill from placeholder if empty
    const next: SerieReal = { ...serie, completado: true };
    if (!next.peso) next.peso = placeholder.peso;
    if (!next.reps) next.reps = placeholder.reps;
    onChange(next);
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        p: 1.5,
        border: 1,
        borderColor: serie.completado ? "primary.main" : "divider",
        bgcolor: serie.completado ? "action.selected" : "background.paper",
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ minWidth: 28 }}
      >
        S{index + 1}
      </Typography>
      <InputNumber
        size="small"
        label="PESO"
        min={0}
        step={0.5}
        value={serie.peso || undefined}
        placeholder={placeholder.peso > 0 ? String(placeholder.peso) : undefined}
        onValueChange={(v) => onChange({ ...serie, peso: v ?? 0 })}
        sx={{ flex: 1 }}
      />
      <InputNumber
        size="small"
        label="REPS"
        min={0}
        step={1}
        value={serie.reps || undefined}
        placeholder={placeholder.reps > 0 ? String(placeholder.reps) : undefined}
        onValueChange={(v) => onChange({ ...serie, reps: v ?? 0 })}
        sx={{ flex: 1 }}
      />
      <IconButton
        size="small"
        onClick={handleCheck}
        sx={{
          borderRadius: 0,
          border: 1,
          borderColor: serie.completado ? "primary.main" : "divider",
          color: serie.completado ? "primary.main" : "text.secondary",
          bgcolor: serie.completado ? "primary.main" : "transparent",
          "&:hover": {
            borderColor: "primary.main",
          },
          touchAction: "manipulation",
        }}
        aria-label={serie.completado ? "Desmarcar serie" : "Completar serie"}
      >
        <CheckIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
