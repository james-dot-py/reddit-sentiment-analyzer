import { Search } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { useKeywordSentiment } from '../../hooks/useKeywordSentiment';

const tooltipStyle = {
  backgroundColor: 'var(--surface-2)',
  border: '1px solid var(--glass-border)',
  borderRadius: '8px',
  fontSize: '12px',
  boxShadow: 'var(--glass-shadow)',
};

interface Props {
  analysisId: string;
}

export function KeywordSentiment({ analysisId }: Props) {
  const [input, setInput] = useState('');
  const { loading, data, error, compare } = useKeywordSentiment(analysisId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) compare(input.trim());
  };

  const chartData = data
    ? [
        {
          name: `Contains "${data.keyword}"`,
          mean: Number(data.with_keyword.mean.toFixed(3)),
          positive: data.with_keyword.positive_pct,
          negative: data.with_keyword.negative_pct,
          count: data.with_keyword.total_count,
        },
        {
          name: `Without "${data.keyword}"`,
          mean: Number(data.without_keyword.mean.toFixed(3)),
          positive: data.without_keyword.positive_pct,
          negative: data.without_keyword.negative_pct,
          count: data.without_keyword.total_count,
        },
      ]
    : [];

  return (
    <Card
      title="Keyword Valence"
      tooltip="Compare the average polarity of posts and comments that mention a specific keyword vs. those that don't."
    >
      <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter a keyword or topic..."
          className="flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="inline-flex items-center gap-1.5 rounded-lg accent-gradient px-4 py-2 text-sm font-medium text-white transition-all glow-hover disabled:opacity-40"
        >
          {loading ? <Spinner className="h-4 w-4 text-white" /> : <Search size={14} />}
          Compare
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {data && chartData.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.5} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="positive" name="Positive %" fill="#34d399" radius={[2, 2, 0, 0]} />
              <Bar dataKey="negative" name="Negative %" fill="#f472b6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex justify-center gap-6 text-xs text-[var(--text-muted)]">
            {chartData.map((d) => (
              <span key={d.name}>
                {d.name}: <strong>{d.count}</strong> posts, mean <strong>{d.mean}</strong>
              </span>
            ))}
          </div>
        </>
      )}

      {!data && !loading && (
        <p className="text-center text-sm text-[var(--text-muted)]">Enter a keyword above to compare valence.</p>
      )}
    </Card>
  );
}
