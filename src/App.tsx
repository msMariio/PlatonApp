import { useState } from "react";
import { Box, CssBaseline } from "@mui/material";
import { ColorModeProvider } from "./core/ColorModeContext";
import { AppThemeProvider } from "./core/theme";
import { HomeView } from "./features/home/HomeView";
import { TrainingLoggerView } from "./features/training-logger/TrainingLoggerView";
import { SeguimientoPeso } from "./features/peso-tracker/SeguimientoPeso";
import { RutinasView } from "./features/rutinas/RutinasView";
import { CoachView } from "./features/coach-ia/CoachView";
import { SettingsView } from "./features/settings/SettingsView";
import { AppFooter } from "./components/AppFooter";

type AppScreen =
  | { type: "tab"; tab: number }
  | { type: "logger"; rutinaId: string; logId?: number };

function App() {
  const [screen, setScreen] = useState<AppScreen>({ type: "tab", tab: 0 });

  const handleStartTraining = (rutinaId: string, logId?: number) => {
    setScreen({ type: "logger", rutinaId, logId });
  };

  const handleBackToHome = () => {
    setScreen({ type: "tab", tab: 0 });
  };

  const handleChangeTab = (tab: number) => {
    setScreen({ type: "tab", tab });
  };

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
            {renderScreen(screen, handleStartTraining, handleBackToHome)}
          </Box>
          {screen.type === "tab" && (
            <AppFooter currentTab={screen.tab} onChangeTab={handleChangeTab} />
          )}
        </Box>
      </AppThemeProvider>
    </ColorModeProvider>
  );
}

function renderScreen(
  screen: AppScreen,
  onStartTraining: (rutinaId: string) => void,
  onBackToHome: () => void
) {
  if (screen.type === "logger") {
    return (
      <TrainingLoggerView
        rutinaId={screen.rutinaId}
        logId={screen.logId}
        onBack={onBackToHome}
        onSaved={onBackToHome}
      />
    );
  }

  switch (screen.tab) {
    case 0:
      return <HomeView onStartTraining={onStartTraining} />;
    case 1:
      return <SeguimientoPeso />;
    case 2:
      return <RutinasView />;
    case 3:
      return <CoachView />;
    case 4:
      return <SettingsView />;
    default:
      return <HomeView onStartTraining={onStartTraining} />;
  }
}

export default App;
