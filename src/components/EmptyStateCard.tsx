import { Box, Typography, type SxProps, type Theme } from "@mui/material";

type Props = {
  children: React.ReactNode;
  height?: number;
  sx?: SxProps<Theme>;
};

/**
 * Caja con borde discontinuo para estados vacíos (sin datos, esperando input...).
 */
export function EmptyStateCard({ children, height = 250, sx }: Props) {
  return (
    <Box
      sx={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px dashed",
        borderColor: "divider",
        ...sx,
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ px: 2, textAlign: "center" }}
      >
        {children}
      </Typography>
    </Box>
  );
}
