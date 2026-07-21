import { Box, Card, CardContent, IconButton, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import type { Ejercicio, EjercicioReal, SerieReal, TipoEjercicio } from "../../../core/db";
import { SerieLoggerRow, type PlaceholderData } from "./SerieLoggerRow";

type Props = {
  ejercicio: EjercicioReal;
  catalog: Ejercicio | undefined;
  placeholders: PlaceholderData[];
  onChange: (next: EjercicioReal) => void;
  onDelete?: () => void;
};

export function EjercicioLoggerCard({
  ejercicio,
  catalog,
  placeholders,
  onChange,
  onDelete,
}: Props) {
  const tipo: TipoEjercicio = catalog?.tipo ?? "fuerza";

  const handleSerieChange = (idx: number, nextSerie: SerieReal) => {
    const nextSeries = ejercicio.series.map((s, i) =>
      i === idx ? nextSerie : s
    );
    onChange({ ...ejercicio, series: nextSeries });
  };

  const handleAddSerie = () => {
    const last = ejercicio.series[ejercicio.series.length - 1];
    onChange({
      ...ejercicio,
      series: [
        ...ejercicio.series,
        {
          peso: 0,
          reps: 0,
          duracionMinutos: 0,
          distanciaKm: 0,
          nivelInclinacion: 0,
          completado: false,
          rpe: last?.rpe,
        },
      ],
    });
  };

  return (
    <Card>
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                {catalog?.nombre ?? "[ EJERCICIO SIN NOMBRE ]"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {catalog
                  ? `${catalog.grupoMuscular.toUpperCase()} // ${tipo.toUpperCase()}`
                  : ""}
              </Typography>
            </Box>
            {onDelete && (
              <IconButton
                size="small"
                onClick={onDelete}
                sx={{
                  borderRadius: 0,
                  color: "error.main",
                  border: 1,
                  borderColor: "divider",
                  "&:hover": {
                    bgcolor: "error.main",
                    color: "error.contrastText",
                    borderColor: "error.main",
                  },
                  touchAction: "manipulation",
                }}
                aria-label="Eliminar ejercicio del entrenamiento"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {ejercicio.series.map((s, idx) => (
              <SerieLoggerRow
                key={idx}
                index={idx}
                serie={s}
                placeholder={placeholders[idx] ?? { peso: 0, reps: 0 }}
                tipo={tipo}
                onChange={(next) => handleSerieChange(idx, next)}
              />
            ))}
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <IconButton
                size="small"
                onClick={handleAddSerie}
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
        </Box>
      </CardContent>
    </Card>
  );
}
