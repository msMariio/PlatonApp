import { ThemeProvider, CssBaseline, Box, Typography } from "@mui/material";
import { wildTheme } from "./theme";
function App() {
  return (
    <ThemeProvider theme={wildTheme}>
      <CssBaseline /> {/* Resetea los estilos del navegador a negro puro */}
      <Box
        sx={{
          p: 3,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          color="primary"
          sx={{ fontWeight: "bold" }}
        >
          TRACKER // SYSTEM
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Base de datos local e IA lista. El entorno está operativo.
        </Typography>
      </Box>
    </ThemeProvider>
  );
}

export default App;
