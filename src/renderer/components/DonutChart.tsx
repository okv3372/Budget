import { useMemo } from 'react';

interface Slice {
  label: string;
  value: number;
}

interface DonutChartProps {
  title: string;
  slices: Slice[];
}

const palette = ['#1e8a5f', '#0f5f8d', '#bc6a16', '#a7362b', '#2f3d98', '#2f7752', '#8d4f96', '#4351b1'];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad)
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function DonutChart({ title, slices }: DonutChartProps) {
  const normalized = useMemo(() => {
    const cleaned = slices.filter((slice) => slice.value > 0);
    const total = cleaned.reduce((sum, slice) => sum + slice.value, 0) || 1;

    let current = 0;

    return cleaned.map((slice, index) => {
      const start = (current / total) * 360;
      current += slice.value;
      const end = (current / total) * 360;

      return {
        ...slice,
        color: palette[index % palette.length],
        start,
        end,
        percent: (slice.value / total) * 100
      };
    });
  }, [slices]);

  return (
    <article className="chart-card donut">
      <header>
        <h4>{title}</h4>
      </header>
      <div className="donut-body">
        <svg viewBox="0 0 120 120" role="img" aria-label={title}>
          <circle cx="60" cy="60" r="42" fill="none" stroke="#d5cfbf" strokeWidth="18" />
          {normalized.map((slice) => (
            <path
              key={slice.label}
              d={describeArc(60, 60, 42, slice.start, slice.end)}
              fill="none"
              stroke={slice.color}
              strokeWidth="18"
              strokeLinecap="round"
            />
          ))}
          <circle cx="60" cy="60" r="27" fill="#fbf9f2" />
        </svg>
        <ul>
          {normalized.slice(0, 6).map((slice) => (
            <li key={slice.label}>
              <span style={{ backgroundColor: slice.color }} />
              <em>{slice.label}</em>
              <strong>{slice.percent.toFixed(0)}%</strong>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
