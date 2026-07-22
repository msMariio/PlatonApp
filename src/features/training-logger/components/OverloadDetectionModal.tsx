import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
  Typography,
  alpha,
  Divider,
} from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import type { EjercicioMejora } from "../utils/compareWorkoutWithTemplate";

type Props = {
  open: boolean;
  mejoras: EjercicioMejora[];
  onUpdateTemplate: () => void;
  onSkipUpdate: () => void;
  onClose: () => void;
  disabled?: boolean;
};

/** Formatea un delta numérico: "+2.5 kg", "+2 reps". */
function fmtDelta(
  anterior: number | undefined,
  nuevo: number | undefined,
  unidad: string,
): string | null {
  if (anterior == null || nuevo == null || nuevo <= anterior) return null;
  const delta = nuevo - anterior;
  const deltaStr = Number.isInteger(delta)
    ? String(delta)
    : delta.toFixed(1);
  return `+${deltaStr} ${unidad}`;
}

export function OverloadDetectionModal({
  open,
  mejoras,
  onUpdateTemplate,
  onSkipUpdate,
  onClose,
  disabled,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        // Solo cerrar con el botón de cierre, no con backdrop/ESC
        if (reason === "backdropClick" || reason === "escapeKeyDown") return;
        onClose();
      }}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 0,
            border: 1,
            borderColor: "primary.main",
            bgcolor: "background.default",
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          letterSpacing: "0.05em",
          pb: 2,
        }}
      >
        <TrendingUpIcon sx={{ color: "primary.main", fontSize: 28 }} />
        <Typography
          variant="h6"
          component="span"
          sx={{ fontWeight: "bold", letterSpacing: "0.05em" }}
        >
          SOBRECARGA PROGRESIVA DETECTADA
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 2.5, pb: 1 }}>
        <DialogContentText
          sx={{ mb: 2.5, letterSpacing: "0.03em", color: "text.secondary" }}
        >
          SE HAN DETECTADO MEJORAS RESPECTO A LA PLANTILLA ACTUAL. ¿QUIERES
          ACTUALIZAR LOS OBJETIVOS PARA LA PRÓXIMA SESIÓN?
        </DialogContentText>

        {mejoras.map((ej, ejIdx) => (
          <Box key={ej.ejercicioId} sx={{ mb: ejIdx < mejoras.length - 1 ? 2.5 : 0 }}>
            {/* Nombre del ejercicio */}
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: "bold",
                letterSpacing: "0.05em",
                color: "primary.main",
                mb: 1,
              }}
            >
              {ej.nombre.toUpperCase()}
            </Typography>

            {/* Mejoras por serie */}
            {ej.mejoras.map((m) => (
              <Box
                key={m.serieIdx}
                sx={{
                  ml: 1.5,
                  mb: 1,
                  pl: 2,
                  borderLeft: "3px solid",
                  borderLeftColor: "primary.main",
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ letterSpacing: "0.05em", display: "block", mb: 0.5 }}
                >
                  SERIE {m.serieIdx + 1}
                </Typography>

                {fmtDelta(m.pesoAnterior, m.pesoNuevo, "kg") && (
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: '"Courier New", Courier, monospace',
                      letterSpacing: "0.03em",
                    }}
                  >
                    {m.pesoAnterior} kg →{" "}
                    <Box
                      component="span"
                      sx={{ color: "primary.main", fontWeight: "bold" }}
                    >
                      {m.pesoNuevo} kg
                    </Box>{" "}
                    (
                    <Box
                      component="span"
                      sx={{ color: "primary.main" }}
                    >
                      {fmtDelta(m.pesoAnterior, m.pesoNuevo, "kg")}
                    </Box>
                    )
                  </Typography>
                )}

                {fmtDelta(m.repsAnterior, m.repsNuevo, "reps") && (
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: '"Courier New", Courier, monospace',
                      letterSpacing: "0.03em",
                    }}
                  >
                    {m.repsAnterior} reps →{" "}
                    <Box
                      component="span"
                      sx={{ color: "primary.main", fontWeight: "bold" }}
                    >
                      {m.repsNuevo} reps
                    </Box>{" "}
                    (
                    <Box
                      component="span"
                      sx={{ color: "primary.main" }}
                    >
                      {fmtDelta(m.repsAnterior, m.repsNuevo, "reps")}
                    </Box>
                    )
                  </Typography>
                )}

                {fmtDelta(
                  m.duracionAnterior,
                  m.duracionNuevo,
                  "min",
                ) && (
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: '"Courier New", Courier, monospace',
                      letterSpacing: "0.03em",
                    }}
                  >
                    {m.duracionAnterior} min →{" "}
                    <Box
                      component="span"
                      sx={{ color: "primary.main", fontWeight: "bold" }}
                    >
                      {m.duracionNuevo} min
                    </Box>{" "}
                    (
                    <Box
                      component="span"
                      sx={{ color: "primary.main" }}
                    >
                      {fmtDelta(
                        m.duracionAnterior,
                        m.duracionNuevo,
                        "min",
                      )}
                    </Box>
                    )
                  </Typography>
                )}

                {fmtDelta(
                  m.distanciaAnterior,
                  m.distanciaNuevo,
                  "km",
                ) && (
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: '"Courier New", Courier, monospace',
                      letterSpacing: "0.03em",
                    }}
                  >
                    {m.distanciaAnterior} km →{" "}
                    <Box
                      component="span"
                      sx={{ color: "primary.main", fontWeight: "bold" }}
                    >
                      {m.distanciaNuevo} km
                    </Box>{" "}
                    (
                    <Box
                      component="span"
                      sx={{ color: "primary.main" }}
                    >
                      {fmtDelta(
                        m.distanciaAnterior,
                        m.distanciaNuevo,
                        "km",
                      )}
                    </Box>
                    )
                  </Typography>
                )}
              </Box>
            ))}

            {/* Series extra */}
            {ej.seriesExtra > 0 && (
              <Box
                sx={{
                  ml: 1.5,
                  pl: 2,
                  borderLeft: "3px solid",
                  borderLeftColor: "warning.main",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: '"Courier New", Courier, monospace',
                    letterSpacing: "0.03em",
                    color: "warning.main",
                  }}
                >
                  +{ej.seriesExtra} SERIE{ej.seriesExtra > 1 ? "S" : ""} EXTRA
                  COMPLETADA{ej.seriesExtra > 1 ? "S" : ""}
                </Typography>
              </Box>
            )}

            {ejIdx < mejoras.length - 1 && (
              <Divider sx={{ mt: 2, borderColor: "divider" }} />
            )}
          </Box>
        ))}
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          pb: 2.5,
          pt: 1,
          gap: 1.5,
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "flex-end",
        }}
      >
        <Button
          onClick={onSkipUpdate}
          disabled={disabled}
          variant="outlined"
          color="inherit"
          disableElevation
          fullWidth
          sx={{
            borderRadius: 0,
            letterSpacing: "0.05em",
            order: { xs: 2, sm: 1 },
          }}
        >
          SOLO REGISTRAR HOY
        </Button>
        <Button
          onClick={onUpdateTemplate}
          disabled={disabled}
          variant="contained"
          color="primary"
          disableElevation
          fullWidth
          startIcon={<TrendingUpIcon />}
          sx={{
            borderRadius: 0,
            letterSpacing: "0.05em",
            fontWeight: "bold",
            order: { xs: 1, sm: 2 },
            bgcolor: "primary.main",
            "&:hover": {
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.85),
            },
          }}
        >
          ACTUALIZAR PLANTILLA
        </Button>
      </DialogActions>
    </Dialog>
  );
}
