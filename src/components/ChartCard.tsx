import { Card, CardContent, Stack } from "@mui/material";
import { ChartLine } from "./ChartLine";
import { TimeframeSelector, type Timeframe } from "./TimeframeSelector";
import { SectionLabel } from "./SectionLabel";
import { EmptyStateCard } from "./EmptyStateCard";

type ChartCardProps = {
  title: string;
  /** Si se omite, no se muestra el selector */
  timeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
  xData: (Date | string | number)[];
  yData: number[];
  seriesLabel: string;
  color?: string;
  yMin?: number;
  yMax?: number;
  xScaleType?: "time" | "point";
  xValueFormatter?: (
    value: Date | string | number,
    context?: {
      location?: "tick" | "tooltip" | "legend" | "zoom-slider-tooltip";
    },
  ) => string;
  xTickMinStep?: number;
  xTickMaxStep?: number;
  /** Mínimo de puntos para renderizar el chart; por debajo se muestra emptyState */
  minPoints?: number;
  emptyMessage?: string;
  /** Altura del chart en px cuando hay datos */
  chartHeight?: number;
};

/**
 * Card con título + filtro de timeframe + LineChart. Encapsula el patrón
 * "historial consultable" de la app: se reusa para peso corporal, métricas
 * por ejercicio, etc.
 */
export function ChartCard({
  title,
  timeframe,
  onTimeframeChange,
  xData,
  yData,
  seriesLabel,
  color,
  yMin,
  yMax,
  xScaleType,
  xValueFormatter,
  xTickMinStep,
  xTickMaxStep,
  minPoints = 2,
  emptyMessage = "[ INSUFICIENTES DATOS // INGRESA MÍNIMO 2 REGISTROS ]",
  chartHeight = 300,
}: ChartCardProps) {
  const showTimeframe =
    timeframe !== undefined && onTimeframeChange !== undefined;
  const isEmpty = yData.length < minPoints;

  return (
    <Card>
      <CardContent>
        <Stack
          direction="row"
          sx={{
            mb: 2,
            gap: 2,
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <SectionLabel>{title}</SectionLabel>
          {showTimeframe && onTimeframeChange && (
            <TimeframeSelector value={timeframe} onChange={onTimeframeChange} />
          )}
        </Stack>

        {isEmpty ? (
          <EmptyStateCard height={chartHeight}>{emptyMessage}</EmptyStateCard>
        ) : (
          <ChartLine
            xData={xData}
            yData={yData}
            seriesLabel={seriesLabel}
            color={color}
            yMin={yMin}
            yMax={yMax}
            xScaleType={xScaleType}
            xValueFormatter={xValueFormatter}
            xTickMinStep={xTickMinStep}
            xTickMaxStep={xTickMaxStep}
            height={chartHeight}
          />
        )}
      </CardContent>
    </Card>
  );
}
