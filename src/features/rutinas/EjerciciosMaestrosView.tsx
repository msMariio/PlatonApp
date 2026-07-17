import { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "../../components/PageHeader";
import { AppTextField } from "../../components/AppTextField";
import { EmptyStateCard } from "../../components/EmptyStateCard";
import { db } from "../../core/db";
import { SelectEjercicioDialog } from "./components/SelectEjercicioDialog";

type Props = {
  onBack: () => void;
  onOpenAnalytics: (ejercicioId: string) => void;
};

export function EjerciciosMaestrosView({ onBack, onOpenAnalytics }: Props) {
  const ejercicios = useLiveQuery(() => db.ejercicios.toArray(), []) ?? [];
  const [filtro, setFiltro] = useState("");
  const [creando, setCreando] = useState(false);

  const f = filtro.trim().toLowerCase();
  const filtrados = [...ejercicios]
    .filter(
      (e) =>
        e.nombre.toLowerCase().includes(f) ||
        e.grupoMuscular.toLowerCase().includes(f)
    )
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton
          onClick={onBack}
          sx={{
            color: "primary.main",
            borderRadius: 0,
            touchAction: "manipulation",
          }}
          aria-label="Volver"
        >
          <ArrowBackIcon />
        </IconButton>
        <PageHeader sx={{ flexGrow: 1 }}>EJERCICIOS</PageHeader>
      </Box>

      <Card>
        <CardContent
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <Box sx={{ display: "flex", gap: 1 }}>
            <AppTextField
              label="BUSCAR"
              fullWidth
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
            <Button
              variant="contained"
              color="primary"
              disableElevation
              onClick={() => setCreando(true)}
              sx={{ minWidth: 48, px: 1 }}
            >
              <AddIcon />
            </Button>
          </Box>

          {filtrados.length === 0 ? (
            <EmptyStateCard height={160}>
              [ NO HAY EJERCICIOS // CREA UNO NUEVO ]
            </EmptyStateCard>
          ) : (
            <List dense sx={{ maxHeight: 400, overflowY: "auto" }}>
              {filtrados.map((e) => (
                <ListItemButton
                  key={e.id}
                  onClick={() => onOpenAnalytics(e.id)}
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
        </CardContent>
      </Card>

      <SelectEjercicioDialog
        open={creando}
        onClose={() => setCreando(false)}
        onPick={(id) => {
          setCreando(false);
          onOpenAnalytics(id);
        }}
      />
    </Box>
  );
}
