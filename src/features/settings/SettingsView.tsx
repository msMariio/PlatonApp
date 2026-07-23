import { useRef, useState } from "react";
import {
  Box,
  Stack,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
} from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DownloadIcon from "@mui/icons-material/Download";
import UploadIcon from "@mui/icons-material/Upload";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { PageHeader } from "../../components/PageHeader";
import { SectionLabel } from "../../components/SectionLabel";
import { useColorMode } from "../../core/ColorModeContext";
import { PerfilView } from "../perfil/PerfilView";
import {
  exportBackup,
  readBackupFile,
  importBackup,
  type BackupData,
} from "../../core/backup";

export function SettingsView() {
  const { mode, setMode } = useColorMode();
  const isDark = mode === "dark";

  // ── Backup / Restore state ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null);

  const handleExport = async () => {
    setError(null);
    setSuccessMsg(null);
    try {
      await exportBackup();
      setSuccessMsg("Backup exportado correctamente.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al exportar el backup."
      );
    }
  };

  const handleFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    // Reset input para permitir re-seleccionar el mismo archivo
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    setError(null);
    setSuccessMsg(null);

    try {
      const backup = await readBackupFile(file);
      setPendingBackup(backup);
      setConfirmDialogOpen(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al leer el archivo."
      );
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingBackup) return;
    setConfirmDialogOpen(false);
    setImporting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await importBackup(pendingBackup);
      setSuccessMsg(
        "Backup restaurado correctamente. Recarga la página si es necesario."
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al importar el backup."
      );
    } finally {
      setImporting(false);
      setPendingBackup(null);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <PageHeader>AJUSTES</PageHeader>

      {/* ── Apariencia ── */}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <SectionLabel>APARIENCIA</SectionLabel>
            <Typography variant="body2" color="text.secondary">
              La aplicación respeta tu tema dark/light con la misma estética
              brutal-terminal.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                onClick={() => setMode("dark")}
                variant={isDark ? "contained" : "outlined"}
                color="primary"
                disableElevation
                startIcon={<DarkModeIcon />}
              >
                OSCURO
              </Button>
              <Button
                fullWidth
                onClick={() => setMode("light")}
                variant={!isDark ? "contained" : "outlined"}
                color="primary"
                disableElevation
                startIcon={<LightModeIcon />}
              >
                CLARO
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Modo actual: {isDark ? "OSCURO" : "CLARO"}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* ── Backup / Restore ── */}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <SectionLabel>DATOS</SectionLabel>
            <Typography variant="body2" color="text.secondary">
              Exporta o restaura todos tus datos (ejercicios, rutinas,
              entrenamientos, pesos, perfil y conversaciones). La importación
              sobrescribe completamente la base de datos actual.
            </Typography>

            {/* Feedback messages */}
            {error && (
              <Alert
                severity="error"
                onClose={() => setError(null)}
                sx={{ borderRadius: 0 }}
              >
                {error}
              </Alert>
            )}
            {successMsg && (
              <Alert
                severity="success"
                onClose={() => setSuccessMsg(null)}
                sx={{ borderRadius: 0 }}
              >
                {successMsg}
              </Alert>
            )}

            <Stack direction="row" spacing={1}>
              {/* Export */}
              <Button
                fullWidth
                variant="outlined"
                color="primary"
                disableElevation
                startIcon={<DownloadIcon />}
                onClick={handleExport}
              >
                EXPORTAR BACKUP
              </Button>

              {/* Import — peligro moderado */}
              <Button
                fullWidth
                variant="outlined"
                color="warning"
                disableElevation
                startIcon={
                  importing ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <UploadIcon />
                  )
                }
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
              >
                {importing ? "RESTAURANDO…" : "RESTAURAR BACKUP"}
              </Button>

              {/* Input oculto para seleccionar archivo */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: "none" }}
                onChange={handleFileSelected}
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* ── Diálogo de confirmación ── */}
      <Dialog
        open={confirmDialogOpen}
        onClose={() => {
          setConfirmDialogOpen(false);
          setPendingBackup(null);
        }}
        slotProps={{ paper: { sx: { borderRadius: 0, border: 2, borderColor: "warning.main" } } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningAmberIcon color="warning" />
          ¿Restaurar backup?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Esta acción <strong>sobrescribirá completamente</strong> tu base de
            datos actual con los datos del backup
            {pendingBackup
              ? ` exportado el ${new Date(pendingBackup.exportedAt).toLocaleString()}`
              : ""}
            .
          </DialogContentText>
          <DialogContentText sx={{ mt: 1 }}>
            Los datos actuales se perderán de forma permanente. Asegúrate de
            haber exportado un backup reciente antes de continuar.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() => {
              setConfirmDialogOpen(false);
              setPendingBackup(null);
            }}
            color="inherit"
            sx={{ borderRadius: 0 }}
          >
            CANCELAR
          </Button>
          <Button
            onClick={handleConfirmImport}
            variant="contained"
            color="warning"
            disableElevation
            autoFocus
            sx={{ borderRadius: 0 }}
          >
            SÍ, RESTAURAR BACKUP
          </Button>
        </DialogActions>
      </Dialog>

      <PerfilView />
    </Box>
  );
}
