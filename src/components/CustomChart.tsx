import { Box, Typography, Card, CardContent } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";

// Datos de ejemplo que en el futuro vendrán de tu Dexie.js
const datosProgreso = [
  { fecha: "15 Jun", unRepMax: 80 },
  { fecha: "22 Jun", unRepMax: 82.5 },
  { fecha: "29 Jun", unRepMax: 82.5 },
  { fecha: "06 Jul", unRepMax: 85 },
];

export function MetricasFuerzaView() {
  return (
    <Card sx={{ bgcolor: "background.paper" }}>
      <CardContent>
        <Typography
          variant="button"
          color="primary"
          sx={{ display: "block", mb: 2 }}
        >
          // RENDIMIENTO // ENFOQUE_1RM: PRESS_BANCA
        </Typography>

        <Box sx={{ width: "100%", height: 300 }}>
          <LineChart
            xAxis={[
              {
                data: datosProgreso.map((d) => d.fecha),
                scaleType: "point",
              },
            ]}
            series={[
              {
                data: datosProgreso.map((d) => d.unRepMax),
                label: "1RM Estimado (KG)",
                color: "#adff2f", // Tu verde lima neón
                disableHighlight: true,
              },
            ]}
            // Activamos la rejilla de fondo estilo técnico/militar
            grid={{ vertical: true, horizontal: true }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
