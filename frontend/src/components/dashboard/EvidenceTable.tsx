import { ExternalLink } from 'lucide-react';
import type { EvidencePost } from '../../types';

interface Props {
  posts: EvidencePost[];
}

export function EvidenceTable({ posts }: Props) {
  if (!posts.length) return null;

  return (
    <div className="paper-card p-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-4">
        Key Evidence
      </h3>
      <div className="space-y-3">
        {posts.map((post, i) => (
          <div key={i} className="flex items-start gap-3 rounded bg-[var(--surface-1)] p-3">
            <div className="flex-shrink-0 text-center">
              <div className="data-text text-sm font-medium">{post.upvotes}</div>
              <div className="text-[9px] text-[var(--text-muted)]">votes</div>
            </div>
            <div className="flex-1 min-w-0">
              <a
                href={post.post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[var(--text-primary)] hover:underline inline-flex items-center gap-1"
              >
                <span className="line-clamp-1">{post.post_title}</span>
                <ExternalLink size={11} className="flex-shrink-0 text-[var(--text-muted)]" />
              </a>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                {post.why_notable}
              </p>
              <div className="text-[10px] text-[var(--text-muted)] mt-1">
                {post.comment_count} comments
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
