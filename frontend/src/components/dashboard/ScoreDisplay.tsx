import { Clock, Info } from 'lucide-react';
import type { ScoreComponents, StatusTag } from '../../types';
import { StatusBadge } from './StatusBadge';
import { Tooltip } from '../ui/Tooltip';

interface Props {
  score: number;
  status: StatusTag;
  components: ScoreComponents;
  brandName: string;
  snapshotDate?: string;
  lastUpdated?: string | null;
}

const componentMeta: { key: keyof ScoreComponents; label: string; weight: string; tooltip: string }[] = [
  { key: 'sentiment_mix',       label: 'Brand Sentiment',      weight: '40%', tooltip: 'The overall balance of positive vs. negative brand mentions, weighted by engagement.' },
  { key: 'community_alignment', label: 'Community Alignment',  weight: '25%', tooltip: "How closely the brand's perceived values overlap with what this community talks about and cares about." },
  { key: 'intensity',           label: 'Discussion Heat',      weight: '20%', tooltip: 'How emotionally charged the brand mentions are — neutral check-ins score lower than strong reactions.' },
  { key: 'trajectory',          label: 'Momentum',             weight: '15%', tooltip: 'Whether the tone of this week\'s mentions feels like it\'s improving, holding, or softening.' },
];

function scoreColor(score: number): string {
  if (score >= 70) return 'text-positive';
  if (score >= 50) return 'text-[var(--text-primary)]';
  if (score >= 30) return 'text-neutral-sentiment';
  return 'text-negative';
}

function formatFreshness(snapshotDate?: string, _lastUpdated?: string | null) {
  if (!snapshotDate) return null;
  const snap = new Date(snapshotDate + 'T12:00:00Z');
  const updated = snap.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });

  // Next Sunday = 7 days after the snapshot date
  const nextRun = new Date(snap);
  nextRun.setUTCDate(nextRun.getUTCDate() + 7);
  const now = new Date();
  const diffMs = nextRun.getTime() - now.getTime();
  const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  const countdown =
    diffDays === 0 ? 'Next update today'
    : diffDays === 1 ? 'Next update tomorrow'
    : `Next update in ${diffDays} days`;

  return { updated, countdown };
}

export function ScoreDisplay({ score, status, components, brandName, snapshotDate, lastUpdated }: Props) {
  const freshness = formatFreshness(snapshotDate, lastUpdated);

  return (
    <div className="paper-card p-6">
      <div className="flex items-start justify-between gap-6">
        {/* Left: brand name + freshness */}
        <div className="pt-1">
          <h2 className="heading text-2xl">{brandName}</h2>
          {freshness && (
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-[var(--text-muted)]">
              <Clock size={10} className="shrink-0" />
              <span>Updated {freshness.updated}</span>
              <span className="opacity-50">·</span>
              <span>{freshness.countdown}</span>
            </div>
          )}
        </div>

        {/* Right: BIG score */}
        <div className="text-right flex flex-col items-end">
          <div
            className={`font-semibold leading-none ${scoreColor(score)}`}
            style={{ fontFamily: 'var(--font-data)', fontSize: '5.5rem', letterSpacing: '-0.02em' }}
          >
            {score}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-1.5 uppercase tracking-[0.15em]">
            Undercurrent Score
          </p>
          <div className="mt-1.5"><StatusBadge status={status} /></div>
        </div>
      </div>

      {/* Component sub-scores */}
      <div className="mt-6 grid grid-cols-4 gap-3">
        {componentMeta.map(({ key, label, weight, tooltip }) => (
          <div key={key} className="rounded-xl bg-[var(--surface-1)] px-3 py-2.5">
            <div style={{ fontFamily: 'var(--font-data)', fontSize: '1.1rem' }} className="font-medium">
              {components[key]}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
              <Tooltip content={tooltip}>
                <Info size={10} className="text-[var(--text-muted)] opacity-50 cursor-help" />
              </Tooltip>
            </div>
            <div className="text-[9px] text-[var(--text-muted)] opacity-60">{weight}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
