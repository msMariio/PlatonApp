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
import { SeguimientoPeso } from "./features/peso-tracker/SeguimientoPeso";

import { wildTheme } from "./core/theme";

// Placeholders de las pantallas
const PesoView = () => <SeguimientoPeso />;
const RutinasView = () => <Box>RUTINAS</Box>;
const CoachView = () => <Box>IA</Box>;
const AjustesView = () => <Box>AJUSTES</Box>;

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

      <Box
        sx={{
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
          }}
        >
          {renderView()}
        </Box>

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
