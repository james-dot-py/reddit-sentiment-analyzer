import { ExternalLink, Plus, Search, X } from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchKeywordAnalysis } from '../api';
import type { KeywordAnalysisResult } from '../types';
import { Badge } from './ui/Badge';
import { Spinner } from './ui/Spinner';

const tooltipStyle = {
  backgroundColor: 'var(--surface-2)',
  border: '1px solid var(--glass-border)',
  borderRadius: '8px',
  fontSize: '12px',
  boxShadow: 'var(--glass-shadow)',
};

const KEYWORD_COLORS = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#c084fc', '#fb923c'];

interface Props {
  analysisId: string;
}

export function CompareSection({ analysisId }: Props) {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [results, setResults] = useState<KeywordAnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null);

  const addKeyword = () => {
    const kw = input.trim();
    if (kw && !keywords.includes(kw) && keywords.length < 10) {
      setKeywords((prev) => [...prev, kw]);
      setInput('');
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
    setResults((prev) => prev.filter((r) => r.keyword !== kw));
    if (expandedKeyword === kw) setExpandedKeyword(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword();
    }
  };

  const runComparison = async () => {
    if (keywords.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchKeywordAnalysis(keywords, analysisId);
      setResults(data.results);
      if (data.results.length > 0 && !expandedKeyword) {
        setExpandedKeyword(data.results[0].keyword);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Build comparison bar chart data
  const comparisonData = results.length > 0
    ? [
        ...results.map((r) => ({
          name: r.keyword,
          mean: Number(r.stats.mean.toFixed(3)),
          mentions: r.mention_count,
          positive: r.stats.positive_pct,
          negative: r.stats.negative_pct,
        })),
        {
          name: 'Baseline',
          mean: Number(results[0].baseline_stats.mean.toFixed(3)),
          mentions: results[0].baseline_stats.total_count,
          positive: results[0].baseline_stats.positive_pct,
          negative: results[0].baseline_stats.negative_pct,
        },
      ]
    : [];

  const expanded = results.find((r) => r.keyword === expandedKeyword);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1">
          Keyword Valence
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          What does this community think about a topic? Enter keywords to compare sentiment.
        </p>
      </div>

      {/* Keyword input bar */}
      <div className="flex flex-wrap items-center gap-2">
        {keywords.map((kw, i) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-medium border"
            style={{
              backgroundColor: `${KEYWORD_COLORS[i % KEYWORD_COLORS.length]}15`,
              borderColor: `${KEYWORD_COLORS[i % KEYWORD_COLORS.length]}30`,
              color: KEYWORD_COLORS[i % KEYWORD_COLORS.length],
            }}
          >
            {kw}
            <button onClick={() => removeKeyword(kw)} className="opacity-60 hover:opacity-100">
              <X size={12} />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={keywords.length === 0 ? 'e.g., "admin", "students", "parents"' : 'Add keyword...'}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-1.5 text-sm text-[var(--text-primary)] w-48"
          />
          <button
            onClick={addKeyword}
            disabled={!input.trim()}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] disabled:opacity-30"
          >
            <Plus size={16} />
          </button>
        </div>
        {keywords.length > 0 && (
          <button
            onClick={runComparison}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg accent-gradient px-4 py-1.5 text-sm font-medium text-white transition-all glow-hover disabled:opacity-40"
          >
            {loading ? <Spinner className="h-4 w-4 text-white" /> : <Search size={14} />}
            Compare
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Comparison overview chart */}
      {comparisonData.length > 0 && (
        <div className="space-y-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={comparisonData} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.5} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="mean" name="Mean Sentiment" fill="#818cf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Summary stats row */}
          <div className="flex flex-wrap gap-3">
            {results.map((r, i) => (
              <button
                key={r.keyword}
                onClick={() => setExpandedKeyword(r.keyword === expandedKeyword ? null : r.keyword)}
                className={`flex-1 min-w-[140px] rounded-xl border p-3 text-left transition-all ${
                  expandedKeyword === r.keyword
                    ? 'border-indigo-500/40 bg-indigo-500/5'
                    : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: KEYWORD_COLORS[i % KEYWORD_COLORS.length] }}
                  />
                  <span className="text-sm font-medium text-[var(--text-primary)]">"{r.keyword}"</span>
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {r.mention_count} mentions &middot; mean {r.stats.mean.toFixed(3)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Expanded keyword detail */}
      {expanded && (
        <div className="space-y-5 border-t border-[var(--border-subtle)] pt-5">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">
            Deep dive: "{expanded.keyword}"
            <span className="ml-2 font-normal text-[var(--text-muted)]">
              ({expanded.mention_count} mentions)
            </span>
          </h4>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Sentiment timeline for this keyword */}
            {expanded.timeline.length > 1 && (
              <div>
                <h5 className="mb-2 text-xs font-medium text-[var(--text-muted)]">Sentiment Over Time</h5>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={expanded.timeline} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.5} />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="var(--text-muted)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="var(--text-muted)" domain={[-1, 1]} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="avg_sentiment" stroke="#818cf8" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Mini distribution */}
            {expanded.distribution.length > 0 && (
              <div>
                <h5 className="mb-2 text-xs font-medium text-[var(--text-muted)]">Polarity Distribution</h5>
                <MiniHistogram scores={expanded.distribution} />
              </div>
            )}
          </div>

          {/* Context snippets */}
          {expanded.snippets.length > 0 && (
            <div>
              <h5 className="mb-2 text-xs font-medium text-[var(--text-muted)]">Context Snippets</h5>
              <div className="space-y-2">
                {expanded.snippets.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        <HighlightKeyword text={s.text} keyword={expanded.keyword} />
                      </p>
                      <Badge label={s.sentiment_label as 'positive' | 'negative' | 'neutral'} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span className="tabular-nums">{s.sentiment_score.toFixed(3)}</span>
                      <span>&middot;</span>
                      <span>{s.source_type}</span>
                      {s.permalink && (
                        <>
                          <span>&middot;</span>
                          <a
                            href={s.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 hover:text-indigo-400"
                          >
                            source <ExternalLink size={10} />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top positive/negative posts */}
          {(expanded.top_positive.length > 0 || expanded.top_negative.length > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {expanded.top_positive.length > 0 && (
                <div>
                  <h5 className="mb-2 text-xs font-medium text-emerald-400">Most Positive Mentions</h5>
                  <div className="space-y-1.5">
                    {expanded.top_positive.map((p) => (
                      <a
                        key={p.post.id}
                        href={`https://reddit.com${p.post.permalink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg border border-[var(--border-subtle)] p-2.5 text-xs hover:border-emerald-500/30 transition-colors"
                      >
                        <span className="text-[var(--text-primary)] line-clamp-1">{p.post.title}</span>
                        <span className="text-emerald-400 tabular-nums"> {p.sentiment.compound_score.toFixed(3)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {expanded.top_negative.length > 0 && (
                <div>
                  <h5 className="mb-2 text-xs font-medium text-red-400">Most Negative Mentions</h5>
                  <div className="space-y-1.5">
                    {expanded.top_negative.map((p) => (
                      <a
                        key={p.post.id}
                        href={`https://reddit.com${p.post.permalink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg border border-[var(--border-subtle)] p-2.5 text-xs hover:border-red-500/30 transition-colors"
                      >
                        <span className="text-[var(--text-primary)] line-clamp-1">{p.post.title}</span>
                        <span className="text-red-400 tabular-nums"> {p.sentiment.compound_score.toFixed(3)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Highlight the keyword within text */
function HighlightKeyword({ text, keyword }: { text: string; keyword: string }) {
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="rounded bg-indigo-500/20 px-0.5 text-indigo-300">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Mini histogram of sentiment scores */
function MiniHistogram({ scores }: { scores: number[] }) {
  // Bucket scores into 10 bins from -1 to 1
  const bins = Array.from({ length: 10 }, (_, i) => ({
    range: `${(-1 + i * 0.2).toFixed(1)}`,
    count: 0,
  }));
  for (const s of scores) {
    const idx = Math.min(9, Math.max(0, Math.floor((s + 1) / 0.2)));
    bins[idx].count++;
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={bins} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
        <XAxis dataKey="range" tick={{ fontSize: 9 }} stroke="var(--text-muted)" />
        <YAxis tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar
          dataKey="count"
          radius={[2, 2, 0, 0]}
          fill="#818cf8"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
