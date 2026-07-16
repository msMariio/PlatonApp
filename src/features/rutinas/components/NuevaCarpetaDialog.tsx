import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from "@mui/material";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (nombre: string) => Promise<void> | void;
};

export function NuevaCarpetaDialog({ open, onClose, onCreate }: Props) {
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);

  const handleClose = () => {
    setNombre("");
    setSaving(false);
    onClose();
  };

  const handleCrear = async () => {
    const limpio = nombre.trim();
    if (!limpio || saving) return;
    setSaving(true);
    await onCreate(limpio);
    setSaving(false);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      slotProps={{
        paper: { sx: { borderRadius: 0, border: 1, borderColor: "divider" } },
      }}
    >
      <DialogTitle sx={{ fontFamily: "inherit", letterSpacing: "0.05em" }}>
        NUEVA CARPETA
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="NOMBRE"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCrear();
            }
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit" disableElevation>
          CANCELAR
        </Button>
        <Button
          onClick={handleCrear}
          color="primary"
          variant="contained"
          disableElevation
          disabled={!nombre.trim() || saving}
        >
          CREAR
        </Button>
      </DialogActions>
    </Dialog>
  );
}
