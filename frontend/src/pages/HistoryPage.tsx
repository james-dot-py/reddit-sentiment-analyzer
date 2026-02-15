import { Archive, ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteAnalysis, fetchAnalysisHistory, type AnalysisHistoryItem } from '../api';

function sentimentColor(score: number): string {
  if (score > 0.1) return 'text-emerald-400';
  if (score < -0.1) return 'text-red-400';
  return 'text-[var(--text-muted)]';
}

function sentimentLabel(score: number): string {
  if (score > 0.1) return 'positive';
  if (score < -0.1) return 'negative';
  return 'neutral';
}

export function HistoryPage() {
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAnalysisHistory()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteAnalysis(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleLoad = (id: string) => {
    navigate('/', { state: { loadAnalysisId: id } });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={14} />
        Back to Analysis
      </Link>

      <div>
        <h1 className="text-2xl font-bold accent-text">Analysis Archive</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Previously completed analyses, persisted across sessions.</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-indigo-500" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="py-20 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
            <Archive size={28} className="text-[var(--text-muted)]" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">No analyses saved</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Run an analysis from the main page and it will appear here automatically.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => handleLoad(item.id)}
              className="group paper-card cursor-pointer rounded p-5 transition-glass"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-[var(--text-primary)] truncate">{item.title}</h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    <span>{new Date(item.created_at).toLocaleString()}</span>
                    <span>{item.post_count} posts</span>
                    {item.comment_count > 0 && <span>{item.comment_count} comments</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium tabular-nums ${sentimentColor(item.overall_mean_sentiment)}`}>
                    {item.overall_mean_sentiment.toFixed(3)} ({sentimentLabel(item.overall_mean_sentiment)})
                  </span>
                  <button
                    onClick={(e) => handleDelete(item.id, e)}
                    className="rounded-lg p-2 text-[var(--text-muted)] opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    title="Delete analysis"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
