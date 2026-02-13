import { ExternalLink } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import type { PostWithSentiment } from '../../types';

interface Props {
  posts: PostWithSentiment[];
}

function PostTable({ title, posts }: { title: string; posts: PostWithSentiment[] }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-[var(--text-muted)]">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="py-2 pr-3 text-left text-xs font-medium text-[var(--text-muted)]">#</th>
              <th className="py-2 pr-3 text-left text-xs font-medium text-[var(--text-muted)]">Title</th>
              <th className="py-2 pr-3 text-right text-xs font-medium text-[var(--text-muted)]">Score</th>
              <th className="py-2 pr-3 text-right text-xs font-medium text-[var(--text-muted)]">Comments</th>
              <th className="py-2 text-center text-xs font-medium text-[var(--text-muted)]">Polarity</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p, i) => (
              <tr key={p.post.id} className="border-b border-[var(--border-subtle)]">
                <td className="py-2 pr-3 tabular-nums text-[var(--text-muted)]">{i + 1}</td>
                <td className="max-w-xs truncate py-2 pr-3">
                  <a
                    href={`https://reddit.com${p.post.permalink}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--text-primary)] hover:text-indigo-400"
                  >
                    <span className="truncate">{p.post.title}</span>
                    <ExternalLink size={12} className="shrink-0 opacity-50" />
                  </a>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-[var(--text-secondary)]">{p.post.score}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-[var(--text-secondary)]">{p.post.num_comments}</td>
                <td className="py-2 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Badge label={p.sentiment.label} />
                    <span className="text-xs tabular-nums text-[var(--text-muted)]">
                      {p.sentiment.compound_score.toFixed(3)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PolarizingPosts({ posts }: Props) {
  const sorted = [...posts].sort((a, b) => b.sentiment.compound_score - a.sentiment.compound_score);
  const topPositive = sorted.slice(0, 10);
  const topNegative = sorted.slice(-10).reverse();

  return (
    <Card
      title="Salient Extrema"
      tooltip="The top 10 most positive and top 10 most negative posts by compound polarity score."
    >
      <div className="space-y-6">
        <PostTable title="Positive Extrema" posts={topPositive} />
        <PostTable title="Negative Extrema" posts={topNegative} />
      </div>
    </Card>
  );
}
