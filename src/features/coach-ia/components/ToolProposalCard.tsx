import { Box, Typography, Button, alpha } from "@mui/material";
import ReactMarkdown from "react-markdown";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Ejercicio, type LogEntrenamiento, type PesoDiario, type Rutina, type Serie } from "../../../core/db";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import ListAltIcon from "@mui/icons-material/ListAlt";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import EditNoteIcon from "@mui/icons-material/EditNote";
import ScaleIcon from "@mui/icons-material/Scale";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import EventNoteIcon from "@mui/icons-material/EventNote";
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
  editar_rutina: <EditNoteIcon sx={{ fontSize: 14 }} />,
  editar_entrenamiento: <EventNoteIcon sx={{ fontSize: 14 }} />,
  registrar_peso: <ScaleIcon sx={{ fontSize: 14 }} />,
  editar_peso: <ScaleIcon sx={{ fontSize: 14 }} />,
  reordenar_rutina: <SwapVertIcon sx={{ fontSize: 14 }} />,
};

const toolLabels: Record<string, string> = {
  crear_carpeta: "CREAR CARPETA",
  crear_ejercicio: "CREAR EJERCICIO",
  crear_rutina: "CREAR RUTINA",
  actualizar_planificacion_semanal: "PLANIFICAR SEMANA",
  editar_rutina: "EDITAR RUTINA",
  editar_entrenamiento: "EDITAR ENTRENAMIENTO",
  registrar_peso: "REGISTRAR PESO",
  editar_peso: "EDITAR PESO",
  reordenar_rutina: "REORDENAR RUTINA",
};

/** Contexto local utilizado para convertir argumentos en cambios antes/después. */
type ProposalContext = {
  rutinas: Rutina[];
  ejercicios: Ejercicio[];
  logs: LogEntrenamiento[];
  pesos: PesoDiario[];
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function findRutina(args: Record<string, unknown>, rutinas: Rutina[]): Rutina | undefined {
  const id = typeof args.rutinaId === "string" ? args.rutinaId : undefined;
  const nombre = normalizeText(args.rutinaNombre);
  return rutinas.find((rutina) =>
    (id ? rutina.id === id : false) ||
    (nombre ? normalizeText(rutina.nombre) === nombre : false),
  );
}

function findEjercicio(ref: Record<string, unknown>, ejercicios: Ejercicio[]): Ejercicio | undefined {
  const id = typeof ref.ejercicioId === "string" ? ref.ejercicioId : undefined;
  const nombre = normalizeText(ref.ejercicioNombre);
  return ejercicios.find((ejercicio) =>
    (id ? ejercicio.id === id : false) ||
    (nombre ? normalizeText(ejercicio.nombre) === nombre : false),
  );
}

function ejercicioNombre(ref: Record<string, unknown>, ejercicios: Ejercicio[]): string {
  return findEjercicio(ref, ejercicios)?.nombre ?? String(ref.ejercicioNombre ?? ref.ejercicioId ?? "Ejercicio desconocido");
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function formatNumber(value: unknown): string {
  return typeof value === "number" ? String(value) : "—";
}

type RealSeriesLike = {
  peso?: unknown;
  reps?: unknown;
  duracionMinutos?: unknown;
  distanciaKm?: unknown;
};

function formatTargetSeries(series: Serie[]): string {
  if (series.length === 0) return "sin series";
  const first = series[0];
  if (first.duracionObjetivoMinutos != null) {
    return `${series.length} × ${formatNumber(first.duracionObjetivoMinutos)} min`;
  }
  if (first.distanciaObjetivoKm != null) {
    return `${series.length} × ${formatNumber(first.distanciaObjetivoKm)} km`;
  }
  const reps = first.repsMin == null
    ? "—"
    : first.repsMin === first.repsMax
      ? formatNumber(first.repsMin)
      : `${formatNumber(first.repsMin)}-${formatNumber(first.repsMax)}`;
  const peso = first.pesoObjetivo != null ? ` @ ${formatNumber(first.pesoObjetivo)} kg` : "";
  return `${series.length} × ${reps}${peso}`;
}

function formatRealSeries(series: RealSeriesLike[]): string {
  if (series.length === 0) return "sin series";
  const first = series[0];
  if (first.duracionMinutos != null) return `${series.length} × ${formatNumber(first.duracionMinutos)} min`;
  if (first.distanciaKm != null) return `${series.length} × ${formatNumber(first.distanciaKm)} km`;
  const reps = first.reps != null ? formatNumber(first.reps) : "—";
  const peso = first.peso != null ? ` @ ${formatNumber(first.peso)} kg` : "";
  return `${series.length} × ${reps}${peso}`;
}

function ChangeRow({ label, before, after }: { label?: string; before: string; after: string }) {
  return (
    <Box sx={{ mt: 0.75, pl: 1, borderLeft: 2, borderColor: "divider" }}>
      {label && <Typography variant="caption" sx={{ display: "block", fontWeight: "bold", color: "text.primary" }}>{label}</Typography>}
      <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
        <Box component="span" sx={{ color: "error.main", fontWeight: "bold" }}>Antes:</Box> {before}
      </Typography>
      <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
        <Box component="span" sx={{ color: "success.main", fontWeight: "bold" }}>Después:</Box> {after}
      </Typography>
    </Box>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Typography variant="caption" color="text.secondary" sx={{ display: "block", letterSpacing: "0.05em", mt: 1, mb: 0.25 }}>{children}</Typography>;
}

function renderRoutineEdit(args: Record<string, unknown>, context: ProposalContext): React.ReactNode {
  const rutina = findRutina(args, context.rutinas);
  const modificaciones = (args.ejerciciosModificar as Array<Record<string, unknown>> | undefined) ?? [];
  const agregar = (args.ejerciciosAgregar as Array<Record<string, unknown>> | undefined) ?? [];
  const quitar = (args.ejerciciosQuitar as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <Box sx={{ mt: 0.5 }}>
      <Typography variant="caption" sx={{ fontWeight: "bold", display: "block" }}>
        {rutina?.nombre ?? String(args.rutinaNombre ?? args.rutinaId ?? "Rutina")}
      </Typography>
      {args.nombre !== undefined && rutina && <ChangeRow before={rutina.nombre} after={String(args.nombre)} />}
      {args.descripcion !== undefined && rutina && <ChangeRow label="DESCRIPCIÓN" before={rutina.descripcion || "—"} after={String(args.descripcion)} />}
      {modificaciones.length > 0 && (
        <>
          <SectionTitle>CAMBIOS DE EJERCICIOS</SectionTitle>
          {modificaciones.map((mod, index) => {
            const nombre = ejercicioNombre(mod, context.ejercicios);
            const actual = rutina?.ejercicios.find((ej) => ej.ejercicioId === findEjercicio(mod, context.ejercicios)?.id);
            const before = actual ? formatTargetSeries(actual.series) : "no encontrado";
            const afterSeries = Math.max(1, Number(mod.series ?? actual?.series.length ?? 1));
            const first = actual?.series[0] ?? {};
            const after: Serie = {
              ...first,
              repsMin: asNumber(mod.repsMin) ?? first.repsMin,
              repsMax: asNumber(mod.repsMax) ?? first.repsMax,
              pesoObjetivo: asNumber(mod.pesoObjetivo) ?? first.pesoObjetivo,
              rpeObjetivo: asNumber(mod.rpeObjetivo) ?? first.rpeObjetivo,
              duracionObjetivoMinutos: asNumber(mod.duracionObjetivoMinutos) ?? first.duracionObjetivoMinutos,
              distanciaObjetivoKm: asNumber(mod.distanciaObjetivoKm) ?? first.distanciaObjetivoKm,
            };
            return <ChangeRow key={index} label={nombre} before={before} after={formatTargetSeries(Array.from({ length: afterSeries }, () => after))} />;
          })}
        </>
      )}
      {agregar.length > 0 && (
        <>
          <SectionTitle>EJERCICIOS AÑADIDOS</SectionTitle>
          {agregar.map((ej, index) => <ChangeRow key={index} label={ejercicioNombre(ej, context.ejercicios)} before="—" after={formatTargetSeries(Array.from({ length: Math.max(1, Number(ej.series ?? 1)) }, () => ({ repsMin: ej.repsMin as number | undefined, repsMax: ej.repsMax as number | undefined, pesoObjetivo: ej.pesoObjetivo as number | undefined, duracionObjetivoMinutos: ej.duracionObjetivoMinutos as number | undefined, distanciaObjetivoKm: ej.distanciaObjetivoKm as number | undefined })))} />)}
        </>
      )}
      {quitar.length > 0 && (
        <>
          <SectionTitle>EJERCICIOS QUITADOS</SectionTitle>
          {quitar.map((ej, index) => {
            const actual = rutina?.ejercicios.find((item) => item.ejercicioId === findEjercicio(ej, context.ejercicios)?.id);
            return <ChangeRow key={index} label={ejercicioNombre(ej, context.ejercicios)} before={actual ? formatTargetSeries(actual.series) : "presente"} after="—" />;
          })}
        </>
      )}
    </Box>
  );
}

function renderWorkoutEdit(args: Record<string, unknown>, context: ProposalContext): React.ReactNode {
  const fecha = String(args.fecha ?? "");
  const rutinaNombre = normalizeText(args.rutinaNombre);
  const log = context.logs.find((item) => item.fecha.slice(0, 10) === fecha && (!rutinaNombre || normalizeText(item.rutinaSnapshot) === rutinaNombre || item.rutinaId === args.rutinaId));
  const modificaciones = (args.ejerciciosModificar as Array<Record<string, unknown>> | undefined) ?? [];
  const agregar = (args.ejerciciosAgregar as Array<Record<string, unknown>> | undefined) ?? [];
  const quitar = (args.ejerciciosQuitar as Array<Record<string, unknown>> | undefined) ?? [];
  return (
    <Box sx={{ mt: 0.5 }}>
      <Typography variant="caption" sx={{ fontWeight: "bold", display: "block" }}>{log?.rutinaSnapshot ?? String(args.rutinaNombre ?? args.rutinaId ?? "Entrenamiento")} · {fecha}</Typography>
      {modificaciones.map((mod, index) => {
        const id = findEjercicio(mod, context.ejercicios)?.id;
        const actual = log?.ejercicios.find((ej) => ej.ejercicioId === id);
        const series = (mod.series as Array<Record<string, unknown>> | undefined) ?? [];
        const before = actual ? formatRealSeries(actual.series) : "no encontrado";
        const afterSeries = actual?.series.map((serie, serieIndex) => {
          const change = series.find((item) => item.serieIdx === serieIndex);
          return change ? { ...serie, ...change } : serie;
        }) ?? [];
        return <ChangeRow key={index} label={ejercicioNombre(mod, context.ejercicios)} before={before} after={formatRealSeries(afterSeries)} />;
      })}
      {agregar.map((ej, index) => <ChangeRow key={`a-${index}`} label={ejercicioNombre(ej, context.ejercicios)} before="—" after={formatRealSeries((ej.series as Array<RealSeriesLike> | undefined) ?? [])} />)}
      {quitar.map((ej, index) => {
        const id = findEjercicio(ej, context.ejercicios)?.id;
        const actual = log?.ejercicios.find((item) => item.ejercicioId === id);
        return <ChangeRow key={`q-${index}`} label={ejercicioNombre(ej, context.ejercicios)} before={actual ? formatRealSeries(actual.series) : "presente"} after="—" />;
      })}
    </Box>
  );
}

function renderReorder(args: Record<string, unknown>, context: ProposalContext): React.ReactNode {
  const rutina = findRutina(args, context.rutinas);
  const orden = (args.ordenEjercicios as Array<Record<string, unknown>> | undefined) ?? [];
  const anterior = rutina?.ejercicios
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => context.ejercicios.find((ej) => ej.id === item.ejercicioId)?.nombre ?? item.ejercicioId) ?? [];
  const nuevo = orden.map((item) => ejercicioNombre(item, context.ejercicios));

  return (
    <Box sx={{ mt: 0.5 }}>
      <Typography variant="caption" sx={{ display: "block", fontWeight: "bold" }}>
        {rutina?.nombre ?? String(args.rutinaNombre ?? args.rutinaId ?? "Rutina")}
      </Typography>
      <ChangeRow
        label="ORDEN DE EJERCICIOS"
        before={anterior.length > 0 ? anterior.join(" → ") : "no disponible"}
        after={nuevo.length > 0 ? nuevo.join(" → ") : "sin cambios"}
      />
    </Box>
  );
}

function renderWeight(name: "registrar_peso" | "editar_peso", args: Record<string, unknown>, context: ProposalContext): React.ReactNode {
  const fecha = String(args.fecha ?? "hoy");
  const hora = typeof args.hora === "string" ? ` · ${args.hora}` : "";
  if (name === "registrar_peso") {
    return <ChangeRow label={`PESO · ${fecha}${hora}`} before="—" after={`${formatNumber(args.valor)} kg`} />;
  }

  const registro = context.pesos.find((peso) =>
    peso.fecha === fecha && (!args.hora || peso.hora === args.hora),
  );
  return <ChangeRow label={`PESO · ${fecha}${hora}`} before={registro ? `${registro.valor} kg` : "registro no encontrado"} after={`${formatNumber(args.nuevoValor)} kg`} />;
}

function renderArgs(name: string, args: Record<string, unknown>, context: ProposalContext): React.ReactNode {
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
                    {String(ej.series ?? "?")}x{ej.repsMin === ej.repsMax ? String(ej.repsMin ?? "?") : `${String(ej.repsMin ?? "?")}-${String(ej.repsMax ?? "?")}`}
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

    case "editar_rutina":
      return renderRoutineEdit(args, context);

    case "editar_entrenamiento":
      return renderWorkoutEdit(args, context);

    case "registrar_peso":
    case "editar_peso":
      return renderWeight(name, args, context);

    case "reordenar_rutina":
      return renderReorder(args, context);

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
  const context = useLiveQuery<ProposalContext>(
    async () => {
      const [rutinas, ejercicios, logs, pesos] = await Promise.all([
        db.rutinas.toArray(),
        db.ejercicios.toArray(),
        db.logsEntrenamientos.toArray(),
        db.pesos.toArray(),
      ]);
      return { rutinas, ejercicios, logs, pesos };
    },
    [],
  ) ?? { rutinas: [], ejercicios: [], logs: [], pesos: [] };

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
          {renderArgs(proposal.name, proposal.args, context)}
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
