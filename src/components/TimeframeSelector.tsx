/* eslint-disable react-refresh/only-export-components */
import { FormControl, Select, MenuItem } from "@mui/material";

export const TIMEFRAMES = ["7D", "30D", "1A", "TODO"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

type Props = {
  value: Timeframe;
  onChange: (v: Timeframe) => void;
  size?: "small" | "medium";
  minWidth?: number;
};

export function TimeframeSelector({
  value,
  onChange,
  size = "small",
  minWidth = 110,
}: Props) {
  return (
    <FormControl size={size} sx={{ minWidth }}>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value as Timeframe)}
      >
        {TIMEFRAMES.map((tf) => (
          <MenuItem key={tf} value={tf}>
            {tf}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
