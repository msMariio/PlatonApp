/* eslint-disable react-refresh/only-export-components */
import {
  createTheme,
  type PaletteMode,
  type ThemeOptions,
} from "@mui/material/styles";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { useMemo } from "react";
import { useColorMode } from "./ColorModeContext";

const fonts = '"Courier New", Courier, monospace, "Roboto Mono"';

/**
 * Opciones del theme "wild".
 * Dark: negro puro con verde lima eléctrico.
 * Light: casi-blanco con texto casi-negro. Mismo acento, misma forma (radius 0),
 * mismas reglas tipográficas. Sigue siendo brutal-terminal, sólo invertido.
 */
export const wildThemeOptions = (mode: PaletteMode): ThemeOptions => ({
  palette: {
    mode,
    background: {
      default: mode === "dark" ? "#000000" : "#fafafa",
      paper: mode === "dark" ? "#0a0a0a" : "#ffffff",
    },
    primary: {
      main: mode === "dark" ? "#adff2f" : "#699625",
      contrastText: mode === "dark" ? "#000000" : "#0a0a0a",
    },
    secondary: {
      main: mode === "dark" ? "#ffffff" : "#0a0a0a",
    },
    error: {
      main: "#ff4444",
    },
    text: {
      primary: mode === "dark" ? "#ffffff" : "#0a0a0a",
      secondary: mode === "dark" ? "#888888" : "#555555",
    },
    divider: mode === "dark" ? "#222222" : "#0a0a0a",
  },
  typography: {
    fontFamily: fonts,
    button: {
      textTransform: "uppercase",
      fontWeight: "bold",
      letterSpacing: "0.05em",
    },
  },
  shape: {
    borderRadius: 0,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${mode === "dark" ? "#222222" : "#0a0a0a"}`,
          boxShadow: "none",
          backgroundImage: "none",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          boxShadow: "none",
          "&:hover": { boxShadow: "none" },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 0,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          borderRadius: 0,
        },
      },
    },
  },
});

/**
 * Theme por defecto (dark) — se conserva por compatibilidad si alguien lo
 * importa directamente. Lo que debería usarse en el árbol es <AppThemeProvider>.
 */
export const wildTheme = createTheme(wildThemeOptions("dark"));

/**
 * ThemeProvider que se conecta con ColorModeContext y crea el theme según
 * el modo actual.
 */
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useColorMode();
  const theme = useMemo(() => createTheme(wildThemeOptions(mode)), [mode]);
  return <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>;
}
