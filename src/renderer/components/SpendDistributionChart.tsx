import { useMemo } from 'react';

export interface SpendDistributionPoint {
  date: string;
  percentages: Record<string, number>;
}

export interface SpendDistributionSeries {
  category: string;
  color: string;
  enabled: boolean;
}

interface SpendDistributionChartProps {
  title: string;
  points: SpendDistributionPoint[];
  series: SpendDistributionSeries[];
  xLabelMode?: 'day' | 'week' | 'month';
}

const DEFAULT_MIN_PLOT_WIDTH = 1800;
const DEFAULT_POINT_SPACING = 28;

function formatAxisDate(isoDate: string, mode: 'day' | 'week' | 'month'): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (mode === 'month') {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: '2-digit'
    }).format(date);
  }

  if (mode === 'week') {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(date);
}

export function SpendDistributionChart({
  title,
  points,
  series,
  xLabelMode = 'day'
}: SpendDistributionChartProps) {
  const clipId = useMemo(() => `spend-share-clip-${title.replace(/\W+/g, '-').toLowerCase()}`, [title]);
  const pointUnit = xLabelMode === 'month' ? 'months' : xLabelMode === 'week' ? 'weeks' : 'days';

  const chart = useMemo(() => {
    const paddingTop = 12;
    const paddingRight = 16;
    const paddingBottom = 34;
    const paddingLeft = 44;
    const plotHeight = 360;
    const minPlotWidth = DEFAULT_MIN_PLOT_WIDTH;
    const pointSpacing = DEFAULT_POINT_SPACING;
    const plotWidth = Math.max(minPlotWidth, Math.max(0, points.length - 1) * pointSpacing);
    const svgWidth = paddingLeft + plotWidth + paddingRight;
    const svgHeight = paddingTop + plotHeight + paddingBottom;

    const xForIndex = (index: number): number => {
      if (points.length <= 1) {
        return paddingLeft + plotWidth / 2;
      }
      return paddingLeft + (index / (points.length - 1)) * plotWidth;
    };

    const xTickCount = points.length < 6 ? points.length : 6;
    const xTickIndices =
      xTickCount === 0
        ? []
        : [...new Set(
            Array.from({ length: xTickCount }, (_, index) => {
              if (xTickCount === 1) {
                return 0;
              }
              return Math.round((index / (xTickCount - 1)) * (points.length - 1));
            })
          )];

    const xTicks = xTickIndices.map((pointIndex) => ({
      x: xForIndex(pointIndex),
      label: formatAxisDate(points[pointIndex].date, xLabelMode)
    }));

    const enabledSeries = series.filter((item) => item.enabled);

    const activeMax = enabledSeries.reduce((max, item) => {
      const itemMax = points.reduce((pointMax, point) => Math.max(pointMax, point.percentages[item.category] ?? 0), 0);
      return Math.max(max, itemMax);
    }, 0);
    const normalizedMax = activeMax > 0 ? Math.ceil(activeMax / 5) * 5 : 100;
    const yMax = Math.max(5, normalizedMax);
    const yTicks = [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax];
    const yForValue = (value: number): number => paddingTop + (1 - value / yMax) * plotHeight;
    const activeSeries = enabledSeries.map((item) => {
      const commands = points.map((point, index) => {
        const x = xForIndex(index);
        const y = yForValue(point.percentages[item.category] ?? 0);
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      });

      return {
        ...item,
        path: commands.join(' ')
      };
    });

    return {
      svgWidth,
      svgHeight,
      paddingTop,
      paddingRight,
      paddingBottom,
      paddingLeft,
      plotWidth,
      plotHeight,
      xTicks,
      activeSeries,
      yForValue,
      yTicks
    };
  }, [points, series, xLabelMode]);

  return (
    <article className="chart-card spend-share-chart">
      <header>
        <h4>{title}</h4>
        <span>
          {points.length} {pointUnit} · {chart.activeSeries.length} categories visible
        </span>
      </header>

      {points.length === 0 ? (
        <p className="hint">No spending rows are available for the selected ledger.</p>
      ) : (
        <>
          <div className="spend-share-scroll">
            <svg
              className="spend-share-svg"
              viewBox={`0 0 ${chart.svgWidth} ${chart.svgHeight}`}
              preserveAspectRatio="xMinYMin meet"
              role="img"
              aria-label={title}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect x={chart.paddingLeft} y={chart.paddingTop} width={chart.plotWidth} height={chart.plotHeight} />
                </clipPath>
              </defs>

              {chart.yTicks.map((tick) => (
                <g key={`y-tick-${tick}`}>
                  <line
                    x1={chart.paddingLeft}
                    y1={chart.yForValue(tick)}
                    x2={chart.paddingLeft + chart.plotWidth}
                    y2={chart.yForValue(tick)}
                    stroke="#e2d8c4"
                    strokeWidth={1}
                  />
                  <text x={6} y={chart.yForValue(tick) + 4} fill="#6b675d" fontSize={10}>
                    {tick.toFixed(0)}%
                  </text>
                </g>
              ))}

              {chart.xTicks.map((tick) => (
                <g key={`x-tick-${tick.x}`}>
                  <line
                    x1={tick.x}
                    y1={chart.paddingTop}
                    x2={tick.x}
                    y2={chart.paddingTop + chart.plotHeight}
                    stroke="#eee4cf"
                    strokeWidth={1}
                    strokeDasharray="2 4"
                  />
                  <text x={tick.x} y={chart.svgHeight - 10} textAnchor="middle" fill="#6b675d" fontSize={10}>
                    {tick.label}
                  </text>
                </g>
              ))}

              <g clipPath={`url(#${clipId})`}>
                {chart.activeSeries.map((item) => (
                  <path
                    key={item.category}
                    d={item.path}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={2.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </g>
            </svg>
          </div>
        </>
      )}
    </article>
  );
}
