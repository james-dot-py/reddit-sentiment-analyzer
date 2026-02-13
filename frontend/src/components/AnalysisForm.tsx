import { Clock, Play, Square } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AnalysisRequest, SortMethod, TimeFilter } from '../types';
import type { AnalysisStatus } from '../hooks/useAnalysis';
import { SubredditTagInput } from './SubredditTagInput';

interface Props {
  onSubmit: (request: AnalysisRequest) => void;
  onCancel: () => void;
  status: AnalysisStatus;
}

const POST_LIMITS = [25, 50, 100, 250, 500, 1000];

export function AnalysisForm({ onSubmit, onCancel, status }: Props) {
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [postLimit, setPostLimit] = useState(25);
  const [sort, setSort] = useState<SortMethod>('hot');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week');
  const [includeComments, setIncludeComments] = useState(false);
  const [commentDepth, setCommentDepth] = useState(1);

  const isLoading = status === 'loading';

  const estimate = useMemo(() => {
    if (subreddits.length === 0) return null;
    const numSubs = subreddits.length;
    const fetchRequestsPerSub = Math.ceil(postLimit / 100);
    const commentRequests = includeComments ? Math.min(postLimit, 50) * numSubs : 0;
    const totalRequests = (fetchRequestsPerSub * numSubs) + commentRequests;
    // Browser fetches at ~2.5s per request
    const fetchTime = totalRequests * 2.5;
    const totalTexts = postLimit * numSubs + (includeComments ? postLimit * numSubs * 5 : 0);
    const analysisTime = Math.ceil(totalTexts / 16) * 1;
    const nlpTime = 5;
    const total = fetchTime + analysisTime + nlpTime;
    const fmt = (s: number) => {
      if (s < 60) return `~${Math.round(s)}s`;
      const m = Math.ceil(s / 60);
      return `~${m} min`;
    };
    return { display: fmt(total), total };
  }, [subreddits.length, postLimit, includeComments]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (subreddits.length === 0) return;
    onSubmit({
      subreddits,
      post_limit: postLimit,
      sort,
      time_filter: timeFilter,
      include_comments: includeComments,
      comment_depth: commentDepth,
    });
  };

  const selectClass =
    'rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)]';

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-4 rounded-2xl p-6">
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
          Communities
        </label>
        <SubredditTagInput tags={subreddits} onChange={setSubreddits} disabled={isLoading} />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Posts
          </label>
          <select value={postLimit} onChange={(e) => setPostLimit(Number(e.target.value))} disabled={isLoading} className={selectClass}>
            {POST_LIMITS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Ordering
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortMethod)} disabled={isLoading} className={selectClass}>
            <option value="hot">Hot</option>
            <option value="new">New</option>
            <option value="rising">Rising</option>
            <option value="top">Top</option>
          </select>
        </div>

        {sort === 'top' && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Time
            </label>
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value as TimeFilter)} disabled={isLoading} className={selectClass}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
              <option value="all">All time</option>
            </select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={includeComments}
              onChange={(e) => setIncludeComments(e.target.checked)}
              disabled={isLoading}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Include Comments
          </label>
          {includeComments && (
            <select value={commentDepth} onChange={(e) => setCommentDepth(Number(e.target.value))} disabled={isLoading} className={selectClass}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>Depth {n}</option>
              ))}
            </select>
          )}
        </div>

        <div className="ml-auto">
          {isLoading ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <Square size={14} />
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={subreddits.length === 0}
              className="inline-flex items-center gap-2 rounded-lg accent-gradient px-5 py-2 text-sm font-medium text-white transition-all glow-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play size={14} />
              Run Analysis
            </button>
          )}
        </div>
      </div>

      {estimate && !isLoading && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Clock size={12} />
          <span>
            Estimated time: <strong className="text-[var(--text-secondary)]">{estimate.display}</strong>
          </span>
        </div>
      )}
    </form>
  );
}
