import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui/Card';
import type { SubredditSentimentSummary } from '../../types';

const tooltipStyle = {
  backgroundColor: 'var(--surface-2)',
  border: '1px solid var(--glass-border)',
  borderRadius: '8px',
  fontSize: '12px',
  boxShadow: 'var(--glass-shadow)',
};

interface Props {
  distribution: number[];
  summaries: SubredditSentimentSummary[];
}

function binData(scores: number[], bins: number = 20) {
  const min = -1;
  const max = 1;
  const step = (max - min) / bins;
  const buckets = Array.from({ length: bins }, (_, i) => ({
    range: (min + i * step).toFixed(2),
    center: min + (i + 0.5) * step,
    count: 0,
  }));

  for (const score of scores) {
    let idx = Math.floor((score - min) / step);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    buckets[idx].count++;
  }

  return buckets.map((b) => ({
    ...b,
    fill: b.center < -0.33 ? '#f472b6' : b.center > 0.33 ? '#34d399' : '#818cf8',
  }));
}

export function SentimentDistribution({ distribution, summaries }: Props) {
  const data = binData(distribution);

  const allMeans = summaries.map((s) => s.post_stats.mean);
  const overallMean = allMeans.length > 0
    ? allMeans.reduce((a, b) => a + b, 0) / allMeans.length
    : 0;
  const overallMedian = summaries[0]?.post_stats.median ?? 0;
  const overallStdDev = summaries[0]?.post_stats.std_dev ?? 0;

  return (
    <Card
      title="Polarity Distribution"
      tooltip="Histogram of compound polarity scores across all analyzed text. Scores range from -1 (most negative) to +1 (most positive)."
    >
      <div className="mb-3 flex gap-4 text-xs text-[var(--text-muted)]">
        <span>Mean: <strong className="text-[var(--text-primary)]">{overallMean.toFixed(3)}</strong></span>
        <span>Median: <strong className="text-[var(--text-primary)]">{overallMedian.toFixed(3)}</strong></span>
        <span>Std Dev: <strong className="text-[var(--text-primary)]">{overallStdDev.toFixed(3)}</strong></span>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <XAxis
            dataKey="range"
            tick={{ fontSize: 10 }}
            interval={3}
            stroke="var(--text-muted)"
          />
          <YAxis tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(v) => `Score: ${v}`}
          />
          <ReferenceLine x={data.findIndex(d => d.center >= overallMean)?.toString()} stroke="#fbbf24" strokeDasharray="3 3" />
          <Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {data.map((entry, i) => (
              <rect key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
