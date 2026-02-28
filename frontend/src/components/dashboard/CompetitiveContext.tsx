import { useState, useEffect } from 'react';
import { Shield, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { fetchBrandDashboard } from '../../api';
import type { BrandConfig, BrandDashboard, StatusTag, ScoreComponents } from '../../types';

interface CompetitorSnapshot {
  brand_id: string;
  brand_name: string;
  score: number;
  status: StatusTag;
  components: ScoreComponents;
  narrative: string;
  loading: boolean;
  error: boolean;
}

interface Props {
  projectId: string;
  primaryBrandId: string;
  primaryScore: number;
  primaryStatus: StatusTag;
  primaryComponents: ScoreComponents;
  competitors: BrandConfig[];
  week?: string;
}

function scoreDelta(primary: number, competitor: number): { icon: React.ReactNode; label: string; color: string } {
  const diff = primary - competitor;
  if (diff > 5) return { icon: <TrendingUp size={12} />, label: `+${diff}`, color: 'text-emerald-600' };
  if (diff < -5) return { icon: <TrendingDown size={12} />, label: `${diff}`, color: 'text-red-600' };
  return { icon: <Minus size={12} />, label: '~0', color: 'text-slate-400' };
}

function componentLabel(key: keyof ScoreComponents): string {
  const map: Record<keyof ScoreComponents, string> = {
    sentiment_mix: 'Sentiment',
    intensity: 'Intensity',
    trajectory: 'Trajectory',
    community_alignment: 'Alignment',
  };
  return map[key];
}

function avgScore(dashboard: BrandDashboard): number {
  const scores = dashboard.week_subreddits.map(s => s.synthesis.undercurrent_score);
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
}

function avgComponents(dashboard: BrandDashboard): ScoreComponents {
  const subs = dashboard.week_subreddits;
  if (!subs.length) return { sentiment_mix: 50, intensity: 50, trajectory: 50, community_alignment: 50 };
  const avg = (key: keyof ScoreComponents) =>
    Math.round(subs.reduce((s, sub) => s + sub.synthesis.score_components[key], 0) / subs.length);
  return { sentiment_mix: avg('sentiment_mix'), intensity: avg('intensity'), trajectory: avg('trajectory'), community_alignment: avg('community_alignment') };
}

function worstStatus(dashboard: BrandDashboard): StatusTag {
  const order: StatusTag[] = ['crisis', 'declining', 'at_risk', 'watch', 'stable', 'positive', 'thriving'];
  const tags = dashboard.week_subreddits.map(s => s.synthesis.status_tag);
  for (const status of order) {
    if (tags.includes(status)) return status;
  }
  return 'stable';
}

function firstNarrative(dashboard: BrandDashboard): string {
  for (const sub of dashboard.week_subreddits) {
    if (sub.synthesis.narrative_summary) return sub.synthesis.narrative_summary;
  }
  return '';
}

export function CompetitiveContext({ projectId, primaryBrandId, primaryScore, primaryStatus, primaryComponents, competitors, week }: Props) {
  const [snapshots, setSnapshots] = useState<CompetitorSnapshot[]>([]);

  useEffect(() => {
    if (!competitors.length) return;
    const initial: CompetitorSnapshot[] = competitors.map(c => ({
      brand_id: c.brand_id,
      brand_name: c.brand_name,
      score: 0,
      status: 'stable' as StatusTag,
      components: { sentiment_mix: 0, intensity: 0, trajectory: 0, community_alignment: 0 },
      narrative: '',
      loading: true,
      error: false,
    }));
    setSnapshots(initial);

    competitors.forEach((comp, idx) => {
      fetchBrandDashboard(projectId, comp.brand_id, week)
        .then(dashboard => {
          setSnapshots(prev => prev.map((s, i) => i === idx ? {
            ...s,
            score: avgScore(dashboard),
            status: worstStatus(dashboard),
            components: avgComponents(dashboard),
            narrative: firstNarrative(dashboard).slice(0, 150),
            loading: false,
          } : s));
        })
        .catch(() => {
          setSnapshots(prev => prev.map((s, i) => i === idx ? { ...s, loading: false, error: true } : s));
        });
    });
  }, [projectId, competitors, week]);

  if (!competitors.length) return null;

  // Find where primary brand is stronger/weaker vs each competitor
  const componentKeys: (keyof ScoreComponents)[] = ['sentiment_mix', 'intensity', 'trajectory', 'community_alignment'];

  return (
    <div className="paper-card p-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-4 flex items-center gap-1.5">
        <Shield size={12} /> Competitive Context
      </h3>

      <div className="space-y-4">
        {snapshots.map(comp => {
          if (comp.loading) {
            return (
              <div key={comp.brand_id} className="animate-pulse rounded bg-[var(--surface-1)] h-24" />
            );
          }
          if (comp.error) {
            return (
              <div key={comp.brand_id} className="rounded bg-[var(--surface-1)] p-4">
                <span className="text-sm font-medium">{comp.brand_name}</span>
                <span className="ml-2 text-xs text-[var(--text-muted)]">No data available</span>
              </div>
            );
          }

          const delta = scoreDelta(primaryScore, comp.score);
          const strengths = componentKeys.filter(k => primaryComponents[k] > comp.components[k] + 5);
          const weaknesses = componentKeys.filter(k => primaryComponents[k] < comp.components[k] - 5);

          return (
            <div key={comp.brand_id} className="rounded border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-medium">{comp.brand_name}</span>
                  <StatusBadge status={comp.status} size="sm" />
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1 data-text text-xs font-medium ${delta.color}`}>
                    {delta.icon} {delta.label}
                  </span>
                  <span className="data-text text-xl font-medium">{comp.score}</span>
                </div>
              </div>

              {comp.narrative && (
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-2 line-clamp-2">
                  {comp.narrative}...
                </p>
              )}

              {(strengths.length > 0 || weaknesses.length > 0) && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {strengths.map(k => (
                    <span key={k} className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] text-emerald-700">
                      ↑ {componentLabel(k)}
                    </span>
                  ))}
                  {weaknesses.map(k => (
                    <span key={k} className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] text-red-700">
                      ↓ {componentLabel(k)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
