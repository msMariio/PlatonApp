import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
} from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import type { RecordPersonal, TipoRecordPersonal } from "../data";

type Props = {
  open: boolean;
  records: RecordPersonal[];
  nombresEjercicios: Map<string, string>;
  onClose: () => void;
};

const LABELS: Record<TipoRecordPersonal, string> = {
  peso: "NUEVO MÁXIMO DE PESO",
  e1rm: "NUEVO e1RM",
  repeticiones: "MÁS REPETICIONES CON LA MISMA CARGA",
  volumen: "MAYOR VOLUMEN",
  duracion: "MAYOR DURACIÓN",
  distancia: "MAYOR DISTANCIA",
  ritmo: "MEJOR RITMO",
};

function formatValue(record: RecordPersonal): string {
  const value = record.tipo === "ritmo" ? record.valor.toFixed(2) : record.valor.toLocaleString("es-ES", { maximumFractionDigits: 1 });
  const previous = record.anterior === undefined
    ? ""
    : ` · anterior: ${record.anterior.toLocaleString("es-ES", { maximumFractionDigits: 1 })}`;
  return `${value} ${record.unidad}${previous}`;
}

export function PersonalRecordsModal({ open, records, nombresEjercicios, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: { sx: { borderRadius: 0, border: 1, borderColor: "primary.main", bgcolor: "background.default" } },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <EmojiEventsIcon sx={{ color: "warning.main", fontSize: 30 }} />
        <Typography component="span" variant="h6" sx={{ fontWeight: "bold", letterSpacing: "0.05em" }}>
          RÉCORDS PERSONALES
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 2.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          TU PROGRESO DE HOY QUEDA REGISTRADO. CADA MARCA COMPARA CON TU HISTORIAL ANTERIOR.
        </Typography>
        {records.map((record, index) => (
          <Box key={`${record.ejercicioId}-${record.tipo}-${index}`} sx={{ py: 1.25 }}>
            {index > 0 && <Divider sx={{ mb: 1.25 }} />}
            <Typography variant="subtitle2" color="primary.main" sx={{ fontWeight: "bold" }}>
              {(nombresEjercicios.get(record.ejercicioId) ?? record.ejercicioId).toUpperCase()}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: "bold" }}>
              {LABELS[record.tipo]}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
              {formatValue(record)}
            </Typography>
          </Box>
        ))}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="contained" color="primary" disableElevation fullWidth>
          CONTINUAR
        </Button>
      </DialogActions>
    </Dialog>
  );
}
