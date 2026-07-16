import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

// StrictMode reactivado: useStableNodeRef en los useSortable absorbe los
// `null` que React 19 envía durante el cleanup del doble-render de StrictMode,
// manteniendo dnd-kit con los nodos registrados.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
