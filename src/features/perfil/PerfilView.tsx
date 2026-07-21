import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Stack,
  Typography,
  Alert,
  Collapse,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import SaveIcon from "@mui/icons-material/Save";
import { db, type PerfilUsuario, type SexoBiologico, type ObjetivoFitness } from "../../core/db";
import { AppTextField } from "../../components/AppTextField";
import InputNumber from "../../components/InputNumber";
import { SectionLabel } from "../../components/SectionLabel";
import { usePerfil } from "./usePerfil";

const OBJETIVOS: { value: ObjetivoFitness; label: string }[] = [
  { value: "hipertrofia", label: "HIPERTROFIA" },
  { value: "fuerza_maxima", label: "FUERZA MÁX." },
  { value: "definicion", label: "DEFINICIÓN" },
  { value: "perdida_peso", label: "PÉRDIDA PESO" },
  { value: "recomposicion", label: "RECOMPOSICIÓN" },
];

export function PerfilView() {
  const perfil = usePerfil();

  const [nombre, setNombre] = useState("");
  const [alturaCm, setAlturaCm] = useState<number | null>(170);
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [sexoBio, setSexoBio] = useState<SexoBiologico | null>(null);
  const [objetivo, setObjetivo] = useState<ObjetivoFitness | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [guardado, setGuardado] = useState(false);

  // Hydrate form when perfil loads
  const [hydrated, setHydrated] = useState(false);
  if (perfil && !hydrated) {
    setHydrated(true);
    setNombre(perfil.nombre ?? "");
    setAlturaCm(perfil.alturaCm ?? 170);
    setFechaNacimiento(perfil.fechaNacimiento ?? "");
    setSexoBio(perfil.sexoBio ?? null);
    setObjetivo(perfil.objetivo ?? null);
    setApiKey(perfil.apiKeyGemini ?? "");
  }

  // Reset hydrated when perfil changes
  useEffect(() => {
    setHydrated(false);
  }, [perfil?.id]);

  const handleGuardar = useCallback(async () => {
    const datos: PerfilUsuario = {
      id: 1,
      alturaCm: alturaCm ?? 170,
      nombre: nombre.trim() || undefined,
      fechaNacimiento: fechaNacimiento || undefined,
      sexoBio: sexoBio ?? undefined,
      objetivo: objetivo ?? undefined,
      apiKeyGemini: apiKey.trim() || undefined,
    };
    await db.perfil_usuario.put(datos);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }, [nombre, alturaCm, fechaNacimiento, sexoBio, objetivo, apiKey]);

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <SectionLabel>DATOS ANATOMÍA / BIOMÉTRICOS</SectionLabel>

            <AppTextField
              label="NOMBRE (opcional)"
              fullWidth
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />

            <InputNumber
              label="ALTURA (cm)"
              size="medium"
              min={100}
              max={250}
              step={1}
              value={alturaCm}
              onValueChange={(v) => setAlturaCm(v)}
            />

            <AppTextField
              type="date"
              label="FECHA DE NACIMIENTO"
              fullWidth
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
              slotProps={{
                inputLabel: { shrink: true },
              }}
            />

            <FormControl fullWidth>
              <InputLabel id="sexo-label">SEXO BIOLÓGICO</InputLabel>
              <Select
                labelId="sexo-label"
                value={sexoBio ?? ""}
                label="SEXO BIOLÓGICO"
                onChange={(e) =>
                  setSexoBio(
                    (e.target.value as string) === ""
                      ? null
                      : (e.target.value as SexoBiologico),
                  )
                }
              >
                <MenuItem value="">
                  <em>SIN ESPECIFICAR</em>
                </MenuItem>
                <MenuItem value="hombre">HOMBRE</MenuItem>
                <MenuItem value="mujer">MUJER</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="objetivo-label">OBJETIVO</InputLabel>
              <Select
                labelId="objetivo-label"
                value={objetivo ?? ""}
                label="OBJETIVO"
                onChange={(e) =>
                  setObjetivo(
                    (e.target.value as string) === ""
                      ? null
                      : (e.target.value as ObjetivoFitness),
                  )
                }
              >
                <MenuItem value="">
                  <em>SIN ESPECIFICAR</em>
                </MenuItem>
                {OBJETIVOS.map((obj) => (
                  <MenuItem key={obj.value} value={obj.value}>
                    {obj.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <SectionLabel>CONFIGURACIÓN IA // COACH SYSTEM</SectionLabel>

            <AppTextField
              type={showKey ? "text" : "password"}
              label="GEMINI API KEY"
              fullWidth
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowKey((prev) => !prev)}
                        edge="end"
                        sx={{
                          borderRadius: 0,
                          color: "text.secondary",
                          touchAction: "manipulation",
                        }}
                        aria-label={
                          showKey ? "Ocultar API key" : "Mostrar API key"
                        }
                      >
                        {showKey ? (
                          <VisibilityOffIcon fontSize="small" />
                        ) : (
                          <VisibilityIcon fontSize="small" />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Box
              sx={{
                p: 1.5,
                border: 1,
                borderColor: "primary.main",
                bgcolor: "action.hover",
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Tu API Key se almacena exclusivamente de forma local en
                IndexedDB (Dexie) y nunca sale de tu dispositivo.
              </Typography>
            </Box>

            <Link
              href="https://aistudio.google.com/"
              target="_blank"
              rel="noopener"
              underline="always"
              sx={{
                color: "primary.main",
                fontSize: "0.8rem",
                letterSpacing: "0.03em",
                fontWeight: "bold",
              }}
            >
              [ OBTENER API KEY GRATIS → GOOGLE AI STUDIO ]
            </Link>
          </Stack>
        </CardContent>
      </Card>

      <Collapse in={guardado}>
        <Alert
          severity="success"
          sx={{
            borderRadius: 0,
            border: 1,
            borderColor: "primary.main",
            bgcolor: "action.hover",
            "& .MuiAlert-icon": { color: "primary.main" },
            "& .MuiAlert-message": {
              color: "primary.main",
              fontWeight: "bold",
              letterSpacing: "0.05em",
            },
          }}
        >
          [ CONFIGURACIÓN GUARDADA CORRECTAMENTE ]
        </Alert>
      </Collapse>

      <Button
        variant="contained"
        color="primary"
        disableElevation
        fullWidth
        startIcon={<SaveIcon />}
        onClick={handleGuardar}
        sx={{ py: 1.5 }}
      >
        GUARDAR // ACTUALIZAR_CONFIG
      </Button>
    </Stack>
  );
}
