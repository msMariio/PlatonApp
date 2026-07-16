import { useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Stack,
  TextField,
  Button,
  IconButton,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import InputNumber from "../../components/InputNumber";
import { PageHeader } from "../../components/PageHeader";
import { SectionLabel } from "../../components/SectionLabel";
import { ChartCard } from "../../components/ChartCard";
import { EmptyStateCard } from "../../components/EmptyStateCard";
import type { Timeframe } from "../../components/TimeframeSelector";
import { usePesosOrdenados } from "./usePesosOrdenados";
import { db } from "../../core/db";

const formatXAxis = (d: Date | string | number) => {
  if (!(d instanceof Date)) return String(d);
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const hh = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
};

const obtenerFechaHoy = () => new Date().toISOString().split("T")[0];

export function SeguimientoPeso() {
  const { pesos, filtrarPesos } = usePesosOrdenados();
  const [pesoInput, setPesoInput] = useState(0);
  const [fechaInput, setFechaInput] = useState(obtenerFechaHoy());
  const [timeframe, setTimeframe] = useState<Timeframe>("7D");

  const pesosFiltrados = filtrarPesos(pesos, timeframe);

  const { yMin, yMax } = useMemo(() => {
    const valores = pesosFiltrados.map((p) => p.valor);
    if (valores.length === 0) return { yMin: 0, yMax: 100 };
    const minV = Math.min(...valores);
    const maxV = Math.max(...valores);
    return {
      yMin: Math.max(0, Math.floor(minV - 5)),
      yMax: Math.ceil(maxV + 5),
    };
  }, [pesosFiltrados]);

  const handleGuardarPeso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pesoInput || pesoInput <= 0 || !fechaInput) return;
    const horaActual = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    await db.pesos.add({
      fecha: fechaInput,
      hora: horaActual,
      valor: pesoInput,
    });
    setPesoInput(0);
    setFechaInput(obtenerFechaHoy());
  };

  const handleEliminarPeso = async (id?: number) => {
    if (id === undefined) return;
    await db.pesos.delete(id);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <PageHeader>SEGUIMIENTO DE PESO</PageHeader>

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleGuardarPeso}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                type="date"
                label="FECHA"
                size="small"
                fullWidth
                value={fechaInput}
                onChange={(e) => setFechaInput(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <InputNumber
                label="PESO (KG)"
                size="small"
                min={0}
                step={0.01}
                value={pesoInput}
                onValueChange={(v) => setPesoInput(v ?? 0)}
              />
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disableElevation
                fullWidth
                disabled={!pesoInput}
              >
                REGISTRAR
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <ChartCard
        title="HISTORIAL"
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        xData={pesosFiltrados.map((p) => new Date(`${p.fecha}T${p.hora}`))}
        yData={pesosFiltrados.map((p) => p.valor)}
        seriesLabel="Masa Corporal (KG)"
        color="#adff2f"
        yMin={yMin}
        yMax={yMax}
        xValueFormatter={formatXAxis}
        emptyMessage="[ INSUFICIENTES DATOS // INGRESA MÍNIMO 2 REGISTROS ]"
      />

      <Card>
        <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <SectionLabel sx={{ mb: 1 }}>LOGS</SectionLabel>
          {pesosFiltrados.length === 0 ? (
            <EmptyStateCard height={80}>[ NO HAY REGISTROS EN ESTE PERIODO ]</EmptyStateCard>
          ) : (
            [...pesosFiltrados].reverse().map((p) => (
              <Stack
                key={p.id}
                direction="row"
                spacing={2}
                sx={{
                  py: 1,
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: 1,
                  borderColor: "divider",
                  "&:last-of-type": { borderBottom: "none" },
                }}
              >
                <Stack direction="row" spacing={2}>
                  <Typography variant="body2">
                    {p.fecha}{" "}
                    <Box component="span" sx={{ color: "text.secondary" }}>
                      [{p.hora}]
                    </Box>
                  </Typography>
                  <Typography
                    variant="body2"
                    color="primary"
                    sx={{ fontWeight: "bold" }}
                  >
                    {p.valor.toLocaleString("es-ES", {
                      maximumFractionDigits: 3,
                    })}{" "}
                    KG
                  </Typography>
                </Stack>
                <IconButton
                  size="small"
                  onClick={() => handleEliminarPeso(p.id)}
                  sx={{
                    color: "text.secondary",
                    "&:hover": { color: "error.main" },
                    borderRadius: 0,
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
