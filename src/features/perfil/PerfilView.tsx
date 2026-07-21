import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  Typography,
  Alert,
  Collapse,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import SaveIcon from "@mui/icons-material/Save";
import { db, type PerfilUsuario, type SexoBiologico } from "../../core/db";
import { AppTextField } from "../../components/AppTextField";
import InputNumber from "../../components/InputNumber";
import { SectionLabel } from "../../components/SectionLabel";
import { usePerfil } from "./usePerfil";

export function PerfilView() {
  const perfil = usePerfil();

  const [nombre, setNombre] = useState("");
  const [alturaCm, setAlturaCm] = useState<number | null>(170);
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [sexoBio, setSexoBio] = useState<SexoBiologico | null>(null);
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
      apiKeyGemini: apiKey.trim() || undefined,
    };
    await db.perfil_usuario.put(datos);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }, [nombre, alturaCm, fechaNacimiento, sexoBio, apiKey]);

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

            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mb: 0.5, display: "block", letterSpacing: "0.05em" }}
              >
                SEXO BIOLÓGICO
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={sexoBio}
                onChange={(_, v) => setSexoBio(v as SexoBiologico | null)}
                sx={{ gap: 0.5 }}
              >
                <ToggleButton
                  value="hombre"
                  sx={{ borderRadius: "0 !important" }}
                >
                  HOMBRE
                </ToggleButton>
                <ToggleButton
                  value="mujer"
                  sx={{ borderRadius: "0 !important" }}
                >
                  MUJER
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
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
