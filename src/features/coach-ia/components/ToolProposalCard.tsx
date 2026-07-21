import { Box, Typography, Button, alpha } from "@mui/material";
import ReactMarkdown from "react-markdown";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import ListAltIcon from "@mui/icons-material/ListAlt";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import type { FunctionCallProposal } from "../services/geminiService";

type Props = {
  proposals: FunctionCallProposal[];
  /** Texto explicativo del modelo que acompaña las propuestas. */
  explanation: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
};

const toolIcons: Record<string, React.ReactNode> = {
  crear_carpeta: <CreateNewFolderIcon sx={{ fontSize: 14 }} />,
  crear_ejercicio: <FitnessCenterIcon sx={{ fontSize: 14 }} />,
  crear_rutina: <ListAltIcon sx={{ fontSize: 14 }} />,
  actualizar_planificacion_semanal: <CalendarMonthIcon sx={{ fontSize: 14 }} />,
};

const toolLabels: Record<string, string> = {
  crear_carpeta: "CREAR CARPETA",
  crear_ejercicio: "CREAR EJERCICIO",
  crear_rutina: "CREAR RUTINA",
  actualizar_planificacion_semanal: "PLANIFICAR SEMANA",
};

/**
 * Renderiza los argumentos de una propuesta de forma legible.
 */
function renderArgs(name: string, args: Record<string, unknown>): React.ReactNode {
  switch (name) {
    case "crear_carpeta":
      return (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            NOMBRE:
          </Typography>{" "}
          <Typography variant="caption" color="text.primary" sx={{ fontWeight: "bold" }}>
            {String(args.nombre ?? "")}
          </Typography>
        </Box>
      );

    case "crear_ejercicio":
      return (
        <Box sx={{ mt: 0.5 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              NOMBRE:
            </Typography>{" "}
            <Typography variant="caption" color="text.primary" sx={{ fontWeight: "bold" }}>
              {String(args.nombre ?? "")}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              GRUPO:
            </Typography>{" "}
            <Typography variant="caption" color="text.primary">
              {String(args.grupoMuscular ?? "").toUpperCase()}
            </Typography>
          </Box>
          {typeof args.tipo === "string" && args.tipo.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                TIPO:
              </Typography>{" "}
              <Typography variant="caption" color="text.primary">
                {String(args.tipo).toUpperCase()}
              </Typography>
            </Box>
          )}
          {typeof args.descripcion === "string" && args.descripcion.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                NOTAS:
              </Typography>{" "}
              <Typography variant="caption" color="text.primary">
                {String(args.descripcion)}
              </Typography>
            </Box>
          )}
        </Box>
      );

    case "crear_rutina": {
      const ejercicios = args.ejercicios as Array<Record<string, unknown>> | undefined;
      return (
        <Box sx={{ mt: 0.5 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              RUTINA:
            </Typography>{" "}
            <Typography variant="caption" color="text.primary" sx={{ fontWeight: "bold" }}>
              {String(args.nombre ?? "")}
            </Typography>
          </Box>
          {typeof args.carpetaNombre === "string" && args.carpetaNombre.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                CARPETA:
              </Typography>{" "}
              <Typography variant="caption" color="text.primary">
                {String(args.carpetaNombre)}
              </Typography>
            </Box>
          )}
          {typeof args.descripcion === "string" && args.descripcion.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                DESCRIPCIÓN:
              </Typography>{" "}
              <Typography variant="caption" color="text.primary">
                {String(args.descripcion)}
              </Typography>
            </Box>
          )}
          {ejercicios && ejercicios.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ letterSpacing: "0.05em", display: "block", mb: 0.5 }}
              >
                [ EJERCICIOS ]
              </Typography>
              {ejercicios.map((ej, idx) => (
                <Box
                  key={idx}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    ml: 1,
                    mb: 0.25,
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontFamily: "monospace", minWidth: 16 }}
                  >
                    {String(idx + 1).padStart(2, "0")}.
                  </Typography>
                  <Typography variant="caption" color="text.primary">
                    {String(ej.ejercicioNombre ?? ej.ejercicioId ?? "?")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {String(ej.series ?? "?")}x{String(ej.repsObjetivo ?? "?")}
                  </Typography>
                  {ej.pesoObjetivo != null && (
                    <Typography variant="caption" color="text.secondary">
                      @{String(ej.pesoObjetivo)}kg
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      );
    }

    case "actualizar_planificacion_semanal": {
      const dias = args.dias as Record<string, string | null> | undefined;
      if (!dias) return null;
      const diasNombres: Record<string, string> = {
        lunes: "L",
        martes: "M",
        miercoles: "X",
        jueves: "J",
        viernes: "V",
        sabado: "S",
        domingo: "D",
      };
      return (
        <Box sx={{ mt: 1 }}>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {Object.entries(diasNombres).map(([dia, abrev]) => {
              const valor = dias[dia];
              const esDescanso = valor === null || valor === undefined || valor === "";
              return (
                <Box
                  key={dia}
                  sx={{
                    border: 1,
                    borderColor: esDescanso ? "text.disabled" : "primary.main",
                    bgcolor: esDescanso
                      ? "transparent"
                      : (theme) => alpha(theme.palette.primary.main, 0.1),
                    px: 1,
                    py: 0.5,
                    textAlign: "center",
                    minWidth: 32,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: esDescanso ? "text.secondary" : "primary.main",
                      fontFamily: "monospace",
                    }}
                  >
                    {abrev}
                  </Typography>
                  {!esDescanso && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        color: "primary.main",
                        fontFamily: "monospace",
                        fontSize: "0.6rem",
                      }}
                    >
                      ✓
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      );
    }

    default:
      return (
        <Box sx={{ mt: 0.5 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              fontSize: "0.65rem",
            }}
          >
            {JSON.stringify(args, null, 2)}
          </Typography>
        </Box>
      );
  }
}

/**
 * Tarjeta de propuesta de herramienta con estética industrial/consola.
 * Muestra los argumentos de la función y botones CONFIRMAR / CANCELAR.
 */
export function ToolProposalCard({
  proposals,
  explanation,
  onConfirm,
  onCancel,
  disabled,
}: Props) {
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderLeft: "4px solid",
        borderLeftColor: "primary.main",
        bgcolor: "background.default",
        p: 1.5,
        mb: 2,
        maxWidth: "85%",
      }}
    >
      {/* Header with count badge */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 1,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            letterSpacing: "0.08em",
            fontFamily: "monospace",
          }}
        >
          [ ACCIÓN{proposals.length > 1 ? "ES" : ""} PROPUESTA{proposals.length > 1 ? "S" : ""} ]
        </Typography>
        {proposals.length > 1 && (
          <Box
            sx={{
              border: 1,
              borderColor: "primary.main",
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.15),
              px: 1,
              py: 0.25,
            }}
          >
            <Typography
              variant="caption"
              color="primary.main"
              sx={{ fontFamily: "monospace", fontWeight: "bold", fontSize: "0.65rem" }}
            >
              {proposals.length}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Explanation text */}
      {explanation && (
        <Box
          sx={{
            mb: 1.5,
            "& p:first-of-type": { mt: 0 },
            "& p:last-of-type": { mb: 0 },
          }}
        >
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <Typography variant="body2" sx={{ lineHeight: 1.5, mb: 0.5 }}>
                  {children}
                </Typography>
              ),
              strong: ({ children }) => (
                <Box component="span" sx={{ fontWeight: "bold", color: "primary.main" }}>
                  {children}
                </Box>
              ),
              em: ({ children }) => (
                <Box component="span" sx={{ fontStyle: "italic" }}>
                  {children}
                </Box>
              ),
              code: ({ children }) => (
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
              ul: ({ children }) => (
                <Box component="ul" sx={{ pl: 2.5, mb: 0.5, mt: 0 }}>
                  {children}
                </Box>
              ),
              ol: ({ children }) => (
                <Box component="ol" sx={{ pl: 2.5, mb: 0.5, mt: 0 }}>
                  {children}
                </Box>
              ),
              li: ({ children }) => (
                <Box component="li" sx={{ mb: 0.25 }}>
                  <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                    {children}
                  </Typography>
                </Box>
              ),
              blockquote: ({ children }) => (
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
              hr: () => (
                <Box sx={{ borderTop: 1, borderColor: "divider", my: 1 }} />
              ),
            }}
          >
            {explanation}
          </ReactMarkdown>
        </Box>
      )}

      {/* Tool cards */}
      {proposals.map((proposal, idx) => (
        <Box
          key={idx}
          sx={{
            border: 1,
            borderColor: "divider",
            bgcolor: (theme) => alpha(theme.palette.action.hover, 0.3),
            p: 1.5,
            mb: 1.5,
          }}
        >
          {/* Tool header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 0.5,
            }}
          >
            <Box sx={{ color: "primary.main", display: "flex" }}>
              {toolIcons[proposal.name] ?? null}
            </Box>
            <Typography
              variant="overline"
              color="primary.main"
              sx={{
                letterSpacing: "0.08em",
                fontWeight: "bold",
                lineHeight: 1,
              }}
            >
              {toolLabels[proposal.name] ?? proposal.name.toUpperCase()}
            </Typography>
          </Box>

          {/* Tool args */}
          {renderArgs(proposal.name, proposal.args)}
        </Box>
      ))}

      {/* Separator */}
      <Box
        sx={{
          borderTop: 1,
          borderColor: "divider",
          my: 1.5,
        }}
      />

      {/* Action buttons */}
      <Box
        sx={{
          display: "flex",
          gap: 1.5,
        }}
      >
        <Button
          variant="contained"
          color="primary"
          disableElevation
          size="small"
          startIcon={<CheckIcon />}
          onClick={onConfirm}
          disabled={disabled}
          sx={{
            borderRadius: 0,
            fontFamily: "monospace",
            letterSpacing: "0.05em",
            flex: 1,
          }}
        >
          {proposals.length > 1
            ? `CONFIRMAR TODO (${proposals.length})`
            : "CONFIRMAR"}
        </Button>
        <Button
          variant="outlined"
          color="inherit"
          size="small"
          startIcon={<CloseIcon />}
          onClick={onCancel}
          disabled={disabled}
          sx={{
            borderRadius: 0,
            fontFamily: "monospace",
            letterSpacing: "0.05em",
            flex: 1,
          }}
        >
          CANCELAR
        </Button>
      </Box>

      {/* Footer hint */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: "block",
          mt: 1,
          fontFamily: "monospace",
          fontSize: "0.6rem",
          textAlign: "center",
        }}
      >
        {proposals.length > 1
          ? `[ UN SOLO CLICK EJECUTA LAS ${proposals.length} ACCIONES ]`
          : "[ CONFIRMA PARA EJECUTAR | CANCELA PARA DESCARTAR ]"}
      </Typography>
    </Box>
  );
}
