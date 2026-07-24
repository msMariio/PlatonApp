import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // Actualiza la app automáticamente cuando subas cambios
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Gym Tracker System",
        short_name: "Tracker",
        description: "Tracker histórico de entrenamiento con IA local",
        theme_color: "#000000", // Fondo negro para la barra de carga
        background_color: "#000000", // Fondo negro
        display: "standalone", // 👈 CLAVE: Oculta la barra de Safari
        orientation: "portrait",
        icons: [
          {
            src: "apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
          },
        ],
      },
    }),
    babel({ presets: [reactCompilerPreset()] }),
  ],
});
