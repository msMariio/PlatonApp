import * as React from "react";
import { Box, type SxProps, type Theme } from "@mui/material";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";

/**
 * Handle reutilizable para dnd-kit.
 *
 * Patrón "Drag Handle" oficial de @dnd-kit: el `setNodeRef` queda en el
 * contenedor exterior de la tarjeta (maneja transformaciones/opacidad), y
 * este componente recibe `setActivatorNodeRef`, `listeners` y `attributes`
 * del `useSortable`. Así la tarjeta sólo se arrastra cuando el usuario
 * agarra este handle, dejando el resto de la superficie libre para hacer
 * scroll en móvil.
 *
 * El padding interno amplía el tap-target a ≥44×44px (WCAG mobile).
 */
type DragHandleProps = {
  /** Devuelto por `useSortable()` — conecta el activator node. */
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  /** Devuelto por `useSortable()` — atributos ARIA (role, tabindex, etc.). */
  attributes: DraggableAttributes;
  /** Devuelto por `useSortable()` — event listeners (puede ser undefined si disabled). */
  listeners: DraggableSyntheticListeners | undefined;
  /** aria-label accesible (sobreescribe el default de dnd-kit). */
  label: string;
  /** Extra sx aplicado sobre los estilos por defecto (no sobreescribir cursor/touchAction). */
  sx?: SxProps<Theme>;
  children: React.ReactNode;
};

const baseSx: SxProps<Theme> = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
  color: "text.secondary",
  p: 1.5,
  "&:active": { cursor: "grabbing" },
  "&:focus-visible": {
    outline: "2px solid",
    outlineColor: "primary.main",
    outlineOffset: 2,
  },
};

export function DragHandle({
  setActivatorNodeRef,
  attributes,
  listeners,
  label,
  sx,
  children,
}: DragHandleProps) {
  return (
    <Box
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      sx={[baseSx, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
    >
      {children}
    </Box>
  );
}
