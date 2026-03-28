import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { StatusBadge } from './StatusBadge';
import { SectionVerdict } from './SectionVerdict';
import { fetchBrandDashboard, fetchBrandTrends } from '../../api';
import type { BrandConfig, BrandDashboard, StatusTag, ScoreComponents, ScorePoint } from '../../types';

interface CompetitorSnapshot {
  brand_id: string;
  brand_name: string;
  score: number;
  status: StatusTag;
  components: ScoreComponents;
  verdict: string;
  themes: string[];
  scoreHistory: ScorePoint[];
  loading: boolean;
  error: boolean;
}

interface Props {
  projectId: string;
  primaryBrandId: string;
  primaryScore: number;
  primaryStatus: StatusTag;
  primaryComponents: ScoreComponents;
  primaryVerdict?: string;
  primaryThemes?: string[];
  primaryScoreHistory?: ScorePoint[];
  competitors: BrandConfig[];
  week?: string;
  sectionVerdict?: string;
  primaryBrandName?: string;
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

function getVerdict(dashboard: BrandDashboard): string {
  for (const sub of dashboard.week_subreddits) {
    if (sub.synthesis.blunt_verdict) return sub.synthesis.blunt_verdict;
    if (sub.synthesis.narrative_headline) return sub.synthesis.narrative_headline;
  }
  return '';
}

function getTopThemes(dashboard: BrandDashboard): string[] {
  const themeMap = new Map<string, number>();
  for (const sub of dashboard.week_subreddits) {
    for (const t of sub.deep_analysis_summary?.top_themes ?? []) {
      themeMap.set(t.theme, (themeMap.get(t.theme) || 0) + t.count);
    }
  }
  return Array.from(themeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([theme]) => theme.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
}

function scoreColor(score: number): string {
  if (score >= 70) return 'var(--color-strength)';
  if (score >= 50) return 'var(--text-primary)';
  if (score >= 36) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function BrandColumn({
  name, score, status, verdict, themes, scoreHistory, isPrimary,
}: {
  name: string;
  score: number;
  status: StatusTag;
  verdict: string;
  themes: string[];
  scoreHistory: ScorePoint[];
  isPrimary: boolean;
}) {
  return (
    <div className={`flex flex-col p-4 rounded-lg ${isPrimary ? 'bg-[var(--surface-1)] border border-[var(--border-default)]' : 'bg-[var(--surface-1)] border border-[var(--border-subtle)]'}`}>
      {/* Brand name */}
      <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">{name}</div>

      {/* Score + status */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="data-text text-2xl font-semibold leading-none"
          style={{ color: scoreColor(score) }}
        >
          {score}
        </span>
        <StatusBadge status={status} size="sm" />
      </div>

      {/* Verdict */}
      {verdict && (
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3 min-h-[2.5rem]">
          {verdict}
        </p>
      )}

      {/* Sparkline */}
      {scoreHistory.length >= 2 && (
        <div className="h-12 mt-auto">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={scoreHistory}>
              <Line
                type="monotone"
                dataKey="score"
                stroke={scoreColor(score)}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Theme chips */}
      {themes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {themes.map((t, i) => (
            <span key={i} className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[9px] text-[var(--text-muted)]">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function CompetitiveContext({
  projectId, primaryBrandId, primaryScore, primaryStatus, primaryComponents,
  primaryVerdict, primaryThemes, primaryScoreHistory,
  competitors, week, sectionVerdict, primaryBrandName,
}: Props) {
  const [snapshots, setSnapshots] = useState<CompetitorSnapshot[]>([]);

  useEffect(() => {
    if (!competitors.length) return;

    const initial: CompetitorSnapshot[] = competitors.map(c => ({
      brand_id: c.brand_id,
      brand_name: c.brand_name,
      score: 0,
      status: 'stable' as StatusTag,
      components: { sentiment_mix: 0, intensity: 0, trajectory: 0, community_alignment: 0 },
      verdict: '',
      themes: [],
      scoreHistory: [],
      loading: true,
      error: false,
    }));
    setSnapshots(initial);

    competitors.forEach((comp, idx) => {
      // Fetch dashboard and trends in parallel for each competitor
      Promise.all([
        fetchBrandDashboard(projectId, comp.brand_id, week),
        fetchBrandTrends(projectId, comp.brand_id, 8).catch(() => null),
      ]).then(([dashboard, trends]) => {
        setSnapshots(prev => prev.map((s, i) => i === idx ? {
          ...s,
          score: avgScore(dashboard),
          status: worstStatus(dashboard),
          components: avgComponents(dashboard),
          verdict: getVerdict(dashboard),
          themes: getTopThemes(dashboard),
          scoreHistory: trends?.score_history ?? [],
          loading: false,
        } : s));
      }).catch(() => {
        setSnapshots(prev => prev.map((s, i) => i === idx ? { ...s, loading: false, error: true } : s));
      });
    });
  }, [projectId, competitors, week]);

  if (!competitors.length) return null;

  const loaded = snapshots.filter(s => !s.loading && !s.error);

  return (
    <div className="paper-card p-6">
      <h3 className="section-label mb-4 flex items-center gap-1.5">
        <Shield size={12} /> Competitive Context
      </h3>

      <SectionVerdict verdict={sectionVerdict} />

      {/* Side-by-side grid */}
      <div className={`grid gap-4 ${
        loaded.length + 1 <= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'
      }`}>
        {/* Primary brand column */}
        <BrandColumn
          name={primaryBrandName || 'Primary'}
          score={primaryScore}
          status={primaryStatus}
          verdict={primaryVerdict || ''}
          themes={primaryThemes || []}
          scoreHistory={primaryScoreHistory || []}
          isPrimary={true}
        />

        {/* Competitor columns */}
        {snapshots.map(comp => {
          if (comp.loading) {
            return <div key={comp.brand_id} className="animate-pulse rounded-lg bg-[var(--surface-1)] h-48" />;
          }
          if (comp.error) {
            return (
              <div key={comp.brand_id} className="rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] p-4">
                <span className="text-sm font-medium">{comp.brand_name}</span>
                <span className="ml-2 text-xs text-[var(--text-muted)]">No data</span>
              </div>
            );
          }
          return (
            <BrandColumn
              key={comp.brand_id}
              name={comp.brand_name}
              score={comp.score}
              status={comp.status}
              verdict={comp.verdict}
              themes={comp.themes}
              scoreHistory={comp.scoreHistory}
              isPrimary={false}
            />
          );
        })}
      </div>
    </div>
  );
}
