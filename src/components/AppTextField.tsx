import { TextField, type TextFieldProps } from "@mui/material";

/**
 * TextField estandarizado para toda la app.
 *
 * Defaults compartidos:
 *   · `size="small"`  → consistencia visual mobile-first.
 *
 * El comportamiento de la label es el estándar de MUI: aparece centrada en
 * el área del input cuando está vacío y se encoge ("shrink") automáticamente
 * cuando el input recibe un valor o gana foco. No forzamos `shrink` ni lo
 * mergeamos — el caller lo controla 100% vía `slotProps.inputLabel` si lo
 * necesita.
 *
 * Todo lo demás (`label`, `value`, `onChange`, `multiline`, `minRows`,
 * `type`, `autoFocus`, `fullWidth`, `error`, `helperText`, `onKeyDown`,
 * `onBlur`, `placeholder`, `disabled`, `inputProps`, etc.) se pasa tal cual
 * al `TextField` subyacente de MUI.
 */
export function AppTextField({
  size = "small",
  slotProps,
  ...rest
}: TextFieldProps) {
  return <TextField size={size} slotProps={slotProps} {...rest} />;
}
