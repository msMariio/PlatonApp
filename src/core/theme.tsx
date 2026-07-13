import { createTheme } from "@mui/material/styles";

export const wildTheme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#000000", // Negro puro
      paper: "#0a0a0a", // Tarjetas y modales casi negros
    },
    primary: {
      main: "#adff2f", // Verde lima eléctrico (tu color de acento)
    },
    secondary: {
      main: "#ffffff",
    },
    text: {
      primary: "#ffffff",
      secondary: "#888888",
    },
  },
  typography: {
    fontFamily: '"Courier New", Courier, monospace, "Roboto Mono"',
    button: {
      textTransform: "uppercase",
      fontWeight: "bold",
    },
  },
  shape: {
    borderRadius: 0, // 👈 Cero curvas en toda la app
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid #222222", // Bordes finos en vez de sombras
          boxShadow: "none",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          boxShadow: "none",
          "&:hover": {
            boxShadow: "none",
          },
        },
      },
    },
  },
});
