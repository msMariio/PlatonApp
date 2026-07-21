import { useState, useRef, useEffect, useCallback } from "react";
import { keyframes } from "@emotion/react";
import {
  Box,
  Typography,
  IconButton,
  Button,
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
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  type MensajeChat,
} from "../../core/db";
import {
  enviarMensajeAGemini,
  crearSesionChat,
  agregarMensajeASesion,
  eliminarSesionChat,
} from "./services/geminiService";
import { PageHeader } from "../../components/PageHeader";
import { EmptyStateCard } from "../../components/EmptyStateCard";

/** UUID simple para mensajes */
function msgId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const blinkCursor = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;

const DRAWER_WIDTH = 280;

export function CoachView() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sesionActivaId, setSesionActivaId] = useState<number | undefined>(undefined);
  const [mensajeInput, setMensajeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Leer sesiones de forma reactiva
  const sesiones =
    useLiveQuery(
      () =>
        db.sesiones_chat.orderBy("fechaActualizacion").reverse().toArray(),
      [],
    ) ?? [];

  // Leer sesión activa de forma reactiva
  const sesionActiva = useLiveQuery(
    () =>
      sesionActivaId != null
        ? db.sesiones_chat.get(sesionActivaId)
        : undefined,
    [sesionActivaId],
  );

  // Perfil (para verificar API key)
  const perfil = useLiveQuery(() => db.perfil_usuario.get(1), []);

  // Crear primera sesión si no hay ninguna (usa ref para one-shot)
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    if (sesiones.length > 0) {
      initRef.current = true;
      setSesionActivaId(sesiones[0].id);
    } else if (perfil) {
      initRef.current = true;
      crearSesionChat().then((id) => setSesionActivaId(id));
    }
  }, [sesiones, perfil]);

  // Scroll al final cuando cambian los mensajes o loading
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sesionActiva?.mensajes, loading]);

  const tieneApiKey = perfil?.apiKeyGemini && perfil.apiKeyGemini.trim().length > 0;

  const handleEnviarMensaje = useCallback(async () => {
    const texto = mensajeInput.trim();
    if (!texto || loading) return;

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
      // Error al guardar en DB — mostrar error y abortar
      setErrorMsg("[!] ERROR AL GUARDAR EL MENSAJE LOCALMENTE. Intenta de nuevo.");
      setLoading(false);
      return;
    }

    try {
      // Obtener los mensajes previos (sin el que acabamos de añadir)
      const sesion = await db.sesiones_chat.get(sId);
      const previos = (sesion?.mensajes ?? []).slice(0, -1);

      const respuesta = await enviarMensajeAGemini(texto, previos);

      const msgModelo: MensajeChat = {
        id: msgId(),
        role: "model",
        texto: respuesta,
        timestamp: new Date().toISOString(),
      };
      await agregarMensajeASesion(sId!, msgModelo);
    } catch (err) {
      const errText =
        err instanceof Error ? err.message : "[!] ERROR DESCONOCIDO";
      setErrorMsg(errText);
    } finally {
      setLoading(false);
    }
  }, [mensajeInput, loading, sesionActivaId]);

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
      const restantes = sesiones.filter((s) => s.id !== id);
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

  const formatearTextoMensaje = (texto: string): React.ReactNode[] => {
    return texto.split("\n").map((linea, i) => {
      const tieneNumeros = /\d/.test(linea);
      return (
        <Box key={i}>
          <Typography
            component="span"
            variant="body2"
            sx={
              tieneNumeros
                ? { fontFamily: '"Courier New", Courier, monospace' }
                : undefined
            }
          >
            {linea}
          </Typography>
        </Box>
      );
    });
  };

  // ---- RENDER ----

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
        {sesiones.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography variant="caption" color="text.secondary">
              [ SIN SESIONES // CREA UNA PARA EMPEZAR ]
            </Typography>
          </Box>
        ) : (
          sesiones.map((s) => {
            const esActiva = s.id === sesionActivaId;
            const ultimoMensaje =
              s.mensajes.length > 0
                ? s.mensajes[s.mensajes.length - 1]
                : null;
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
                  >
                    {new Date(s.fechaCreacion).toLocaleDateString("es-ES")}
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

  const renderMensaje = (msg: MensajeChat, idx: number) => {
    const esUser = msg.role === "user";

    return (
      <Box
        key={msg.id ?? idx}
        sx={{
          display: "flex",
          justifyContent: esUser ? "flex-end" : "flex-start",
          mb: 2,
        }}
      >
        <Box
          sx={{
            maxWidth: "85%",
            minWidth: "20%",
            border: "1px solid",
            borderColor: "divider",
            borderLeft: esUser ? undefined : "4px solid",
            borderLeftColor: esUser ? undefined : "primary.main",
            borderRight: esUser ? "4px solid" : undefined,
            borderRightColor: esUser ? "divider" : undefined,
            bgcolor: "background.default",
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
              {esUser ? "ATLETA" : "PERFORMANCE_OS"}
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
            }}
          >
            {formatearTextoMensaje(msg.texto)}
          </Box>
        </Box>
      </Box>
    );
  };

  // Estado: sin API key
  if (!tieneApiKey) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <PageHeader>COACH IA // PERFORMANCE_OS</PageHeader>
        <Card>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <AutoAwesomeRoundedIcon
              sx={{ fontSize: 48, color: "text.secondary", mb: 2 }}
            />
            <Typography
              variant="h6"
              sx={{ letterSpacing: "0.05em", mb: 1 }}
            >
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
        <PageHeader sx={{ flexGrow: 1 }}>
          COACH IA // PERFORMANCE_OS
        </PageHeader>
        {sesionActiva && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ letterSpacing: "0.03em", display: { xs: "none", sm: "block" } }}
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
          border: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          overflow: "hidden",
        }}
      >
        {/* Zona de mensajes */}
        <Box
          sx={{
            flexGrow: 1,
            overflowY: "auto",
            p: 2,
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
                    [ PERFORMANCE_OS ACTIVO // ENVÍA TU PRIMER MENSAJE ]
                  </Typography>
                </Box>
              </EmptyStateCard>
            </Box>
          ) : (
            <>
              {sesionActiva.mensajes.map((msg, idx) =>
                renderMensaje(msg, idx),
              )}
            </>
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
                PERFORMANCE_OS ANALIZANDO
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
            gap: 1,
            p: 2,
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "background.default",
          }}
        >
          <TextField
            fullWidth
            multiline
            maxRows={4}
            minRows={1}
            placeholder="[>] ESCRIBE TU MENSAJE… [ENTER PARA ENVIAR]"
            value={mensajeInput}
            onChange={(e) => {
              setMensajeInput(e.target.value);
              if (errorMsg) setErrorMsg(null);
            }}
            onKeyDown={handleKeyDown}
            disabled={loading}
            slotProps={{
              input: {
                sx: {
                  borderRadius: 0,
                  fontFamily: '"Courier New", Courier, monospace',
                  letterSpacing: "0.03em",
                },
              },
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 0,
              },
            }}
          />
          <Button
            variant="contained"
            color="primary"
            disableElevation
            onClick={handleEnviarMensaje}
            disabled={loading || mensajeInput.trim().length === 0}
            sx={{
              borderRadius: 0,
              minWidth: 56,
              alignSelf: "flex-end",
            }}
            aria-label="Enviar mensaje"
          >
            <SendIcon />
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
