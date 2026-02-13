import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.5} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" unit="%" />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          <Bar dataKey="positive" name="Positive %" fill="#34d399" radius={[2, 2, 0, 0]} />
          <Bar dataKey="neutral" name="Neutral %" fill="#818cf8" radius={[2, 2, 0, 0]} />
          <Bar dataKey="negative" name="Negative %" fill="#f472b6" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex justify-center gap-6 text-xs text-[var(--text-muted)]">
        {data.map((d) => (
          <span key={d.name}>
            {d.name}: <strong className="text-[var(--text-primary)]">{d.posts}</strong> posts, mean <strong className="text-[var(--text-primary)]">{d.mean.toFixed(3)}</strong>
          </span>
        ))}
      </div>
    </Card>
  );
}
