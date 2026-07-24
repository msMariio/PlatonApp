import {
  Component,
  StrictMode,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * ErrorBoundary raíz: atrapa cualquier excepción no controlada durante el
 * render/efectos y la muestra en pantalla, en vez de dejar el `#root`
 * vacío (que es lo que provocaba que la PWA se quedase en blanco en iOS).
 *
 * Sin él, React 19 desmonta todo el árbol ante cualquier throw y deja
 * la app completamente en blanco, sin señal alguna del error real.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[PlatonApp] ErrorBoundary:", error, info);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div
          style={{
            padding: 16,
            background: "#000",
            color: "#adff2f",
            minHeight: "100vh",
            fontFamily: '"Courier New", Courier, monospace',
            whiteSpace: "pre-wrap",
            overflow: "auto",
          }}
        >
          <h2 style={{ marginTop: 0 }}>{"// ERROR PWA //"}</h2>
          <p
            style={{
              color: "#ff4444",
              fontWeight: "bold",
              marginBottom: 12,
            }}
          >
            {error.name}: {error.message}
          </p>
          <pre
            style={{
              fontSize: 12,
              color: "#888",
              margin: 0,
              overflow: "auto",
            }}
          >
            {error.stack ?? "(sin stack)"}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// StrictMode reactivado: useStableNodeRef en los useSortable absorbe los
// `null` que React 19 envía durante el cleanup del doble-render de StrictMode,
// manteniendo dnd-kit con los nodos registrados.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
