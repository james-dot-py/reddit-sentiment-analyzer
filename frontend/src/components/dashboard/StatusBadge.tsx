import clsx from 'clsx';
import type { StatusTag, Trajectory } from '../../types';

const statusStyles: Record<StatusTag, { bg: string; text: string; label: string }> = {
  thriving:  { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Thriving' },
  positive:  { bg: 'bg-green-50 border-green-200',     text: 'text-green-700',   label: 'Positive' },
  stable:    { bg: 'bg-slate-50 border-slate-200',      text: 'text-slate-600',   label: 'Stable' },
  watch:     { bg: 'bg-amber-50 border-amber-200',      text: 'text-amber-700',   label: 'Watch' },
  at_risk:   { bg: 'bg-orange-50 border-orange-200',    text: 'text-orange-700',  label: 'At Risk' },
  declining: { bg: 'bg-red-50 border-red-200',          text: 'text-red-700',     label: 'Declining' },
  crisis:    { bg: 'bg-red-100 border-red-300',         text: 'text-red-800',     label: 'Crisis' },
};

export function StatusBadge({ status, size = 'md' }: { status: StatusTag; size?: 'sm' | 'md' }) {
  const s = statusStyles[status] || statusStyles.stable;
  return (
    <span className={clsx(
      'inline-flex items-center rounded-full border font-medium',
      s.bg, s.text,
      size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs',
    )}>
      {s.label}
    </span>
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
