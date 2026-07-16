import { Box } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";

type ChartLineProps = {
  xData: (Date | string | number)[];
  yData: number[];
  seriesLabel: string;
  color?: string;
  height?: number;
  yMin?: number;
  yMax?: number;
  showMark?: boolean;
  xScaleType?: "time" | "point";
  xValueFormatter?: (
    value: Date | string | number,
    context?: {
      location?: "tick" | "tooltip" | "legend" | "zoom-slider-tooltip";
    },
  ) => string;
  xTickMinStep?: number;
  xTickMaxStep?: number;
};

/**
 * LineChart reutilizable con configuración visual común de la app:
 *  · grid vertical + horizontal
 *  · color primary (verde lima)
 *  · mark visible
 * Se reusa para SeguimientoPeso, historial de ejercicios, etc.
 */
export function ChartLine({
  xData,
  yData,
  seriesLabel,
  color = "#adff2f",
  height = 300,
  yMin,
  yMax,
  showMark = true,
  xScaleType = "time",
  xValueFormatter,
  xTickMinStep,
  xTickMaxStep,
}: ChartLineProps) {
  const xAxisEntry = {
    data: xData,
    scaleType: xScaleType,
    ...(xValueFormatter ? { valueFormatter: xValueFormatter } : {}),
    ...(xTickMinStep !== undefined ? { tickMinStep: xTickMinStep } : {}),
    ...(xTickMaxStep !== undefined ? { tickMaxStep: xTickMaxStep } : {}),
  };

  const yAxisEntry = {
    ...(yMin !== undefined ? { min: yMin } : {}),
    ...(yMax !== undefined ? { max: yMax } : {}),
  };

  return (
    <Box sx={{ width: "100%", height }}>
      <LineChart
        xAxis={[xAxisEntry]}
        yAxis={[yAxisEntry]}
        series={[
          {
            data: yData,
            label: seriesLabel,
            color,
            showMark,
          },
        ]}
        grid={{ vertical: true, horizontal: true }}
      />
    </Box>
  );
}
