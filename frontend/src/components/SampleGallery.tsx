import { Loader2, MessageSquare, FileText, Zap, ArrowRight } from 'lucide-react';
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
    <div className="space-y-5">
      <div className="text-center">
        <h3 className="text-2xl font-bold text-[var(--text-primary)]">
          Featured Communities
        </h3>
        <p className="text-base text-[var(--text-secondary)] mt-2 max-w-lg mx-auto">
          Pre-analyzed datasets ready for instant exploration — click any card to dive in
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {samples.map((sample) => {
          const emoji = SUBREDDIT_EMOJI[sample.subreddit.toLowerCase()] || '📊';
          const isInstant = sample.precomputed || sample.cached;
          return (
            <button
              key={sample.subreddit}
              onClick={() => onSelect(sample.subreddit)}
              disabled={disabled}
              className="group relative text-left rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-6 transition-all duration-200 hover:border-indigo-500/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isInstant && (
                <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
                  <Zap size={11} />
                  Instant
                </span>
              )}

              <div className="text-4xl mb-3">{emoji}</div>

              <div className="text-lg font-semibold text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors">
                r/{sample.subreddit}
              </div>

              <p className="text-sm text-[var(--text-muted)] mt-1.5 line-clamp-2 leading-relaxed">
                {sample.description}
              </p>

              <div className="flex items-center gap-3 mt-4 text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-1">
                  <FileText size={12} />
                  {sample.post_count} posts
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare size={12} />
                  {sample.comment_count} comments
                </span>
              </div>

              <div className="mt-4 flex items-center gap-1 text-xs font-medium text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                Click to explore
                <ArrowRight size={12} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
