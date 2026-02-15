import {
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

const COLORS = ['#2E5E4E', '#8A1C1C', '#D4A017', '#4A4A4A', '#757575', '#222222'];

const tooltipStyle = {
  backgroundColor: 'var(--surface-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '3px',
  fontSize: '12px',
  fontFamily: 'var(--font-data)',
  boxShadow: 'var(--paper-shadow)',
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
        <p className="body-text text-sm">No time series data available.</p>
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
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--text-muted)" axisLine={false} tickLine={false} />
          <YAxis domain={[-1, 1]} tick={{ fontSize: 11 }} stroke="var(--text-muted)" axisLine={false} tickLine={false} />
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
