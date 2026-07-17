import * as React from "react";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import IconButton from "@mui/material/IconButton";
import FormControl from "@mui/material/FormControl";
import OutlinedInput from "@mui/material/OutlinedInput";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { SxProps, Theme } from "@mui/material/styles";

/**
 * Placeholder para que FormControl pueda detectar correctamente el state
 * de "shrink" en SSR.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
function SSRInitialFilled(_: BaseNumberField.Root.Props) {
  return null;
}
/* eslint-enable @typescript-eslint/no-unused-vars */
SSRInitialFilled.muiName = "Input";

type InputNumberProps = BaseNumberField.Root.Props & {
  label?: React.ReactNode;
  size?: "small" | "medium";
  error?: boolean;
  sx?: SxProps<Theme>;
  /**
   * Si es `true`, muestra los botones de subir/bajar (flechas) a la derecha
   * del input. Por defecto es `false` porque en sitios con muchos inputs
   * (p.ej. las series de un ejercicio) quedan visualmente cargados.
   */
  showControls?: boolean;
  /**
   * Texto placeholder que se muestra cuando el input está vacío (ej. valor
   * `null`). Se reenvía al `<input>` subyacente.
   */
  placeholder?: string;
};

export default function InputNumber({
  id: idProp,
  label,
  error,
  size = "medium",
  sx,
  showControls = false,
  placeholder,
  ...other
}: InputNumberProps) {
  const id = React.useId();
  const finalId = idProp ?? id;

  return (
    <BaseNumberField.Root
      {...other}
      render={(props, state) => (
        <FormControl
          size={size}
          ref={props.ref}
          disabled={state.disabled}
          required={state.required}
          error={error}
          variant="outlined"
          sx={sx}
        >
          {props.children}
        </FormControl>
      )}
    >
      <SSRInitialFilled {...other} />
      <InputLabel htmlFor={finalId}>{label}</InputLabel>
      <BaseNumberField.Input
        id={finalId}
        render={(props, state) => (
          <OutlinedInput
            aria-describedby={`${finalId}-helper-text`}
            label={label}
            inputRef={props.ref}
            value={state.inputValue}
            onBlur={props.onBlur}
            onChange={props.onChange}
            onKeyUp={props.onKeyUp}
            onKeyDown={props.onKeyDown}
            onFocus={props.onFocus}
            placeholder={placeholder}
            slotProps={{
              input: props,
            }}
            endAdornment={
              showControls ? (
                <InputAdornment
                  position="end"
                  sx={{
                    flexDirection: "column",
                    maxHeight: "unset",
                    alignSelf: "stretch",
                    borderLeft: "1px solid",
                    borderColor: "divider",
                    ml: 0,
                    "& button": {
                      py: 0,
                      flex: 1,
                      borderRadius: 0.5,
                    },
                  }}
                >
                  <BaseNumberField.Increment
                    render={<IconButton size={size} aria-label="Increase" />}
                  >
                    <KeyboardArrowUpIcon
                      fontSize={size}
                      sx={{ transform: "translateY(2px)" }}
                    />
                  </BaseNumberField.Increment>

                  <BaseNumberField.Decrement
                    render={<IconButton size={size} aria-label="Decrease" />}
                  >
                    <KeyboardArrowDownIcon
                      fontSize={size}
                      sx={{ transform: "translateY(-2px)" }}
                    />
                  </BaseNumberField.Decrement>
                </InputAdornment>
              ) : undefined
            }
            sx={showControls ? { pr: 0 } : undefined}
          />
        )}
      />
    </BaseNumberField.Root>
  );
}
