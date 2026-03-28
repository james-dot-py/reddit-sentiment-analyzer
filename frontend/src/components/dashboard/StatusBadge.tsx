import clsx from 'clsx';
import type { StatusTag, Trajectory } from '../../types';
import { Tooltip } from '../ui/Tooltip';

const statusStyles: Record<StatusTag, { bg: string; text: string; label: string; tooltip: string }> = {
  thriving:  { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Thriving',  tooltip: 'Score 80+. Strong positive sentiment with high community alignment.' },
  positive:  { bg: 'bg-green-50 border-green-200',     text: 'text-green-700',   label: 'Positive',  tooltip: 'Score 65–79. More positive than negative; community generally supportive.' },
  stable:    { bg: 'bg-slate-50 border-slate-200',     text: 'text-slate-600',   label: 'Stable',    tooltip: 'Score 50–64. Mixed or neutral sentiment with no strong directional signal.' },
  watch:     { bg: 'bg-amber-50 border-amber-200',     text: 'text-amber-700',   label: 'Watch',     tooltip: 'Score 40–49. Some negative signals present alongside positives.' },
  at_risk:   { bg: 'bg-orange-50 border-orange-200',   text: 'text-orange-700',  label: 'At Risk',   tooltip: 'Score 30–39. Friction points are outweighing positive signals this week.' },
  declining: { bg: 'bg-red-50 border-red-200',         text: 'text-red-700',     label: 'Declining', tooltip: 'Score 15–29. Predominantly negative sentiment; trust signals are weakening.' },
  crisis:    { bg: 'bg-red-100 border-red-300',        text: 'text-red-800',     label: 'Crisis',    tooltip: 'Score 0–14. Severe negative sentiment dominating community conversation.' },
};

export function StatusBadge({ status, size = 'md' }: { status: StatusTag; size?: 'sm' | 'md' }) {
  const s = statusStyles[status] || statusStyles.stable;
  return (
    <Tooltip content={s.tooltip} position="bottom">
      <span className={clsx(
        'inline-flex items-center rounded-full border font-medium cursor-help',
        s.bg, s.text,
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs',
      )}>
        {s.label}
      </span>
    </Tooltip>
  );
}

const trajectoryLabels: Record<Trajectory, { icon: string; label: string; color: string }> = {
  improving: { icon: '↑', label: 'Improving', color: 'text-emerald-600' },
  stable:    { icon: '→', label: 'Stable',    color: 'text-slate-500' },
  declining: { icon: '↓', label: 'Declining', color: 'text-red-600' },
  volatile:  { icon: '↕', label: 'Volatile',  color: 'text-amber-600' },
};

export function TrajectoryBadge({ trajectory }: { trajectory: Trajectory | null }) {
  if (!trajectory) return null;
  const t = trajectoryLabels[trajectory] || trajectoryLabels.stable;
  return (
    <span className={clsx('inline-flex items-center gap-1 text-sm font-medium', t.color)}>
      <span className="data-text">{t.icon}</span> {t.label}
    </span>
  );
}
