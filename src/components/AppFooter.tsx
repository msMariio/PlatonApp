import {
  Box,
  BottomNavigation,
  BottomNavigationAction,
  alpha,
} from "@mui/material";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import SettingsIcon from "@mui/icons-material/Settings";

type AppFooterProps = {
  currentTab: number;
  onChangeTab: (newValue: number) => void;
};

export function AppFooter({ currentTab, onChangeTab }: AppFooterProps) {
  return (
    <Box
      component="footer"
      sx={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        borderTop: 1,
        borderColor: "divider",
        bgcolor: (theme) => alpha(theme.palette.background.paper, 0.7),
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        pb: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <BottomNavigation
        value={currentTab}
        onChange={(_, newValue) => {
          onChangeTab(newValue);
        }}
        sx={{
          minHeight: (theme) => theme.spacing(8),
          bgcolor: "transparent",
        }}
      >
        <BottomNavigationAction
          label="Historial"
          icon={<CalendarTodayIcon />}
        />
        <BottomNavigationAction label="Rutinas" icon={<FitnessCenterIcon />} />
        <BottomNavigationAction label="Coach" icon={<SmartToyIcon />} />
        <BottomNavigationAction label="Ajustes" icon={<SettingsIcon />} />
      </BottomNavigation>
    </Box>
  );
}
