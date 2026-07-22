import { useState, useRef, useEffect, useCallback } from "react";
import { keyframes } from "@emotion/react";
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Card,
  CardContent,
  Drawer,
  alpha,
  CircularProgress,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { useLiveQuery } from "dexie-react-hooks";
import ReactMarkdown from "react-markdown";
import { db, type MensajeChat } from "../../core/db";
import {
  enviarMensajeAGemini,
  enviarRespuestaFuncionAGemini,
  crearSesionChat,
  agregarMensajeASesion,
  actualizarTituloSesion,
  eliminarSesionChat,
  type GeminiResult,
  type FunctionCallProposal,
} from "./services/geminiService";
import { executeFunctionCall } from "./services/toolExecutor";
import type { FunctionCallArgs } from "./services/toolDefinitions";
import { PageHeader } from "../../components/PageHeader";
import { EmptyStateCard } from "../../components/EmptyStateCard";
import { ToolProposalCard } from "./components/ToolProposalCard";

/** UUID simple para mensajes */
function msgId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const blinkCursor = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;

const DRAWER_WIDTH = 280;

/** Umbral de 2 horas para reutilizar la última sesión al abrir el chat. */
const UMBRAL_REUTILIZACION_MS = 2 * 60 * 60 * 1000;

/** Convierte una fecha ISO a texto relativo: "Ahora", "Hace 5 min", "Hace 2h", "Ayer", "Hace 3d". */
function formatearTiempoRelativo(fechaIso: string): string {
  const ahora = Date.now();
  const fecha = new Date(fechaIso).getTime();
  const diffMs = ahora - fecha;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHoras = Math.floor(diffMs / 3600000);
  const diffDias = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHoras < 24) return `Hace ${diffHoras}h`;
  if (diffDias === 1) return "Ayer";
  if (diffDias < 7) return `Hace ${diffDias}d`;
  return new Date(fechaIso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function CoachView() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sesionActivaId, setSesionActivaId] = useState<number | undefined>(
    undefined,
  );
  const [mensajeInput, setMensajeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [procesandoPropuesta, setProcesandoPropuesta] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Leer sesiones de forma reactiva (null = aún no cargado)
  const sesiones = useLiveQuery(
    () => db.sesiones_chat.orderBy("fechaActualizacion").reverse().toArray(),
    [],
  );

  // Leer sesión activa de forma reactiva
  const sesionActiva = useLiveQuery(
    () =>
      sesionActivaId != null ? db.sesiones_chat.get(sesionActivaId) : undefined,
    [sesionActivaId],
  );

  // Perfil (para verificar API key)
  const perfil = useLiveQuery(() => db.perfil_usuario.get(1), []);

  // Nombre del coach (personalizado o por defecto)
  const coachName = perfil?.nombreCoach?.trim() || "PERFORMANCE_OS";

  // Inicializar sesión: esperar a que las sesiones estén cargadas,
  // luego reutilizar la última si está dentro del umbral, o crear nueva.
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    // Esperar a que la query de sesiones se resuelva (null = aún cargando)
    if (!sesiones) return;
    if (sesiones.length > 0) {
      const ultimaSesion = sesiones[0];
      const haceUmbral = Date.now() - UMBRAL_REUTILIZACION_MS;
      const fechaActualizacion = new Date(ultimaSesion.fechaActualizacion).getTime();
      if (fechaActualizacion > haceUmbral) {
        // Última sesión reciente → reutilizar
        initRef.current = true;
        setSesionActivaId(ultimaSesion.id);
        return;
      }
    }
    // Sin sesiones, sesiones caducadas, o con perfil cargado → crear nueva
    if (perfil) {
      initRef.current = true;
      crearSesionChat().then((id) => setSesionActivaId(id));
    }
  }, [sesiones, perfil]);

  // Scroll al final cuando cambian los mensajes o loading
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sesionActiva?.mensajes, loading, procesandoPropuesta]);

  const tieneApiKey =
    perfil?.apiKeyGemini && perfil.apiKeyGemini.trim().length > 0;

  // ── Detectar si hay una propuesta pendiente ───────────────────────
  const mensajes = sesionActiva?.mensajes ?? [];

  // Buscar el índice del último functionCall del modelo (el más reciente)
  const lastFCIdx = mensajes.reduceRight<number>(
    (found, m, i) =>
      found >= 0
        ? found
        : m.role === "model" && m.functionCall != null
          ? i
          : -1,
    -1,
  );

  // Una propuesta está pendiente si el último functionCall no ha sido
  // respondido (ni confirmado ni cancelado) en mensajes posteriores.
  const hayPropuestaPendiente =
    lastFCIdx >= 0 &&
    !mensajes
      .slice(lastFCIdx + 1)
      .some(
        (m) =>
          m.role === "user" &&
          (m.functionResponse != null ||
            m.texto === "[PROPUESTA CANCELADA POR EL USUARIO]"),
      );

  const inputBloqueado =
    hayPropuestaPendiente || loading || procesandoPropuesta;

  /**
   * Ejecuta todas las functionCalls pendientes de una sesión.
   * Las busca iterando los mensajes del modelo que tienen functionCall
   * y que aún no tienen functionResponse en un mensaje de usuario posterior.
   */
  const ejecutarAccionesPendientes = useCallback(async (sId: number) => {
    const sesion = await db.sesiones_chat.get(sId);
    if (!sesion) return;

    const mensajes = sesion.mensajes;

    // Encontrar functionCalls del modelo que no han sido respondidos
    for (let i = 0; i < mensajes.length; i++) {
      const m = mensajes[i];
      if (m.role === "model" && m.functionCall) {
        // Verificar si ya fue respondido en mensajes posteriores
        const yaRespondido = mensajes
          .slice(i + 1)
          .some(
            (post) =>
              post.role === "user" &&
              (post.functionResponse?.name === m.functionCall!.name ||
                post.texto === "[PROPUESTA CANCELADA POR EL USUARIO]"),
          );

        if (yaRespondido) continue;

        // Ejecutar la función
        try {
          const result = await executeFunctionCall({
            name: m.functionCall.name,
            args: m.functionCall.args,
          } as unknown as FunctionCallArgs);

          const success = result?.success === true;
          const msgRespuesta: MensajeChat = {
            id: msgId(),
            role: "user",
            texto: success
              ? `[✓] ${m.functionCall.name} ejecutado correctamente.`
              : `[✗] ${m.functionCall.name} falló: ${result?.message ?? "error desconocido"}`,
            timestamp: new Date().toISOString(),
            functionResponse: {
              name: m.functionCall.name,
              response: result as unknown as Record<string, unknown>,
            },
          };
          await agregarMensajeASesion(sId, msgRespuesta);
        } catch (err) {
          const errMsg =
            err instanceof Error ? err.message : "error desconocido";
          const msgRespuesta: MensajeChat = {
            id: msgId(),
            role: "user",
            texto: `[✗] ${m.functionCall.name} falló: ${errMsg}`,
            timestamp: new Date().toISOString(),
            functionResponse: {
              name: m.functionCall.name,
              response: {
                success: false,
                error: errMsg,
              },
            },
          };
          await agregarMensajeASesion(sId, msgRespuesta);
        }
      }
    }
  }, []);

  /**
   * Procesa la respuesta de Gemini: guarda el mensaje del modelo.
   * Si incluye functionCalls, los guarda como parte del mensaje para que
   * la UI muestre la tarjeta de propuesta.
   */
  const procesarRespuestaGemini = useCallback(
    async (sId: number, resultado: GeminiResult) => {
      const texto = resultado.texto ?? "";
      const fcs = resultado.functionCalls;

      if (fcs.length > 0) {
        // Guardar cada functionCall como un mensaje del modelo
        for (const fc of fcs) {
          const msgModelo: MensajeChat = {
            id: msgId(),
            role: "model",
            texto: texto,
            timestamp: new Date().toISOString(),
            functionCall: {
              name: fc.name,
              args: fc.args,
              thoughtSignature: fc.thoughtSignature,
            },
          };
          await agregarMensajeASesion(sId, msgModelo);
        }
      } else if (texto) {
        // Solo texto, sin functionCalls
        const msgModelo: MensajeChat = {
          id: msgId(),
          role: "model",
          texto: texto,
          timestamp: new Date().toISOString(),
        };
        await agregarMensajeASesion(sId, msgModelo);
      }
    },
    [],
  );

  const handleEnviarMensaje = useCallback(async () => {
    const texto = mensajeInput.trim();
    if (!texto || loading || procesandoPropuesta) return;

    // Si hay una propuesta pendiente, no permitir enviar hasta resolverla
    if (hayPropuestaPendiente) return;

    let sId = sesionActivaId;

    // Crear sesión si no hay
    if (sId == null) {
      sId = await crearSesionChat();
      setSesionActivaId(sId);
    }

    setMensajeInput("");
    setErrorMsg(null);
    setLoading(true);

    // Push optimista del mensaje del usuario
    const msgUsuario: MensajeChat = {
      id: msgId(),
      role: "user",
      texto,
      timestamp: new Date().toISOString(),
    };

    try {
      await agregarMensajeASesion(sId, msgUsuario);
    } catch {
      setErrorMsg(
        "[!] ERROR AL GUARDAR EL MENSAJE LOCALMENTE. Intenta de nuevo.",
      );
      setLoading(false);
      return;
    }

    // Actualizar título con el primer mensaje del usuario
    try {
      const sesion = await db.sesiones_chat.get(sId);
      if (sesion && sesion.titulo === "Nueva sesión") {
        const tituloLimpio = texto.replace(/\n+/g, " ").trim();
        const titulo =
          tituloLimpio.length > 50
            ? tituloLimpio.slice(0, 50) + "…"
            : tituloLimpio;
        await actualizarTituloSesion(sId, titulo);
      }
    } catch {
      // Error silencioso: el título no es crítico
    }

    try {
      // Obtener los mensajes previos (sin el que acabamos de añadir)
      const sesion = await db.sesiones_chat.get(sId);
      const previos = (sesion?.mensajes ?? []).slice(0, -1);

      const resultado = await enviarMensajeAGemini(texto, previos);

      // Procesar respuesta (puede incluir texto y/o functionCalls)
      await procesarRespuestaGemini(sId, resultado);
    } catch (err) {
      const errText =
        err instanceof Error ? err.message : "[!] ERROR DESCONOCIDO";
      setErrorMsg(errText);
    } finally {
      setLoading(false);
    }
  }, [
    mensajeInput,
    loading,
    procesandoPropuesta,
    sesionActivaId,
    hayPropuestaPendiente,
    procesarRespuestaGemini,
  ]);

  /**
   * El usuario confirma la propuesta. Ejecuta las herramientas y
   * notifica a Gemini del resultado.
   */
  const handleConfirmarPropuesta = useCallback(async () => {
    if (!sesionActivaId) return;

    setProcesandoPropuesta(true);
    setErrorMsg(null);

    const sId = sesionActivaId;

    try {
      await ejecutarAccionesPendientes(sId);

      // Re-send to Gemini for follow-up response
      const sesionActualizada = await db.sesiones_chat.get(sId);
      if (sesionActualizada) {
        const resultadoGemini = await enviarRespuestaFuncionAGemini(
          sesionActualizada.mensajes,
        );

        if (resultadoGemini.texto || resultadoGemini.functionCalls.length > 0) {
          await procesarRespuestaGemini(sId, resultadoGemini);
        }
      }
    } catch (err) {
      const errText =
        err instanceof Error ? err.message : "[!] ERROR DESCONOCIDO";
      setErrorMsg(errText);
    } finally {
      setProcesandoPropuesta(false);
    }
  }, [sesionActivaId, ejecutarAccionesPendientes, procesarRespuestaGemini]);

  /**
   * El usuario cancela la propuesta. Notifica a Gemini para que ofrezca
   * una alternativa.
   */
  const handleCancelarPropuesta = useCallback(async () => {
    if (!hayPropuestaPendiente || !sesionActivaId) return;

    setProcesandoPropuesta(true);
    setErrorMsg(null);

    const sId = sesionActivaId;

    // Guardar mensaje de cancelación
    const msgCancel: MensajeChat = {
      id: msgId(),
      role: "user",
      texto: "[PROPUESTA CANCELADA POR EL USUARIO]",
      timestamp: new Date().toISOString(),
    };
    await agregarMensajeASesion(sId, msgCancel);

    // Re-send to Gemini for alternative
    try {
      const sesionActualizada = await db.sesiones_chat.get(sId);
      if (sesionActualizada) {
        const resultadoGemini = await enviarRespuestaFuncionAGemini(
          sesionActualizada.mensajes,
        );

        if (resultadoGemini.texto || resultadoGemini.functionCalls.length > 0) {
          await procesarRespuestaGemini(sId, resultadoGemini);
        }
      }
    } catch (err) {
      const errText =
        err instanceof Error ? err.message : "[!] ERROR DESCONOCIDO";
      setErrorMsg(errText);
    } finally {
      setProcesandoPropuesta(false);
    }
  }, [hayPropuestaPendiente, sesionActivaId, procesarRespuestaGemini]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEnviarMensaje();
    }
  };

  const handleNuevaSesion = async () => {
    const id = await crearSesionChat();
    setSesionActivaId(id);
    setSidebarOpen(false);
  };

  const handleEliminarSesion = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("¿ELIMINAR ESTA SESIÓN DE CHAT?")) return;
    await eliminarSesionChat(id);
    if (sesionActivaId === id) {
      const restantes = (sesiones ?? []).filter((s) => s.id !== id);
      setSesionActivaId(restantes.length > 0 ? restantes[0].id : undefined);
    }
  };

  const formatearTimestamp = (ts: string): string => {
    return new Date(ts).toLocaleString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  };

  /** Componentes personalizados para ReactMarkdown con estética industrial/consola. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markdownComponents: any = {
    p: ({ children }: { children?: React.ReactNode }) => (
      <Typography variant="body2" sx={{ mb: 0.5, lineHeight: 1.6 }}>
        {children}
      </Typography>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <Box component="span" sx={{ fontWeight: "bold", color: "primary.main" }}>
        {children}
      </Box>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
      <Box component="span" sx={{ fontStyle: "italic" }}>
        {children}
      </Box>
    ),
    code: ({ children }: { children?: React.ReactNode }) => (
      <Box
        component="code"
        sx={{
          fontFamily: '"Courier New", Courier, monospace',
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
          px: 0.5,
          py: 0.25,
          fontSize: "0.85em",
        }}
      >
        {children}
      </Box>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <Box component="ul" sx={{ pl: 2.5, mb: 1, mt: 0.5 }}>
        {children}
      </Box>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <Box component="ol" sx={{ pl: 2.5, mb: 1, mt: 0.5 }}>
        {children}
      </Box>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <Box component="li" sx={{ mb: 0.25 }}>
        <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
          {children}
        </Typography>
      </Box>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <Box
        sx={{
          borderLeft: "3px solid",
          borderColor: "primary.main",
          pl: 1.5,
          my: 1,
          opacity: 0.85,
        }}
      >
        {children}
      </Box>
    ),
    h1: ({ children }: { children?: React.ReactNode }) => (
      <Typography variant="h6" sx={{ fontWeight: "bold", mb: 0.5, mt: 1 }}>
        {children}
      </Typography>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: "bold", mb: 0.5, mt: 1 }}
      >
        {children}
      </Typography>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <Typography
        variant="subtitle2"
        sx={{ fontWeight: "bold", mb: 0.5, mt: 0.75 }}
      >
        {children}
      </Typography>
    ),
    hr: () => <Box sx={{ borderTop: 1, borderColor: "divider", my: 1.5 }} />,
  };

  // ── Render ─────────────────────────────────────────────────────────

  const renderSidebar = () => (
    <Box
      sx={{
        width: DRAWER_WIDTH,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
        borderRight: 1,
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      {/* Header del sidebar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography
          variant="button"
          sx={{ letterSpacing: "0.05em", fontWeight: "bold" }}
        >
          SESIONES
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={handleNuevaSesion}
            sx={{ borderRadius: 0, color: "primary.main" }}
            aria-label="Nueva sesión"
          >
            <AddIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => setSidebarOpen(false)}
            sx={{ borderRadius: 0 }}
            aria-label="Cerrar panel"
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Lista de sesiones */}
      <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
        {!sesiones || sesiones.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography variant="caption" color="text.secondary">
              [ SIN SESIONES // CREA UNA PARA EMPEZAR ]
            </Typography>
          </Box>
        ) : (
          sesiones.map((s) => {
            const esActiva = s.id === sesionActivaId;
            const ultimoMensaje =
              s.mensajes.length > 0 ? s.mensajes[s.mensajes.length - 1] : null;
            return (
              <Box
                key={s.id}
                onClick={() => {
                  setSesionActivaId(s.id);
                  setSidebarOpen(false);
                }}
                sx={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  p: 2,
                  borderBottom: 1,
                  borderColor: "divider",
                  borderLeft: esActiva ? 4 : 0,
                  borderLeftColor: "primary.main",
                  bgcolor: esActiva
                    ? (theme) => alpha(theme.palette.primary.main, 0.08)
                    : "transparent",
                  "&:hover": {
                    bgcolor: "action.hover",
                  },
                  transition: "background-color 0.15s",
                }}
              >
                <Box sx={{ minWidth: 0, flexGrow: 1, mr: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: esActiva ? "bold" : "normal",
                      letterSpacing: "0.03em",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.titulo.toUpperCase()}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      mt: 0.5,
                    }}
                  >
                    {ultimoMensaje
                      ? ultimoMensaje.texto.slice(0, 60) +
                        (ultimoMensaje.texto.length > 60 ? "…" : "")
                      : "[ VACÍA ]"}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 0.25, fontSize: "0.65rem" }}
                    title={new Date(s.fechaActualizacion).toLocaleString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  >
                    {formatearTiempoRelativo(s.fechaActualizacion)}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={(e) => handleEliminarSesion(s.id!, e)}
                  sx={{
                    borderRadius: 0,
                    color: "text.secondary",
                    "&:hover": { color: "error.main" },
                    flexShrink: 0,
                    mt: 0.5,
                  }}
                  aria-label="Eliminar sesión"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );

  /**
   * Renderiza un mensaje individual. Si es un mensaje del modelo con
   * functionCall, muestra la tarjeta de propuesta. Si es un mensaje de
   * usuario con functionResponse, muestra un resumen de la ejecución.
   */
  const renderMensaje = (msg: MensajeChat, idx: number) => {
    const esUser = msg.role === "user";
    const esPropuesta = !esUser && msg.functionCall != null;
    const esRespuestaTool = esUser && msg.functionResponse != null;

    if (esPropuesta) {
      // Agrupar todos los functionCalls del mismo turno
      // (consecutivos sin user entre ellos) y trackear el índice final
      const funcionesDelTurno: FunctionCallProposal[] = [];
      let endIdx = idx;
      for (let i = idx; i < mensajes.length; i++) {
        const m = mensajes[i];
        if (m.role === "model" && m.functionCall && !m.functionResponse) {
          funcionesDelTurno.push({
            name: m.functionCall.name,
            args: m.functionCall.args,
          });
          endIdx = i;
        } else if (m.role === "user") {
          break;
        }
      }

      // Solo renderizar la tarjeta en el primer functionCall del turno
      const esPrimeroDelTurno =
        idx === 0 ||
        !mensajes[idx - 1]?.functionCall ||
        mensajes[idx - 1]?.role !== "model";

      if (!esPrimeroDelTurno) return null;

      // Determinar si esta propuesta es pendiente: lastFCIdx debe caer
      // dentro del rango [idx, endIdx] de este turno agrupado.
      const esPropuestaPendiente =
        hayPropuestaPendiente && lastFCIdx >= idx && lastFCIdx <= endIdx;

      return (
        <Box key={msg.id ?? idx} sx={{ mb: 2 }}>
          {/* Header del modelo */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 0.5,
            }}
          >
            <AutoAwesomeRoundedIcon
              sx={{ fontSize: 14, color: "primary.main" }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ letterSpacing: "0.05em" }}
            >
              {coachName}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: "0.6rem" }}
            >
              {formatearTimestamp(msg.timestamp)}
            </Typography>
          </Box>

          {esPropuestaPendiente ? (
            /* Propuesta pendiente: mostrar tarjeta interactiva */
            <ToolProposalCard
              proposals={funcionesDelTurno}
              explanation={msg.texto || null}
              onConfirm={handleConfirmarPropuesta}
              onCancel={handleCancelarPropuesta}
              disabled={procesandoPropuesta}
            />
          ) : (
            /* Propuesta ya resuelta (confirmada o cancelada) */
            <Box
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderLeft: "4px solid",
                borderLeftColor: "text.secondary",
                bgcolor: "background.default",
                p: 1.5,
                maxWidth: "85%",
                minWidth: 0,
                overflow: "hidden",
                overflowWrap: "break-word",
                wordBreak: "break-word",
                opacity: 0.7,
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ letterSpacing: "0.05em" }}
              >
                [ ACCIÓN YA RESUELTA ]
              </Typography>
              {funcionesDelTurno.map((fc, fi) => (
                <Box
                  key={fi}
                  sx={{
                    mt: 0.5,
                    minWidth: 0,
                    overflowWrap: "break-word",
                    wordBreak: "break-word",
                  }}
                >
                  <Typography variant="caption" color="text.primary">
                    → {fc.name}:
                  </Typography>{" "}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ overflowWrap: "break-word", wordBreak: "break-word" }}
                  >
                    {JSON.stringify(fc.args)}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      );
    }

    if (esRespuestaTool) {
      // Mostrar resultado de ejecución de forma compacta
      const success = msg.functionResponse?.response?.success;
      return (
        <Box
          key={msg.id ?? idx}
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mb: 2,
          }}
        >
          <Box
            sx={{
              maxWidth: "85%",
              minWidth: "20%",
              border: "1px solid",
              borderColor: success ? "primary.main" : "error.main",
              borderRight: "4px solid",
              borderRightColor: success ? "primary.main" : "error.main",
              bgcolor: (theme) =>
                alpha(
                  success
                    ? theme.palette.primary.main
                    : theme.palette.error.main,
                  0.05,
                ),
              p: 1.5,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 0.5,
              }}
            >
              {success ? (
                <CheckCircleIcon sx={{ fontSize: 14, color: "primary.main" }} />
              ) : (
                <ErrorIcon sx={{ fontSize: 14, color: "error.main" }} />
              )}
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ letterSpacing: "0.05em" }}
              >
                SISTEMA
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.6rem" }}
              >
                {formatearTimestamp(msg.timestamp)}
              </Typography>
            </Box>
            <Typography
              variant="body2"
              color={success ? "primary.main" : "error.main"}
              sx={{ lineHeight: 1.5 }}
            >
              {msg.texto}
            </Typography>
          </Box>
        </Box>
      );
    }

    // Mensaje normal (texto)
    return (
      <Box
        key={msg.id ?? idx}
        sx={{
          display: "flex",
          justifyContent: esUser ? "flex-end" : "",
          mb: 2,
        }}
      >
        <Box
          sx={{
            maxWidth: "85%",
            minWidth: "20%",
            border: esUser ? "1px solid" : undefined,
            borderColor: "divider",
            borderLeft: esUser ? undefined : undefined,
            borderLeftColor: esUser ? undefined : undefined,
            borderRight: esUser ? "4px solid" : undefined,
            borderRightColor: esUser ? "divider" : undefined,
            // backgroundColor: esUser ? alpha("#1976d2", 0.05) : undefined,
            bgcolor: esUser ? "background.paper" : undefined,
            p: 1.5,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 0.5,
            }}
          >
            {!esUser && (
              <AutoAwesomeRoundedIcon
                sx={{ fontSize: 14, color: "primary.main" }}
              />
            )}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ letterSpacing: "0.05em" }}
            >
              {esUser ? "YO" : coachName}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: "0.6rem" }}
            >
              {formatearTimestamp(msg.timestamp)}
            </Typography>
          </Box>
          <Box
            sx={{
              color: "text.primary",
              lineHeight: 1.6,
              "& p:first-of-type": { mt: 0 },
              "& p:last-of-type": { mb: 0 },
            }}
          >
            <ReactMarkdown components={markdownComponents}>
              {msg.texto}
            </ReactMarkdown>
          </Box>
        </Box>
      </Box>
    );
  };

  // Estado: sin API key
  if (!tieneApiKey) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <PageHeader>ENTRENADOR // {coachName}</PageHeader>
        <Card>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <AutoAwesomeRoundedIcon
              sx={{ fontSize: 48, color: "text.secondary", mb: 2 }}
            />
            <Typography variant="h6" sx={{ letterSpacing: "0.05em", mb: 1 }}>
              [ API KEY NO CONFIGURADA ]
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              VE A AJUSTES &gt; CONFIGURACIÓN IA PARA AÑADIR TU GEMINI API KEY
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block" }}
            >
              LA CLAVE SE ALMACENA EXCLUSIVAMENTE EN TU DISPOSITIVO (IndexedDB)
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: 0,
      }}
    >
      {/* Barra superior */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 2,
        }}
      >
        <IconButton
          onClick={() => setSidebarOpen(true)}
          sx={{ borderRadius: 0 }}
          aria-label="Abrir sesiones"
        >
          <MenuIcon />
        </IconButton>
        <PageHeader sx={{ flexGrow: 1 }}>ENTRENADOR// {coachName}</PageHeader>
        {sesionActiva && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              letterSpacing: "0.03em",
              display: { xs: "none", sm: "block" },
            }}
          >
            {sesionActiva.titulo.toUpperCase()}
          </Typography>
        )}
      </Box>

      {/* Drawer lateral */}
      <Drawer
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 0,
              borderRight: 1,
              borderColor: "divider",
              bgcolor: "background.default",
            },
          },
        }}
      >
        {renderSidebar()}
      </Drawer>

      {/* Área principal del chat */}
      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          borderColor: "divider",
          // bgcolor: "background.paper",
          overflow: "hidden",
        }}
      >
        {/* Zona de mensajes */}
        <Box
          sx={{
            flexGrow: 1,
            overflowY: "auto",

            display: "flex",
            flexDirection: "column",
          }}
        >
          {!sesionActiva || sesionActiva.mensajes.length === 0 ? (
            <Box
              sx={{
                flexGrow: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <EmptyStateCard height={200}>
                <Box sx={{ textAlign: "center" }}>
                  <AutoAwesomeRoundedIcon
                    sx={{ fontSize: 32, color: "text.secondary", mb: 1 }}
                  />
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ letterSpacing: "0.05em" }}
                  >
                    [ {coachName} ACTIVO // ENVÍA TU PRIMER MENSAJE ]
                  </Typography>
                </Box>
              </EmptyStateCard>
            </Box>
          ) : (
            <>{mensajes.map((msg, idx) => renderMensaje(msg, idx))}</>
          )}

          {/* Error */}
          {errorMsg && (
            <Box
              sx={{
                p: 1.5,
                mb: 2,
                border: 1,
                borderColor: "error.main",
                bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
              }}
            >
              <Typography
                variant="caption"
                color="error.main"
                sx={{ letterSpacing: "0.03em" }}
              >
                {errorMsg}
              </Typography>
            </Box>
          )}

          {/* Indicador de carga */}
          {loading && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1.5,
                borderLeft: "4px solid",
                borderLeftColor: "primary.main",
                bgcolor: (theme) => alpha(theme.palette.action.hover, 0.4),
                maxWidth: "60%",
                mb: 2,
              }}
            >
              <AutoAwesomeRoundedIcon
                sx={{ fontSize: 14, color: "primary.main" }}
              />
              <Typography
                variant="body2"
                color="primary.main"
                sx={{
                  fontFamily: '"Courier New", Courier, monospace',
                  letterSpacing: "0.05em",
                }}
              >
                {coachName} ANALIZANDO
              </Typography>
              <CircularProgress
                size={12}
                sx={{ color: "primary.main", ml: 1 }}
              />
              <Box
                component="span"
                sx={{
                  color: "primary.main",
                  animation: `${blinkCursor} 1s steps(1) infinite`,
                  fontSize: "1rem",
                  fontFamily: "monospace",
                }}
              >
                _
              </Box>
            </Box>
          )}

          {/* Indicador de procesando propuesta */}
          {procesandoPropuesta && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1.5,
                borderLeft: "4px solid",
                borderLeftColor: "primary.main",
                bgcolor: (theme) => alpha(theme.palette.action.hover, 0.4),
                maxWidth: "60%",
                mb: 2,
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 14, color: "primary.main" }} />
              <Typography
                variant="body2"
                color="primary.main"
                sx={{
                  fontFamily: '"Courier New", Courier, monospace',
                  letterSpacing: "0.05em",
                }}
              >
                EJECUTANDO ACCIÓN
              </Typography>
              <CircularProgress
                size={12}
                sx={{ color: "primary.main", ml: 1 }}
              />
              <Box
                component="span"
                sx={{
                  color: "primary.main",
                  animation: `${blinkCursor} 1s steps(1) infinite`,
                  fontSize: "1rem",
                  fontFamily: "monospace",
                }}
              >
                _
              </Box>
            </Box>
          )}

          <div ref={chatEndRef} />
        </Box>

        {/* Input de mensaje */}
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            gap: 0.5,
            px: 1.5,
            py: 0.5,
            mx: 2,
            mb: 2,
            border: 1,
            borderColor: inputBloqueado ? "divider" : "primary.main",
            bgcolor: "background.paper",
            transition: "border-color 0.2s",
            "&:focus-within": {
              borderColor: "primary.main",
            },
          }}
        >
          <TextField
            fullWidth
            multiline
            maxRows={4}
            minRows={1}
            variant="standard"
            placeholder={
              inputBloqueado
                ? "[>] RESUELVE LA PROPUESTA ANTES DE CONTINUAR…"
                : "Pregunta lo que quieras"
            }
            value={mensajeInput}
            onChange={(e) => {
              setMensajeInput(e.target.value);
              if (errorMsg) setErrorMsg(null);
            }}
            onKeyDown={handleKeyDown}
            disabled={inputBloqueado}
            slotProps={{
              input: {
                disableUnderline: true,
                sx: {
                  fontFamily: '"Courier New", Courier, monospace',
                  letterSpacing: "0.03em",
                  py: 1,
                },
              },
            }}
            sx={{
              "& .MuiInputBase-root": {
                borderRadius: 0,
              },
            }}
          />
          <IconButton
            onClick={handleEnviarMensaje}
            disabled={inputBloqueado || mensajeInput.trim().length === 0}
            sx={{
              borderRadius: 0,
              color: "primary.main",
              flexShrink: 0,
              "&.Mui-disabled": { color: "text.disabled" },
            }}
            aria-label="Enviar mensaje"
          >
            <SendIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}
