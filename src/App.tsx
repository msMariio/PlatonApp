import { useState } from "react";
import { ThemeProvider, CssBaseline, Box } from "@mui/material";
import { SeguimientoPeso } from "./features/peso-tracker/SeguimientoPeso";
import { AppFooter } from "./components/AppFooter";

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
          {renderView()}
        </Box>

        <AppFooter currentTab={currentTab} onChangeTab={setCurrentTab} />
      </Box>
    </ThemeProvider>
  );
}

export default App;
