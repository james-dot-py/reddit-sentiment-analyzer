import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, RefreshCw, Loader2 } from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { ScoreDisplay } from '../components/dashboard/ScoreDisplay';
import { NarrativeSection } from '../components/dashboard/NarrativeSection';
import { ScoreTrendChart } from '../components/dashboard/ScoreTrendChart';
import { SubredditCard } from '../components/dashboard/SubredditCard';
import { ThemeChart } from '../components/dashboard/ThemeChart';
import { CommunityValues } from '../components/dashboard/CommunityValues';
import { EvidenceTable } from '../components/dashboard/EvidenceTable';
import type { ThemeEntry, EvidencePost, CommunityAlignment } from '../types';

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('project') || undefined;
  const brandId = searchParams.get('brand') || undefined;
  const week = searchParams.get('week') || undefined;

  const { projects, dashboard, trends, loading, error, refresh } = useDashboard(projectId, brandId, week);

  // Derive selected project & brand objects
  const selectedProject = useMemo(
    () => projects.find(p => p.project_id === projectId),
    [projects, projectId],
  );
  const selectedBrand = useMemo(
    () => selectedProject?.brands.find(b => b.brand_id === brandId),
    [selectedProject, brandId],
  );

  // Auto-select first project and brand if none selected
  const [autoSelected, setAutoSelected] = useState(false);
  if (!autoSelected && projects.length > 0 && !projectId) {
    const p = projects[0];
    const b = p.brands.find(b => !b.is_competitor) || p.brands[0];
    if (b) {
      setSearchParams({ project: p.project_id, brand: b.brand_id });
      setAutoSelected(true);
    }
  }

  // Aggregate data across subreddits for the brand-level view
  const aggregatedThemes = useMemo((): ThemeEntry[] => {
    if (!dashboard) return [];
    const themeMap = new Map<string, { count: number; sentSum: number }>();
    for (const sub of dashboard.week_subreddits) {
      for (const t of sub.deep_analysis_summary?.top_themes ?? []) {
        const existing = themeMap.get(t.theme) || { count: 0, sentSum: 0 };
        existing.count += t.count;
        existing.sentSum += t.avg_sentiment * t.count;
        themeMap.set(t.theme, existing);
      }
    }
    return Array.from(themeMap.entries()).map(([theme, v]) => ({
      theme,
      count: v.count,
      avg_sentiment: v.count > 0 ? v.sentSum / v.count : 0,
    }));
  }, [dashboard]);

  const aggregatedEvidence = useMemo((): EvidencePost[] => {
    if (!dashboard) return [];
    const posts: EvidencePost[] = [];
    for (const sub of dashboard.week_subreddits) {
      posts.push(...sub.synthesis.key_evidence_posts);
    }
    return posts.sort((a, b) => b.upvotes - a.upvotes).slice(0, 8);
  }, [dashboard]);

  const aggregatedAlignment = useMemo((): CommunityAlignment => {
    if (!dashboard) return { aligned_values: [], friction_points: [] };
    const values = new Set<string>();
    const frictions = new Set<string>();
    for (const sub of dashboard.week_subreddits) {
      sub.synthesis.community_alignment.aligned_values.forEach(v => values.add(v));
      sub.synthesis.community_alignment.friction_points.forEach(v => frictions.add(v));
    }
    return { aligned_values: [...values], friction_points: [...frictions] };
  }, [dashboard]);

  // Aggregate the first available narrative (primary subreddit)
  const primaryNarrative = useMemo(() => {
    if (!dashboard?.week_subreddits.length) return '';
    return dashboard.week_subreddits
      .map(s => s.synthesis.narrative_summary)
      .filter(Boolean)
      .join('\n\n---\n\n');
  }, [dashboard]);

  // Aggregate score components (average across subreddits)
  const avgComponents = useMemo(() => {
    if (!dashboard?.week_subreddits.length) {
      return { sentiment_mix: 50, intensity: 50, trajectory: 50, community_alignment: 50 };
    }
    const subs = dashboard.week_subreddits;
    const avg = (key: 'sentiment_mix' | 'intensity' | 'trajectory' | 'community_alignment') =>
      Math.round(subs.reduce((s, sub) => s + sub.synthesis.score_components[key], 0) / subs.length);
    return {
      sentiment_mix: avg('sentiment_mix'),
      intensity: avg('intensity'),
      trajectory: avg('trajectory'),
      community_alignment: avg('community_alignment'),
    };
  }, [dashboard]);

  // Aggregate score (average)
  const avgScore = useMemo(() => {
    if (!dashboard?.week_subreddits.length) return 0;
    const scores = dashboard.week_subreddits.map(s => s.synthesis.undercurrent_score);
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [dashboard]);

  // Pick the "worst" status tag
  const aggregatedStatus = useMemo(() => {
    if (!dashboard?.week_subreddits.length) return 'stable' as const;
    const order = ['crisis', 'declining', 'at_risk', 'watch', 'stable', 'positive', 'thriving'] as const;
    const tags = dashboard.week_subreddits.map(s => s.synthesis.status_tag);
    for (const status of order) {
      if (tags.includes(status)) return status;
    }
    return 'stable' as const;
  }, [dashboard]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Navigation bar: project + brand selectors */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Project selector */}
        <div className="relative">
          <select
            value={projectId || ''}
            onChange={e => {
              const pid = e.target.value;
              const proj = projects.find(p => p.project_id === pid);
              const brand = proj?.brands.find(b => !b.is_competitor) || proj?.brands[0];
              setSearchParams(brand ? { project: pid, brand: brand.brand_id } : { project: pid });
            }}
            className="appearance-none rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-1.5 pr-8 text-sm font-medium text-[var(--text-primary)] cursor-pointer"
          >
            <option value="">Select project...</option>
            {projects.map(p => (
              <option key={p.project_id} value={p.project_id}>{p.project_name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" />
        </div>

        {/* Brand tabs */}
        {selectedProject && (
          <div className="flex gap-1">
            {selectedProject.brands.map(b => (
              <button
                key={b.brand_id}
                onClick={() => setSearchParams({ project: projectId!, brand: b.brand_id })}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  b.brand_id === brandId
                    ? 'bg-[var(--text-primary)] text-[var(--surface-0)]'
                    : 'border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
                } ${b.is_competitor ? 'opacity-70' : ''}`}
              >
                {b.brand_name}
                {b.is_competitor && <span className="ml-1 text-[9px] opacity-60">comp</span>}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Refresh */}
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded border border-[var(--border-default)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="paper-card p-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={refresh}
            className="mt-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state (no project/brand selected) */}
      {!loading && !error && !dashboard && projectId && brandId && (
        <div className="paper-card p-12 text-center">
          <p className="heading text-xl text-[var(--text-secondary)]">No data yet</p>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            Run the pipeline to generate brand intelligence data.
          </p>
        </div>
      )}

      {/* Dashboard content */}
      {!loading && dashboard && (
        <>
          {/* Section A: Score header */}
          <ScoreDisplay
            score={avgScore}
            status={aggregatedStatus}
            components={avgComponents}
            brandName={dashboard.brand_name}
          />

          {/* Section B: Narrative + Section C: Trend chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <NarrativeSection
              narrative={primaryNarrative}
              narrativeDelta={trends?.narrative_delta}
            />
            <ScoreTrendChart
              scoreHistory={trends?.score_history ?? []}
              annotations={trends?.annotations ?? []}
              trajectory={trends?.trajectory ?? null}
            />
          </div>

          {/* Section E: Theme map + Section G: Community values */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ThemeChart
              themes={aggregatedThemes}
              emergingThemes={trends?.emerging_themes}
              decliningThemes={trends?.declining_themes}
            />
            <CommunityValues alignment={aggregatedAlignment} />
          </div>

          {/* Section D: Community breakdown */}
          {dashboard.week_subreddits.length > 1 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-3">
                Community Breakdown
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dashboard.week_subreddits.map(sub => (
                  <SubredditCard key={sub.subreddit} data={sub} />
                ))}
              </div>
            </div>
          )}

          {/* Section H: Evidence table */}
          <EvidenceTable posts={aggregatedEvidence} />
        </>
      )}
    </div>
  );
}
