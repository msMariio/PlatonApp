import { Typography, type TypographyProps } from "@mui/material";

type Props = Omit<TypographyProps, "variant"> & {
  children: React.ReactNode;
};

/**
 * Etiqueta secundaria estilo "// HEADER //" — monospace uppercase muted.
 * Reutilizable en cualquier sección (logs, chart, list, etc.).
 */
export function SectionLabel({ children, sx, ...rest }: Props) {
  return (
    <Typography
      variant="button"
      color="text.secondary"
      sx={{ display: "block", letterSpacing: "0.05em", ...sx }}
      {...rest}
    >
      {children}
    </Typography>
  );
}
