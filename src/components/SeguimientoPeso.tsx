import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Stack,
  FormControl,
  Select,
  MenuItem,
  IconButton,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { LineChart } from "@mui/x-charts/LineChart";

type Timeframe = "semanal" | "mensual" | "anual" | "todo";

const obtenerFechaHoy = () => new Date().toISOString().split("T")[0];

export function SeguimientoPeso() {
  const [pesoInput, setPesoInput] = useState<string>("");
  const [fechaInput, setFechaInput] = useState<string>(obtenerFechaHoy());
  const [timeframe, setTimeframe] = useState<Timeframe>("semanal");

  // 1. Escuchar datos en vivo ordenados cronológicamente
  const todosLosPesos =
    useLiveQuery(async () => {
      const data = await db.pesos.toArray();
      return data.sort((a, b) => {
        const fechaComp = a.fecha.localeCompare(b.fecha);
        if (fechaComp !== 0) return fechaComp;
        return a.hora.localeCompare(b.hora);
      });
    }) || [];

  // 2. Filtrado temporal
  const filtrarPesos = () => {
    if (todosLosPesos.length === 0) return [];
    const ahora = new Date();
    const limite = new Date();

    switch (timeframe) {
      case "semanal":
        limite.setDate(ahora.getDate() - 7);
        break;
      case "mensual":
        limite.setDate(ahora.getDate() - 30);
        break;
      case "anual":
        limite.setDate(ahora.getDate() - 365);
        break;
      case "todo":
        return todosLosPesos;
    }
    return todosLosPesos.filter((p) => new Date(p.fecha) >= limite);
  };

  const pesosFiltrados = filtrarPesos();

  // ─── CÁLCULO DINÁMICO DE LÍMITES PARA EL EJE Y ─────────────────────
  const valoresPeso = pesosFiltrados.map((p) => p.valor);
  const minPeso = valoresPeso.length > 0 ? Math.min(...valoresPeso) : 0;
  const maxPeso = valoresPeso.length > 0 ? Math.max(...valoresPeso) : 100;

  // Añadimos un margen de 2 KG por arriba y por abajo
  const yMin = Math.max(0, Math.floor(minPeso - 2));
  const yMax = Math.ceil(maxPeso + 2);
  // ───────────────────────────────────────────────────────────────────

  // 3. Guardar nuevo registro con Hora automática
  const handleGuardarPeso = async (e: React.FormEvent) => {
    e.preventDefault();
    const pesoNum = parseFloat(pesoInput);
    if (isNaN(pesoNum) || pesoNum <= 0 || !fechaInput) return;

    const ahora = new Date();
    const horaActual = ahora.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    await db.pesos.add({
      fecha: fechaInput,
      hora: horaActual,
      valor: pesoNum,
    });

    setPesoInput("");
    setFechaInput(obtenerFechaHoy());
  };

  // 4. Función para borrar un registro por su ID
  const handleEliminarPeso = async (id?: number) => {
    if (id === undefined) return;
    await db.pesos.delete(id);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Typography variant="h5" color="primary">
        SEGUIMIENTO DE PESO
      </Typography>

      {/* Formulario */}
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
              <TextField
                label="PESO (KG)"
                variant="outlined"
                size="small"
                fullWidth
                value={pesoInput}
                onChange={(e) => setPesoInput(e.target.value)}
                slotProps={{
                  htmlInput: {
                    inputMode: "decimal",
                    pattern: "[0-9]*[.,]?[0-9]*",
                  },
                }}
              />
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disableElevation
                fullWidth
              >
                REGISTRAR
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      {/* Gráfica */}
      <Card>
        <CardContent>
          <Stack
            direction="row"
            sx={{
              mb: 2,
              gap: 2,
              justifyContent: "space-between",
            }}
          >
            <Typography variant="button" color="text.secondary">
              HISTORIAL
            </Typography>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <Select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              >
                <MenuItem value="semanal">7D</MenuItem>
                <MenuItem value="mensual">30D</MenuItem>
                <MenuItem value="anual">1A</MenuItem>
                <MenuItem value="todo">TODO</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {pesosFiltrados.length < 2 ? (
            <Box
              sx={{
                height: 250,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px dashed #222",
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>
                [ INSUFICIENTES DATOS // INGRESA MINIMO 2 REGISTROS ]
              </Typography>
            </Box>
          ) : (
            <Box sx={{ width: "100%", height: 300 }}>
              <LineChart
                xAxis={[
                  {
                    data: pesosFiltrados.map(
                      (p) => new Date(`${p.fecha}T${p.hora}`),
                    ),
                    scaleType: "time",
                    valueFormatter: (date: Date) => {
                      const d = date.getDate().toString().padStart(2, "0");
                      const m = (date.getMonth() + 1)
                        .toString()
                        .padStart(2, "0");
                      const hr = date.getHours().toString().padStart(2, "0");
                      const min = date.getMinutes().toString().padStart(2, "0");
                      return `${d}/${m} ${hr}:${min}`;
                    },
                  },
                ]}
                // Agregamos la propiedad yAxis con los límites controlados
                yAxis={[
                  {
                    min: yMin,
                    max: yMax,
                  },
                ]}
                series={[
                  {
                    data: pesosFiltrados.map((p) => p.valor),
                    label: "Masa Corporal (KG)",
                    color: "#adff2f",
                    showMark: true,
                  },
                ]}
                grid={{ vertical: true, horizontal: true }}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Bitácora de Registros */}
      <Card sx={{ flexGrow: 1 }}>
        <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="button" color="text.secondary" sx={{ mb: 1 }}>
            LOGS
          </Typography>

          {pesosFiltrados.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              [ NO HAY REGISTROS EN ESTE PERIODO ]
            </Typography>
          ) : (
            [...pesosFiltrados].reverse().map((p) => (
              <Stack
                key={p.id}
                direction="row"
                spacing={2} // El spacing sí lo acepta bien como propiedad directa
                sx={{
                  py: 1,
                  alignItems: "center", // ◄── ¡Muévelo aquí dentro!
                  justifyContent: "space-between",
                  borderBottom: "1px solid #111111",
                  "&:last-child": { borderBottom: "none" },
                }}
              >
                <Stack direction="row" spacing={2}>
                  <Typography variant="body2" sx={{ color: "#ffffff" }}>
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
                    {p.valor.toFixed(1)} KG
                  </Typography>
                </Stack>

                <IconButton
                  size="small"
                  onClick={() => handleEliminarPeso(p.id)}
                  sx={{
                    color: "#444444",
                    "&:hover": { color: "#ff4444" },
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
