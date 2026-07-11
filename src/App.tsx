import { useState } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  BottomNavigation,
  BottomNavigationAction,
} from "@mui/material";

import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import SettingsIcon from "@mui/icons-material/Settings";
import { SeguimientoPeso } from "./components/SeguimientoPeso";

import { wildTheme } from "./theme";

// Placeholders de las pantallas
const PesoView = () => (
  <Box>
    <SeguimientoPeso />
  </Box>
);
const RutinasView = () => <Box>🏋️‍♂️ MIS PLANES // RUTINAS</Box>;
const CoachView = () => <Box>🤖 CORE // IA COACH</Box>;
const AjustesView = () => <Box>⚙️ SYSTEM // CONFIGURACIÓN</Box>;

function App() {
  const [currentTab, setCurrentTab] = useState(0);

  const renderView = () => {
    switch (currentTab) {
      case 0:
        return <PesoView />;
      case 1:
        return <RutinasView />;
      case 2:
        return <CoachView />;
      case 3:
        return <AjustesView />;
      default:
        return <PesoView />;
    }
  };

  return (
    <ThemeProvider theme={wildTheme}>
      <CssBaseline />

      {/* 1. EL CUADRO GRANDE (Contenedor de toda la pantalla del iPhone) */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100dvh", // Ocupa el 100% de la pantalla real del móvil
          bgcolor: "background.default",
        }}
      >
        {/* 2. CUADRO SUPERIOR (Contenido que se estira y tiene su propio scroll) */}
        <Box
          component="main"
          sx={{
            p: 2,
            flexGrow: 1, // Se estira para ocupar todo el espacio disponible
            overflowY: "auto", // Si el contenido no cabe, hace scroll AQUÍ dentro
          }}
        >
          {renderView()}
        </Box>

        {/* 3. CUADRO INFERIOR (La barra, ocupa solo lo que necesita según su contenido) */}
        <Box
          component="footer"
          sx={{
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "background.paper",

          }}
        >
          <BottomNavigation

            value={currentTab}
            onChange={(_, newValue) => {
              setCurrentTab(newValue);
            }}
          >
            <BottomNavigationAction
              label="Historial"
              icon={<CalendarTodayIcon />}
            />
            <BottomNavigationAction
              label="Rutinas"
              icon={<FitnessCenterIcon />}
            />
            <BottomNavigationAction label="Coach" icon={<SmartToyIcon />} />
            <BottomNavigationAction label="Ajustes" icon={<SettingsIcon />} />
          </BottomNavigation>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
