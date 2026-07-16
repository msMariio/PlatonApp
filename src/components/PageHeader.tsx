import { Typography, type TypographyProps } from "@mui/material";

type Props = Omit<TypographyProps, "variant" | "color"> & {
  children: React.ReactNode;
};

/**
 * Cabecera H1/H2 consistente en todas las vistas de feature.
 * Por defecto es h5 verde lima monospace uppercase — la estética de la app.
 */
export function PageHeader({ children, sx, ...rest }: Props) {
  return (
    <Typography
      variant="h5"
      color="primary"
      sx={{ letterSpacing: "0.05em", ...sx }}
      {...rest}
    >
      {children}
    </Typography>
  );
}
