import {
  Box,
  BottomNavigation,
  BottomNavigationAction,
  alpha,
} from "@mui/material";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import FitnessCenterRoundedIcon from "@mui/icons-material/FitnessCenterRounded";
// import SmartToyIcon from "@mui/icons-material/SmartToy";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
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
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        pb: (theme) =>
          `calc(${theme.spacing(3)} + env(safe-area-inset-bottom, 0px))`,
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
        <BottomNavigationAction
          label="Rutinas"
          icon={<FitnessCenterRoundedIcon />}
        />
        <BottomNavigationAction
          label="Coach"
          icon={<AutoAwesomeRoundedIcon />}
        />
        <BottomNavigationAction
          label="Ajustes"
          icon={<SettingsRoundedIcon />}
        />
      </BottomNavigation>
    </Box>
  );
}
