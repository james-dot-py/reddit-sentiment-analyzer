import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui/Card';
import type { SubredditSentimentSummary } from '../../types';

const tooltipStyle = {
  backgroundColor: 'var(--surface-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '3px',
  fontSize: '12px',
  fontFamily: 'var(--font-data)',
  boxShadow: 'var(--paper-shadow)',
};

interface Props {
  summaries: SubredditSentimentSummary[];
}

export function SubredditComparison({ summaries }: Props) {
  if (summaries.length < 2) return null;

  const data = summaries.map((s) => ({
    name: `r/${s.subreddit}`,
    positive: s.post_stats.positive_pct,
    neutral: s.post_stats.neutral_pct,
    negative: s.post_stats.negative_pct,
    posts: s.post_count,
    mean: s.post_stats.mean,
  }));

  return (
    <Card
      title="Comparative Analysis"
      tooltip="Side-by-side comparison of polarity breakdown and post volume across communities."
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--text-muted)" axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" unit="%" axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          <Bar dataKey="positive" name="Positive %" fill="#2E5E4E" radius={[2, 2, 0, 0]} />
          <Bar dataKey="neutral" name="Neutral %" fill="#B0B0B0" radius={[2, 2, 0, 0]} />
          <Bar dataKey="negative" name="Negative %" fill="#8A1C1C" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex justify-center gap-6 data-text text-xs text-[var(--text-muted)]">
        {data.map((d) => (
          <span key={d.name}>
            {d.name}: <strong className="text-[var(--text-primary)]">{d.posts}</strong> posts, mean <strong className="text-[var(--text-primary)]">{d.mean.toFixed(3)}</strong>
          </span>
        ))}
      </div>
    </Card>
  );
}
