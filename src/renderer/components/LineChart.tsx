import { useMemo } from 'react';

interface Point {
  label: string;
  value: number;
}

interface LineChartProps {
  title: string;
  points: Point[];
  accent?: string;
}

export function LineChart({ title, points, accent = '#1e8a5f' }: LineChartProps) {
  const { path, min, max } = useMemo(() => {
    if (points.length === 0) {
      return { path: '', min: 0, max: 1 };
    }

    const values = points.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;

    const width = 100;
    const height = 100;

    const commands = points.map((point, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - ((point.value - minValue) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    });

    return {
      path: commands.join(' '),
      min: minValue,
      max: maxValue
    };
  }, [points]);

  return (
    <article className="chart-card">
      <header>
        <h4>{title}</h4>
        <span>
          {points.length} pts · {min.toFixed(0)} to {max.toFixed(0)}
        </span>
      </header>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={title}>
        <defs>
          <linearGradient id={`grad-${title.replace(/\s+/g, '-').toLowerCase()}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.78" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="transparent" />
        {path ? (
          <path
            d={path}
            fill="none"
            stroke={`url(#grad-${title.replace(/\s+/g, '-').toLowerCase()})`}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
      <footer>
        {points.slice(-4).map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </footer>
    </article>
  );
}
