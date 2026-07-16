import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Alert,
} from "@mui/material";
import InputNumber from "../../../components/InputNumber";
import { AppTextField } from "../../../components/AppTextField";
import type { PesoDiario } from "../../../core/db";

type Props = {
  /**
   * Registro a editar. El padre debe gate-render este componente con
   * `{editando && <EditPesoDialog ... />}` y pasar `key={editando.id}`
   * para que React desmonte/remonte y el state interno empiece limpio
   * por cada registro (evita sincronización imperativa con useEffect).
   */
  peso: PesoDiario;
  onClose: () => void;
  onSave: (changes: Pick<PesoDiario, "fecha" | "hora" | "valor">) => void;
};

export function EditPesoDialog({ peso, onClose, onSave }: Props) {
  const [fecha, setFecha] = useState(peso.fecha);
  const [hora, setHora] = useState(peso.hora);
  const [valor, setValor] = useState(peso.valor);
  const [error, setError] = useState<string | null>(null);

  const handleGuardar = () => {
    if (!fecha || !hora || !valor || valor <= 0) {
      setError("Completa fecha, hora y un peso válido (> 0).");
      return;
    }
    onSave({ fecha, hora, valor });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGuardar();
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: { sx: { borderRadius: 0, border: 1, borderColor: "divider" } },
      }}
    >
      <DialogTitle sx={{ letterSpacing: "0.05em" }}>
        EDITAR REGISTRO
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }} onKeyDown={handleKeyDown}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <AppTextField
              autoFocus
              type="date"
              label="FECHA"
              fullWidth
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                if (error) setError(null);
              }}
            />
            <AppTextField
              type="time"
              label="HORA"
              fullWidth
              value={hora}
              onChange={(e) => {
                setHora(e.target.value);
                if (error) setError(null);
              }}
            />
          </Stack>
          <InputNumber
            label="PESO (KG)"
            size="small"
            min={0}
            step={0.01}
            value={valor}
            onValueChange={(v) => {
              setValor(v ?? 0);
              if (error) setError(null);
            }}
          />
          {error && (
            <Alert severity="warning" sx={{ borderRadius: 0 }}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disableElevation>
          CANCELAR
        </Button>
        <Button
          onClick={handleGuardar}
          color="primary"
          variant="contained"
          disableElevation
        >
          GUARDAR
        </Button>
      </DialogActions>
    </Dialog>
  );
}
