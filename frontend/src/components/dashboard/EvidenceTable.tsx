import { useState, useMemo } from 'react';
import { ExternalLink, Search, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import type { EvidencePost } from '../../types';

interface Props {
  posts: EvidencePost[];
}

type SortKey = 'upvotes' | 'comment_count';

export function EvidenceTable({ posts }: Props) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('upvotes');
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let result = [...posts];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.post_title.toLowerCase().includes(q) ||
        p.why_notable.toLowerCase().includes(q),
      );
    }
    result.sort((a, b) => {
      const diff = a[sortBy] - b[sortBy];
      return sortAsc ? diff : -diff;
    });
    return result;
  }, [posts, search, sortBy, sortAsc]);

  if (!posts.length) return null;

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(false); }
  }

  const SortIcon = ({ field }: { field: SortKey }) => {
    if (sortBy !== field) return <ArrowUpDown size={10} className="text-[var(--text-muted)] opacity-40" />;
    return sortAsc
      ? <ChevronUp size={10} className="text-[var(--text-primary)]" />
      : <ChevronDown size={10} className="text-[var(--text-primary)]" />;
  };

  return (
    <div className="paper-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
          Key Evidence
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter posts..."
              className="rounded border border-[var(--border-default)] bg-[var(--surface-card)] pl-7 pr-3 py-1 text-xs text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] w-44 focus:outline-none focus:border-[var(--text-muted)]"
            />
          </div>
          <button
            onClick={() => toggleSort('upvotes')}
            className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Votes <SortIcon field="upvotes" />
          </button>
          <button
            onClick={() => toggleSort('comment_count')}
            className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Comments <SortIcon field="comment_count" />
          </button>
        </div>
      </div>

      {filtered.length === 0 && search.trim() && (
        <p className="text-xs text-[var(--text-muted)] text-center py-4">
          No posts match "{search}"
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((post, i) => (
          <div
            key={i}
            className="rounded bg-[var(--surface-1)] transition-colors hover:bg-[var(--surface-2)] cursor-pointer"
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <div className="flex items-start gap-3 p-3">
              <div className="flex-shrink-0 text-center w-10">
                <div className="data-text text-sm font-medium">{post.upvotes}</div>
                <div className="text-[9px] text-[var(--text-muted)]">votes</div>
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={post.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-[var(--text-primary)] hover:underline inline-flex items-center gap-1"
                  onClick={e => e.stopPropagation()}
                >
                  <span className={expanded === i ? '' : 'line-clamp-1'}>{post.post_title}</span>
                  <ExternalLink size={11} className="flex-shrink-0 text-[var(--text-muted)]" />
                </a>
                {expanded !== i && (
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                    {post.why_notable}
                  </p>
                )}
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="data-text text-[10px] text-[var(--text-muted)]">
                  {post.comment_count} comments
                </div>
              </div>
            </div>

            {expanded === i && (
              <div className="px-3 pb-3 pt-0 ml-13">
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed border-l-2 border-[var(--border-default)] pl-3">
                  {post.why_notable}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
