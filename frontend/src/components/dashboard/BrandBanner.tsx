import { useState } from 'react';
import { ChevronDown, RefreshCw, Calendar, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { ScoreComponents, StatusTag, Project, BrandConfig, ViewMode } from '../../types';
import { StatusBadge } from './StatusBadge';
import { MethodologyModal } from './MethodologyModal';

interface Props {
  // Brand data
  score: number;
  status: StatusTag;
  components: ScoreComponents;
  brandName: string;
  snapshotDate?: string;
  projectName?: string;
  // Navigation
  projects: Project[];
  selectedProjectId?: string;
  selectedBrandId?: string;
  availableWeeks: string[];
  selectedWeek?: string;
  onProjectChange: (projectId: string) => void;
  onBrandChange: (brandId: string) => void;
  onWeekChange: (week: string | undefined) => void;
  onRefresh: () => void;
  loading: boolean;
  // View mode
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  // Export slot
  exportButton?: React.ReactNode;
  // Tier gating
  deepDiveLocked?: boolean;
  // Data quality
  mentionCount?: number;
  confidenceLevel?: 'low' | 'moderate' | 'high';
}

const COMPONENT_META: { key: keyof ScoreComponents; label: string; weight: number; color: string }[] = [
  { key: 'sentiment_mix',       label: 'Brand Sentiment',      weight: 0.40, color: 'var(--color-accent-500)' },
  { key: 'community_alignment', label: 'Community Alignment',   weight: 0.25, color: 'var(--color-strength)' },
  { key: 'intensity',           label: 'Discussion Heat',       weight: 0.20, color: 'var(--color-warning)' },
  { key: 'trajectory',          label: 'Momentum',              weight: 0.15, color: 'var(--color-trend)' },
];

function scoreColor(score: number): string {
  if (score >= 70) return 'var(--color-strength)';
  if (score >= 50) return 'var(--text-primary)';
  if (score >= 36) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function formatWeek(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    return 'Week of ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  } catch { return dateStr; }
}

function formatWeekShort(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch { return dateStr; }
}

function bannerTint(status: StatusTag): string {
  if (status === 'crisis' || status === 'declining') return 'rgba(232, 93, 74, 0.04)';
  if (status === 'at_risk') return 'rgba(232, 93, 74, 0.025)';
  return 'transparent';
}

export function BrandBanner({
  score, status, components, brandName, snapshotDate, projectName,
  projects, selectedProjectId, selectedBrandId, availableWeeks, selectedWeek,
  onProjectChange, onBrandChange, onWeekChange, onRefresh, loading,
  viewMode, onViewModeChange,
  exportButton, deepDiveLocked,
  mentionCount, confidenceLevel,
}: Props) {
  const [showMethodology, setShowMethodology] = useState(false);

  const selectedProject = projects.find(p => p.project_id === selectedProjectId);
  const allBrands = selectedProject?.brands ?? [];

  // Build composition bar data
  const compositionData = COMPONENT_META.map(({ key, label, weight, color }) => ({
    name: label,
    value: Math.round(components[key] * weight),
    score: components[key],
    weight: Math.round(weight * 100),
    color,
  }));

  return (
    <>
      <div
        className="paper-card overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${bannerTint(status)}, var(--surface-card))` }}
      >
        {/* Top row: project selector + controls */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-0">
          {/* Project selector */}
          <div className="relative">
            <select
              value={selectedProjectId || ''}
              onChange={e => onProjectChange(e.target.value)}
              className="appearance-none rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-1.5 pr-8 text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
            >
              <option value="">Select project...</option>
              {projects.map(p => (
                <option key={p.project_id} value={p.project_id}>{p.project_name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" />
          </div>

          <div className="flex-1" />

          {/* Week selector */}
          {availableWeeks.length > 0 && (
            <div className="relative">
              <Calendar size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" />
              <select
                value={selectedWeek || ''}
                onChange={e => onWeekChange(e.target.value || undefined)}
                className="appearance-none rounded border border-[var(--border-default)] bg-[var(--surface-card)] pl-7 pr-7 py-1.5 text-[11px] text-[var(--text-secondary)] cursor-pointer"
              >
                <option value="">Latest</option>
                {availableWeeks.map(w => (
                  <option key={w} value={w}>{formatWeekShort(w)}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" />
            </div>
          )}

          {/* View mode toggle */}
          <div className="flex rounded border border-[var(--border-default)] overflow-hidden">
            <button
              onClick={() => onViewModeChange('briefing')}
              className={`px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                viewMode === 'briefing'
                  ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Briefing
            </button>
            <button
              onClick={() => !deepDiveLocked && onViewModeChange('deep-dive')}
              className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                deepDiveLocked ? 'cursor-not-allowed opacity-50' :
                viewMode === 'deep-dive'
                  ? 'bg-[var(--surface-2)] text-[var(--text-primary)] cursor-pointer'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer'
              }`}
              title={deepDiveLocked ? 'Upgrade to Pro for deep-dive analysis' : undefined}
            >
              Deep Dive{deepDiveLocked ? ' 🔒' : ''}
            </button>
          </div>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded border border-[var(--border-default)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40 cursor-pointer"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Main banner: brand name + score */}
        <div className="flex items-start justify-between gap-6 px-5 pt-4 pb-3">
          {/* Left: brand name + meta */}
          <div className="min-w-0">
            <h1 className="heading text-3xl tracking-tight">{brandName}</h1>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-[var(--text-muted)]">
              {projectName && <span>{projectName}</span>}
              {projectName && snapshotDate && <span className="opacity-40">·</span>}
              {snapshotDate && <span>{formatWeek(snapshotDate)}</span>}
            </div>
          </div>

          {/* Right: score + status */}
          <div className="text-right flex flex-col items-end shrink-0">
            <div
              className="font-semibold leading-none"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '4.5rem',
                letterSpacing: '-0.02em',
                color: scoreColor(score),
              }}
            >
              {score}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.12em]">
                Undercurrent Score
              </span>
              {confidenceLevel && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                    confidenceLevel === 'high'
                      ? 'bg-[var(--color-strength)]/15 text-[var(--color-strength)]'
                      : confidenceLevel === 'moderate'
                        ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
                        : 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]'
                  }`}
                  title={
                    confidenceLevel === 'high'
                      ? `Based on ${mentionCount ?? '30+'} mentions — statistically robust`
                      : confidenceLevel === 'moderate'
                        ? `Based on ${mentionCount ?? '10+'} mentions — directionally reliable`
                        : `Based on ${mentionCount ?? '<10'} mentions — interpret directionally`
                  }
                >
                  {mentionCount != null ? `${mentionCount} mentions` : confidenceLevel}
                </span>
              )}
              <button
                onClick={() => setShowMethodology(true)}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
                title="How is this scored?"
              >
                <Info size={12} />
              </button>
            </div>
            <div className="mt-1.5"><StatusBadge status={status} /></div>
          </div>
        </div>

        {/* Score composition bar */}
        <div className="px-5 pb-2">
          <div className="h-8">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={[{ name: 'score', ...Object.fromEntries(compositionData.map(d => [d.name, d.value])) }]}
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                barSize={24}
              >
                <XAxis type="number" hide domain={[0, 100]} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const items = compositionData;
                    return (
                      <div className="paper-card px-3 py-2 shadow-lg text-xs space-y-1">
                        {items.map(item => (
                          <div key={item.name} className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                            <span className="text-[var(--text-secondary)]">{item.name}</span>
                            <span className="ml-auto data-text font-medium">{item.score}</span>
                            <span className="text-[var(--text-muted)]">× {item.weight}%</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {compositionData.map(d => (
                  <Bar key={d.name} dataKey={d.name} stackId="a" radius={0}>
                    <Cell fill={d.color} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Compact legend */}
          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
            {COMPONENT_META.map(({ key, label, weight, color }) => (
              <div key={key} className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                <span>{label}</span>
                <span className="data-text font-medium text-[var(--text-secondary)]">{components[key]}</span>
                <span className="opacity-50">({Math.round(weight * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom row: brand tabs + export */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--border-subtle)]">
          <div className="flex gap-1">
            {allBrands.map(b => (
              <button
                key={b.brand_id}
                onClick={() => onBrandChange(b.brand_id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  b.brand_id === selectedBrandId
                    ? 'bg-[var(--color-accent-500)] text-white'
                    : 'border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
                }`}
              >
                {b.brand_name}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {exportButton}
        </div>
      </div>

      <MethodologyModal open={showMethodology} onClose={() => setShowMethodology(false)} />
    </>
  );
}
