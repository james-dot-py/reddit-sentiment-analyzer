import { useState, useMemo } from 'react';
import { ExternalLink, MessageSquare, ArrowUp } from 'lucide-react';
import type { EvidencePost } from '../../types';
import { SectionVerdict } from './SectionVerdict';

interface Props {
  posts: EvidencePost[];
  sectionVerdict?: string;
}

type SortKey = 'upvotes' | 'comment_count' | 'date';
type SentimentFilter = 'all' | 'positive' | 'negative' | 'neutral';

function sentimentBadge(label?: string) {
  if (!label) return null;
  const styles: Record<string, string> = {
    positive: 'bg-[var(--color-strength)]/10 text-[var(--color-strength)] border-[var(--color-strength)]/20',
    negative: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/20',
    neutral: 'bg-[var(--color-info)]/10 text-[var(--color-info)] border-[var(--color-info)]/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${styles[label] || styles.neutral}`}>
      {label}
    </span>
  );
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch { return dateStr; }
}

export function EvidenceTable({ posts, sectionVerdict }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>('upvotes');
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all');
  const [subredditFilter, setSubredditFilter] = useState<string>('all');

  const subreddits = useMemo(() => {
    const subs = new Set(posts.map(p => p.subreddit).filter(Boolean));
    return Array.from(subs);
  }, [posts]);

  const filtered = useMemo(() => {
    let result = [...posts];

    if (sentimentFilter !== 'all') {
      result = result.filter(p => p.sentiment_label === sentimentFilter);
    }
    if (subredditFilter !== 'all') {
      result = result.filter(p => p.subreddit === subredditFilter);
    }

    result.sort((a, b) => {
      if (sortBy === 'date') {
        return (b.post_date || '').localeCompare(a.post_date || '');
      }
      return b[sortBy] - a[sortBy];
    });

    return result;
  }, [posts, sentimentFilter, subredditFilter, sortBy]);

  if (!posts.length) return null;

  const sentimentOptions: { value: SentimentFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'positive', label: 'Positive' },
    { value: 'negative', label: 'Negative' },
    { value: 'neutral', label: 'Neutral' },
  ];

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'upvotes', label: 'Votes' },
    { value: 'comment_count', label: 'Comments' },
    { value: 'date', label: 'Date' },
  ];

  return (
    <div className="paper-card p-6">
      <h3 className="section-label mb-3">Key Evidence</h3>

      <SectionVerdict verdict={sectionVerdict} />

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Sentiment toggle pills */}
        <div className="flex rounded border border-[var(--border-default)] overflow-hidden">
          {sentimentOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSentimentFilter(opt.value)}
              className={`px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                sentimentFilter === opt.value
                  ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Subreddit dropdown */}
        {subreddits.length > 1 && (
          <select
            value={subredditFilter}
            onChange={e => setSubredditFilter(e.target.value)}
            className="appearance-none rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2.5 py-1 text-[10px] text-[var(--text-secondary)] cursor-pointer"
          >
            <option value="all">All subreddits</option>
            {subreddits.map(s => (
              <option key={s} value={s}>r/{s}</option>
            ))}
          </select>
        )}

        <div className="flex-1" />

        {/* Sort selector */}
        <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
          <span>Sort:</span>
          {sortOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                sortBy === opt.value
                  ? 'text-[var(--text-primary)] font-medium'
                  : 'hover:text-[var(--text-secondary)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-xs text-[var(--text-muted)] text-center py-4">
          No evidence posts match the selected filters.
        </p>
      )}

      {/* Evidence cards */}
      <div className="space-y-3">
        {filtered.slice(0, 8).map((post, i) => {
          const highImpact = post.upvotes >= 500;

          return (
            <div
              key={i}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 transition-colors hover:border-[var(--border-default)]"
            >
              {/* Metadata row */}
              <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mb-2 flex-wrap">
                <span className="inline-flex items-center gap-0.5 data-text font-medium">
                  <ArrowUp size={10} /> {post.upvotes}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <MessageSquare size={9} /> {post.comment_count}
                </span>
                {post.subreddit && <span>r/{post.subreddit}</span>}
                {post.post_date && <span>{formatDate(post.post_date)}</span>}
                {sentimentBadge(post.sentiment_label)}
                {highImpact && (
                  <span className="rounded-full bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/20 px-1.5 py-0 text-[9px] font-medium">
                    High Impact
                  </span>
                )}
              </div>

              {/* Title */}
              <a
                href={post.post_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm leading-snug text-[var(--text-primary)] hover:underline inline-flex items-start gap-1 ${highImpact ? 'font-semibold' : 'font-medium'}`}
              >
                {post.post_title}
                <ExternalLink size={11} className="shrink-0 mt-0.5 text-[var(--text-muted)]" />
              </a>

              {/* AI Summary */}
              {post.why_notable && (
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1.5">
                  {post.why_notable}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
