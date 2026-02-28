import { Clock } from 'lucide-react';
import type { ScoreComponents, StatusTag } from '../../types';
import { StatusBadge } from './StatusBadge';

interface Props {
  score: number;
  status: StatusTag;
  components: ScoreComponents;
  brandName: string;
  snapshotDate?: string;
  lastUpdated?: string | null;
}

const componentMeta: { key: keyof ScoreComponents; label: string; weight: string }[] = [
  { key: 'sentiment_mix',        label: 'Sentiment Mix',        weight: '40%' },
  { key: 'community_alignment',  label: 'Community Alignment',  weight: '25%' },
  { key: 'intensity',            label: 'Intensity',            weight: '20%' },
  { key: 'trajectory',           label: 'Trajectory',           weight: '15%' },
];

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-700';
  if (score >= 50) return 'text-slate-700';
  if (score >= 30) return 'text-amber-700';
  return 'text-red-700';
}

function formatFreshness(snapshotDate?: string, lastUpdated?: string | null) {
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="heading text-2xl">{brandName}</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1 uppercase tracking-wider">Undercurrent Score</p>
          {freshness && (
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-[var(--text-muted)]">
              <Clock size={10} className="shrink-0" />
              <span>Last updated: {freshness.updated}</span>
              <span className="opacity-50">·</span>
              <span>{freshness.countdown}</span>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className={`data-text text-5xl font-medium ${scoreColor(score)}`}>{score}</div>
          <div className="mt-1"><StatusBadge status={status} /></div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-3">
        {componentMeta.map(({ key, label, weight }) => (
          <div key={key} className="rounded bg-[var(--surface-1)] px-3 py-2.5">
            <div className="data-text text-lg font-medium">{components[key]}</div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{label}</div>
            <div className="text-[9px] text-[var(--text-muted)] opacity-60">{weight}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
