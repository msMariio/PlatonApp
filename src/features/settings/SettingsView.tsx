import { Box, Stack, Card, CardContent, Typography, Button } from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { PageHeader } from "../../components/PageHeader";
import { SectionLabel } from "../../components/SectionLabel";
import { useColorMode } from "../../core/ColorModeContext";

export function SettingsView() {
  const { mode, setMode } = useColorMode();
  const isDark = mode === "dark";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <PageHeader>AJUSTES</PageHeader>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <SectionLabel>APARIENCIA</SectionLabel>
            <Typography variant="body2" color="text.secondary">
              La aplicación respeta tu tema dark/light con la misma estética
              brutal-terminal.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                onClick={() => setMode("dark")}
                variant={isDark ? "contained" : "outlined"}
                color="primary"
                disableElevation
                startIcon={<DarkModeIcon />}
              >
                OSCURO
              </Button>
              <Button
                fullWidth
                onClick={() => setMode("light")}
                variant={!isDark ? "contained" : "outlined"}
                color="primary"
                disableElevation
                startIcon={<LightModeIcon />}
              >
                CLARO
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Modo actual: {isDark ? "OSCURO" : "CLARO"}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1}>
            <SectionLabel>PRÓXIMAMENTE</SectionLabel>
            <Typography variant="body2" color="text.secondary">
              · API KEY de Gemini (Coach IA)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              · Calendario semanal de planificación
            </Typography>
            <Typography variant="body2" color="text.secondary">
              · Historial de ejecución por ejercicio
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
