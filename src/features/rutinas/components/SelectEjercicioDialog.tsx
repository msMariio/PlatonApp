import { useState, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  List,
  ListItemButton,
  ListItemText,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type GrupoMuscular } from "../../../core/db";
import { crearEjercicio } from "../data";
import { AppTextField } from "../../../components/AppTextField";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Devuelve el ejercicioId (existente o recién creado). */
  onPick: (ejercicioId: string) => void;
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

export function SelectEjercicioDialog({ open, onClose, onPick }: Props) {
  const ejercicios = useLiveQuery(() => db.ejercicios.toArray(), []) ?? [];
  const [filtro, setFiltro] = useState("");
  const [creando, setCreando] = useState(false);
  const [grupoSel, setGrupoSel] = useState<GrupoMuscular>("pecho");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [descNuevo, setDescNuevo] = useState("");

  const filtrados = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return [...ejercicios]
      .filter((e) =>
        f
          ? e.nombre.toLowerCase().includes(f) ||
            e.grupoMuscular.includes(f)
          : true
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [ejercicios, filtro]);

  const handleClose = () => {
    setFiltro("");
    setCreando(false);
    setGrupoSel("pecho");
    setNombreNuevo("");
    setDescNuevo("");
    onClose();
  };

  const handleCrear = async () => {
    const limpio = nombreNuevo.trim();
    if (!limpio) return;
    const id = await crearEjercicio({
      nombre: limpio,
      grupoMuscular: grupoSel,
      descripcion: descNuevo.trim() || undefined,
    });
    onPick(id);
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
        AÑADIR EJERCICIO
      </DialogTitle>
      <DialogContent dividers>
        {creando ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <AppTextField
              autoFocus
              label="NOMBRE"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
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
            <AppTextField
              label="DESCRIPCIÓN (opcional)"
              multiline
              minRows={2}
              value={descNuevo}
              onChange={(e) => setDescNuevo(e.target.value)}
            />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <AppTextField
              label="BUSCAR"
              fullWidth
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
              <IconButton
                onClick={() => setCreando(true)}
                sx={{
                  borderRadius: 0,
                  border: 1,
                  borderColor: "primary.main",
                  color: "primary.main",
                  touchAction: "manipulation",
                }}
                aria-label="Crear nuevo ejercicio"
              >
                <AddIcon />
              </IconButton>
            </Box>
            {filtrados.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                [ NO HAY EJERCICIOS // CREA UNO CON EL BOTÓN + ]
              </Typography>
            ) : (
              <List dense sx={{ maxHeight: 320, overflowY: "auto" }}>
                {filtrados.map((e) => (
                  <ListItemButton
                    key={e.id}
                    onClick={() => onPick(e.id)}
                    sx={{ borderRadius: 0, mb: 0.5 }}
                  >
                    <ListItemText
                      primary={e.nombre}
                      secondary={e.grupoMuscular.toUpperCase()}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {creando ? (
          <>
            <Button
              onClick={() => setCreando(false)}
              color="inherit"
              disableElevation
            >
              VOLVER
            </Button>
            <Button
              onClick={handleCrear}
              color="primary"
              variant="contained"
              disableElevation
              disabled={!nombreNuevo.trim()}
            >
              CREAR
            </Button>
          </>
        ) : (
          <Button onClick={handleClose} color="inherit" disableElevation>
            CERRAR
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
