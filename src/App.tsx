import { useState } from "react";
import { Box, CssBaseline } from "@mui/material";
import { ColorModeProvider } from "./core/ColorModeContext";
import { AppThemeProvider } from "./core/theme";
import { SeguimientoPeso } from "./features/peso-tracker/SeguimientoPeso";
import { RutinasView } from "./features/rutinas/RutinasView";
import { SettingsView } from "./features/settings/SettingsView";
import { AppFooter } from "./components/AppFooter";

const CoachView = () => (
  <Box
    sx={{
      py: 6,
      textAlign: "center",
      border: "1px dashed",
      borderColor: "divider",
    }}
  >
    <Box sx={{ color: "text.secondary", letterSpacing: "0.05em" }}>
      {"[ COACH IA // PRÓXIMAMENTE — CONFIGURA TU API KEY EN AJUSTES ]"}
    </Box>
  </Box>
);

function App() {
  const [currentTab, setCurrentTab] = useState(0);

  return (
    <ColorModeProvider>
      <AppThemeProvider>
        <CssBaseline />
        <Box
          sx={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            height: "100dvh",
            bgcolor: "background.default",
          }}
        >
          <Box
            component="main"
            sx={{
              p: 2,
              flexGrow: 1,
              overflowY: "auto",
              pb: (theme) =>
                `calc(${theme.spacing(13)} + env(safe-area-inset-bottom, 0px))`,
            }}
          >
            {renderView(currentTab)}
          </Box>
          <AppFooter currentTab={currentTab} onChangeTab={setCurrentTab} />
        </Box>
      </AppThemeProvider>
    </ColorModeProvider>
  );
}

function renderView(tab: number) {
  switch (tab) {
    case 0:
      return <SeguimientoPeso />;
    case 1:
      return <RutinasView />;
    case 2:
      return <CoachView />;
    case 3:
      return <SettingsView />;
    default:
      return <SeguimientoPeso />;
  }
}

export default App;
