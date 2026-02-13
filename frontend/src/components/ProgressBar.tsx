import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

interface Props {
  progress: number;
  stage: string;
  message: string;
  estimateSeconds?: number;
}

const stageLabels: Record<string, string> = {
  started: 'Initializing...',
  fetching: 'Fetching posts',
  analyzing: 'Analyzing sentiment',
  aggregating: 'Aggregating statistics',
  nlp: 'Extracting NLP features',
  summarizing: 'Generating summary',
  complete: 'Complete',
};

// IPA symbols for the animation
const IPA_SYMBOLS = [
  '\u0251', '\u0259', '\u0254', '\u025B', '\u026A', '\u028A', '\u0283',
  '\u0292', '\u014B', '\u03B8', '\u00F0', '\u0279', '\u026B', '\u0281',
  '\u0278', '\u0282', '\u0290', '\u026D', '\u0273', '\u0272',
];

// Flavor messages that rotate during long waits
const FLAVOR_MESSAGES: Record<string, string[]> = {
  fetching: [
    'Paginating through Reddit\'s API...',
    'Respecting rate limits (patience is a virtue)...',
    'Gathering community discourse...',
    'Still fetching — large subreddits take a moment...',
  ],
  analyzing: [
    'Running each post through RoBERTa...',
    'Tokenizing and classifying sentiment...',
    'Computing polarity scores in batches...',
    'Crunching sentiment probabilities...',
  ],
  nlp: [
    'Identifying named entities with spaCy...',
    'Computing bigram and trigram frequencies...',
    'Measuring vocabulary richness...',
    'Generating word clouds...',
  ],
  summarizing: [
    'Almost there — composing your summary...',
    'Synthesizing findings into a narrative...',
  ],
};

function IPAAnimation() {
  const [indices, setIndices] = useState([0, 5, 10, 15, 3]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndices(prev =>
        prev.map((idx) => (idx + 1 + Math.floor(Math.random() * 3)) % IPA_SYMBOLS.length)
      );
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center gap-3 py-4" aria-hidden="true">
      {indices.map((idx, i) => (
        <span
          key={i}
          className="text-2xl font-light transition-all duration-700 ease-in-out"
          style={{
            color: `color-mix(in srgb, var(--accent-from) ${30 + i * 15}%, var(--accent-to))`,
            opacity: 0.3 + (i % 3) * 0.2,
            transform: `translateY(${Math.sin((idx + i) * 0.8) * 6}px)`,
          }}
        >
          {IPA_SYMBOLS[idx]}
        </span>
      ))}
    </div>
  );
}

export function ProgressBar({ progress, stage, message, estimateSeconds }: Props) {
  const pct = Math.round(progress * 100);
  const label = stageLabels[stage] || stage;
  const startTimeRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [flavorIdx, setFlavorIdx] = useState(0);

  useEffect(() => {
    startTimeRef.current = Date.now();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Rotate flavor messages every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setFlavorIdx(prev => prev + 1);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const flavorMessage = useMemo(() => {
    const msgs = FLAVOR_MESSAGES[stage];
    if (!msgs || msgs.length === 0) return null;
    return msgs[flavorIdx % msgs.length];
  }, [stage, flavorIdx]);

  const showSpeedTip = stage === 'fetching' && elapsed > 15;

  const formatDuration = (s: number) => {
    if (s < 60) return `${Math.round(s)}s`;
    const m = Math.ceil(s / 60);
    return `${m} min`;
  };

  const formatElapsed = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const remainingEstimate = useMemo(() => {
    if (!estimateSeconds || progress <= 0) return null;
    const remaining = Math.max(0, estimateSeconds * (1 - progress));
    if (remaining < 5) return null;
    return formatDuration(remaining);
  }, [estimateSeconds, progress]);

  return (
    <div className="glass-card space-y-3 rounded-2xl p-6">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-[var(--text-primary)]">{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-muted)]">{formatElapsed(elapsed)}</span>
          <span className="tabular-nums text-[var(--text-secondary)]">{pct}%</span>
        </div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className="h-full rounded-full accent-gradient glow transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Backend message (specific to current operation) */}
      {message && (
        <p className="text-xs text-[var(--text-muted)]">{message}</p>
      )}

      {/* Flavor message that rotates */}
      {flavorMessage && !message && (
        <p className="text-xs italic text-[var(--text-muted)] transition-opacity duration-500">{flavorMessage}</p>
      )}

      {/* IPA animation + come-back estimate */}
      <IPAAnimation />
      {remainingEstimate && (
        <p className="text-center text-sm text-[var(--text-secondary)]">
          Come back in ~{remainingEstimate} — we'll have your results ready.
        </p>
      )}

      {showSpeedTip && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Fetching is slow without OAuth credentials. Configure your{' '}
            <Link to="/settings" className="underline hover:text-amber-200">Reddit API credentials</Link>
            {' '}for ~10x faster data acquisition.
          </span>
        </div>
      )}
    </div>
  );
}
