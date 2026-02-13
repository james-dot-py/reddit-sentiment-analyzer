import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '../ui/Card';
import type { TimeSeriesPoint } from '../../types';

const COLORS = ['#818cf8', '#a78bfa', '#c084fc', '#f472b6', '#34d399', '#fbbf24'];

const tooltipStyle = {
  backgroundColor: 'var(--surface-2)',
  border: '1px solid var(--glass-border)',
  borderRadius: '8px',
  fontSize: '12px',
  boxShadow: 'var(--glass-shadow)',
};

interface Props {
  timeSeries: TimeSeriesPoint[];
}

interface PivotRow {
  date: string;
  [subreddit: string]: string | number;
}

function pivotData(points: TimeSeriesPoint[]) {
  const subreddits = [...new Set(points.map((p) => p.subreddit))];
  const byDate: Record<string, PivotRow> = {};

  for (const p of points) {
    if (!byDate[p.date]) byDate[p.date] = { date: p.date };
    byDate[p.date][p.subreddit] = p.avg_sentiment;
  }

  const data = Object.values(byDate).sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );

  return { data, subreddits };
}

export function SentimentOverTime({ timeSeries }: Props) {
  if (timeSeries.length === 0) {
    return (
      <Card title="Temporal Dynamics">
        <p className="text-sm text-[var(--text-muted)]">No time series data available.</p>
      </Card>
    );
  }

  const { data, subreddits } = pivotData(timeSeries);

  return (
    <Card
      title="Temporal Dynamics"
      tooltip="Average polarity score by date for each community. Values above 0 lean positive, below 0 lean negative."
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.5} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
          <YAxis domain={[-1, 1]} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          {subreddits.map((sub, i) => (
            <Line
              key={sub}
              type="monotone"
              dataKey={sub}
              name={`r/${sub}`}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
