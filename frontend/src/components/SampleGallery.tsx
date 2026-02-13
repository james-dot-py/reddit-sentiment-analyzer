import { Loader2, MessageSquare, FileText, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchSamples } from '../api';
import type { SampleInfo } from '../types';

const SUBREDDIT_EMOJI: Record<string, string> = {
  askreddit: '💬',
  politics: '🏛️',
  science: '🔬',
  worldnews: '🌍',
  personalfinance: '💰',
  relationship_advice: '❤️',
  unpopularopinion: '🔥',
  technology: '💻',
  changemyview: '🤔',
  trueoffmychest: '😤',
};

interface Props {
  onSelect: (subreddit: string) => void;
  disabled: boolean;
}

export function SampleGallery({ onSelect, disabled }: Props) {
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSamples()
      .then(setSamples)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (error || samples.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
          Featured Communities
        </h3>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Pre-fetched data ready for instant analysis — click any card to explore
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {samples.map((sample) => {
          const emoji = SUBREDDIT_EMOJI[sample.subreddit.toLowerCase()] || '📊';
          return (
            <button
              key={sample.subreddit}
              onClick={() => onSelect(sample.subreddit)}
              disabled={disabled}
              className="group relative text-left rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4 transition-all hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sample.cached && (
                <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  <Zap size={10} />
                  Cached
                </span>
              )}

              <div className="text-2xl mb-2">{emoji}</div>

              <div className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors">
                r/{sample.subreddit}
              </div>

              <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2 leading-relaxed">
                {sample.description}
              </p>

              <div className="flex items-center gap-3 mt-3 text-[10px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1">
                  <FileText size={10} />
                  {sample.post_count} posts
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare size={10} />
                  {sample.comment_count} comments
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
