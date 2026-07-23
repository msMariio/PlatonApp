import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { type GrupoMuscular, type TipoEjercicio, type Ejercicio } from "../../../core/db";
import { editarEjercicio } from "../data";
import { AppTextField } from "../../../components/AppTextField";

type Props = {
  open: boolean;
  ejercicio: Ejercicio | null;
  onClose: () => void;
  onSaved: () => void;
};

const GRUPOS: GrupoMuscular[] = [
  "pecho",
  "espalda",
  "pierna",
  "hombro",
  "brazos",
  "core",
  "cardio",
  "fullbody",
];

export function EditarEjercicioDialog({ open, ejercicio, onClose, onSaved }: Props) {
  const [nombre, setNombre] = useState("");
  const [grupoSel, setGrupoSel] = useState<GrupoMuscular>("pecho");
  const [tipoSel, setTipoSel] = useState<TipoEjercicio>("fuerza");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (open && ejercicio) {
      setNombre(ejercicio.nombre);
      setGrupoSel(ejercicio.grupoMuscular);
      setTipoSel(ejercicio.tipo);
      setDesc(ejercicio.descripcion ?? "");
    }
  }, [open, ejercicio]);

  const handleSave = async () => {
    const limpio = nombre.trim();
    if (!limpio || !ejercicio) return;
    try {
      await editarEjercicio(ejercicio.id, {
        nombre: limpio,
        grupoMuscular: grupoSel,
        tipo: tipoSel,
        descripcion: desc.trim() || undefined,
      });
      onSaved();
    } catch {
      window.alert("Error al guardar los cambios.");
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: { sx: { borderRadius: 0, border: 1, borderColor: "divider" } },
      }}
    >
      <DialogTitle sx={{ letterSpacing: "0.05em" }}>
        EDITAR EJERCICIO
      </DialogTitle>
      <DialogContent dividers sx={{ pt: 4 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <AppTextField
            autoFocus
            label="NOMBRE"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <ToggleButtonGroup
            exclusive
            size="small"
            value={grupoSel}
            onChange={(_, v) => v && setGrupoSel(v as GrupoMuscular)}
            sx={{ flexWrap: "wrap", gap: 0.5 }}
          >
            {GRUPOS.map((g) => (
              <ToggleButton
                key={g}
                value={g}
                sx={{ borderRadius: "0 !important" }}
              >
                {g.toUpperCase()}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <FormControl size="small">
            <InputLabel>TIPO</InputLabel>
            <Select
              value={tipoSel}
              label="TIPO"
              onChange={(e) => setTipoSel(e.target.value as TipoEjercicio)}
              sx={{ borderRadius: 0 }}
            >
              <MenuItem value="fuerza">FUERZA</MenuItem>
              <MenuItem value="cardio">CARDIO</MenuItem>
              <MenuItem value="tiempo">TIEMPO</MenuItem>
              <MenuItem value="calistenia">CALISTENIA</MenuItem>
            </Select>
          </FormControl>
          <AppTextField
            label="DESCRIPCIÓN (opcional)"
            multiline
            minRows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit" disableElevation>
          CANCELAR
        </Button>
        <Button
          onClick={handleSave}
          color="primary"
          variant="contained"
          disableElevation
          disabled={!nombre.trim()}
        >
          GUARDAR
        </Button>
      </DialogActions>
    </Dialog>
  );
}
