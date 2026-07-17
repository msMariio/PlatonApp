import { Box, Card, CardContent, IconButton, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { Ejercicio, EjercicioReal, SerieReal } from "../../../core/db";
import { SerieLoggerRow } from "./SerieLoggerRow";

type Props = {
  ejercicio: EjercicioReal;
  catalog: Ejercicio | undefined;
  placeholders: { peso: number; reps: number }[];
  onChange: (next: EjercicioReal) => void;
};

export function EjercicioLoggerCard({
  ejercicio,
  catalog,
  placeholders,
  onChange,
}: Props) {
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
          <Box>
            <Typography variant="body1" sx={{ fontWeight: "bold" }}>
              {catalog?.nombre ?? "[ EJERCICIO SIN NOMBRE ]"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {catalog?.grupoMuscular.toUpperCase()}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {ejercicio.series.map((s, idx) => (
              <SerieLoggerRow
                key={idx}
                index={idx}
                serie={s}
                placeholder={placeholders[idx] ?? { peso: 0, reps: 0 }}
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
