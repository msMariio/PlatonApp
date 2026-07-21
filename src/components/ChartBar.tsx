import { Box } from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";

type ChartBarProps = {
  xData: (Date | string | number)[];
  yData: number[];
  seriesLabel: string;
  color?: string;
  height?: number;
  yMin?: number;
  yMax?: number;
  xScaleType?: "band" | "point" | "linear" | "time";
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
 * BarChart reutilizable con configuración visual común de la app:
 *  · grid vertical + horizontal
 *  · color primary (verde lima)
 *  · barras sólidas
 */
export function ChartBar({
  xData,
  yData,
  seriesLabel,
  color = "#adff2f",
  height = 300,
  yMin,
  yMax,
  xScaleType = "band",
  xValueFormatter,
  xTickMinStep,
  xTickMaxStep,
}: ChartBarProps) {
  const xAxisEntry = {
    data: xData,
    scaleType: xScaleType as "band" | "point" | "linear" | "time",
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
      <BarChart
        xAxis={[xAxisEntry]}
        yAxis={[yAxisEntry]}
        series={[
          {
            data: yData,
            label: seriesLabel,
            color,
          },
        ]}
        grid={{ vertical: true, horizontal: true }}
      />
    </Box>
  );
}
