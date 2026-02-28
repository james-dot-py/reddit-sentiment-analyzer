import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts';
import type { ScorePoint, Annotation, Trajectory } from '../../types';
import { TrajectoryBadge } from './StatusBadge';

interface Props {
  scoreHistory: ScorePoint[];
  annotations: Annotation[];
  trajectory: Trajectory | null;
}

const statusColor: Record<string, string> = {
  thriving: '#059669', positive: '#16a34a', stable: '#64748b',
  watch: '#d97706', at_risk: '#ea580c', declining: '#dc2626', crisis: '#991b1b',
};

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch { return dateStr; }
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as ScorePoint;
  return (
    <div className="paper-card px-3 py-2 text-xs">
      <div className="data-text font-medium">{d.score}</div>
      <div className="text-[var(--text-muted)]">{formatDate(d.date)}</div>
    </div>
  );
}

export function ScoreTrendChart({ scoreHistory, annotations, trajectory }: Props) {
  if (!scoreHistory.length) {
    return (
      <div className="paper-card p-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-4">
          Score Trend
        </h3>
        <p className="text-sm text-[var(--text-muted)] text-center py-8">
          Trend data requires at least 2 weeks of snapshots.
        </p>
      </div>
    );
  }

  const data = scoreHistory.map(p => ({
    ...p,
    dateLabel: formatDate(p.date),
    color: statusColor[p.status] || statusColor.stable,
  }));

  const scores = data.map(d => d.score);
  const minScore = Math.max(0, Math.min(...scores) - 10);
  const maxScore = Math.min(100, Math.max(...scores) + 10);

  return (
    <div className="paper-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
          Score Trend
        </h3>
        <TrajectoryBadge trajectory={trajectory} />
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
          <defs>
            <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--text-primary)" stopOpacity={0.08} />
              <stop offset="100%" stopColor="var(--text-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[minScore, maxScore]}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="score"
            fill="url(#scoreGrad)"
            stroke="none"
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--text-primary)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--surface-card)', stroke: 'var(--text-primary)', strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
          {annotations.map(a => (
            <ReferenceLine
              key={a.annotation_id}
              x={formatDate(a.date)}
              stroke="var(--text-muted)"
              strokeDasharray="3 3"
              label={{ value: a.label, position: 'top', fontSize: 9, fill: 'var(--text-muted)' }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
