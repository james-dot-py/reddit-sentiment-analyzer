import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { BrandBanner } from '../components/dashboard/BrandBanner';
import { NarrativeSection } from '../components/dashboard/NarrativeSection';
import { ScoreTrendChart } from '../components/dashboard/ScoreTrendChart';
import { SubredditCard } from '../components/dashboard/SubredditCard';
import { ThemeChart } from '../components/dashboard/ThemeChart';
import { CommunityValues } from '../components/dashboard/CommunityValues';
import { EvidenceTable } from '../components/dashboard/EvidenceTable';
import { CompetitiveContext } from '../components/dashboard/CompetitiveContext';
import { ExportReport } from '../components/dashboard/ExportReport';
import { DashboardSkeleton } from '../components/dashboard/Skeleton';
import { fetchAvailableWeeks, fetchPipelineStatus, addAnnotation } from '../api';
import { FeatureGate, UpgradeChip } from '../components/ui/FeatureGate';
import { useTier } from '../hooks/useTier';
import type { ThemeEntry, EvidencePost, CommunityAlignment, ViewMode, Finding, DetailedItem } from '../types';

export function DashboardPage() {
  const { canUse, canUseViewMode, isFree } = useTier();
  // Mark as returning visitor for LandingNav
  useEffect(() => {
    localStorage.setItem('undercurrent-visited-dashboard', 'true');
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('project') || undefined;
  const brandId = searchParams.get('brand') || undefined;
  const week = searchParams.get('week') || undefined;

  const { projects, dashboard, trends, loading, error, refresh } = useDashboard(projectId, brandId, week);

  // Available weeks for week selector + pipeline status for data freshness
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  useEffect(() => {
    fetchAvailableWeeks().then(r => setAvailableWeeks(r.available_weeks)).catch(() => {});
    fetchPipelineStatus().then(r => setLastUpdated(r.last_updated)).catch(() => {});
  }, []);

  // Derive selected project & brand objects
  const selectedProject = useMemo(
    () => projects.find(p => p.project_id === projectId),
    [projects, projectId],
  );

  // Competitors for the selected project (excluding the currently viewed brand)
  const competitors = useMemo(
    () => selectedProject?.brands.filter(b => b.is_competitor && b.brand_id !== brandId) ?? [],
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
      for (const post of sub.synthesis.key_evidence_posts) {
        posts.push({
          ...post,
          subreddit: post.subreddit || sub.subreddit,
          post_date: post.post_date || dashboard.snapshot_date,
        });
      }
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

  const primaryNarrative = useMemo(() => {
    if (!dashboard?.week_subreddits.length) return '';
    return dashboard.week_subreddits
      .map(s => s.synthesis.narrative_summary)
      .filter(Boolean)
      .join('\n\n---\n\n');
  }, [dashboard]);

  const aggregatedHeadline = useMemo(() => {
    if (!dashboard?.week_subreddits.length) return '';
    return dashboard.week_subreddits
      .map(s => s.synthesis.narrative_headline)
      .filter(Boolean)
      .join(' ');
  }, [dashboard]);

  const aggregatedSignals = useMemo(() => {
    if (!dashboard?.week_subreddits.length) return [];
    return dashboard.week_subreddits.flatMap(s => s.synthesis.narrative_signals ?? []);
  }, [dashboard]);

  const aggregatedDeepDive = useMemo(() => {
    if (!dashboard?.week_subreddits.length) return '';
    return dashboard.week_subreddits
      .map(s => s.synthesis.narrative_deep_dive)
      .filter(Boolean)
      .join('\n\n');
  }, [dashboard]);

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

  const avgScore = useMemo(() => {
    if (!dashboard?.week_subreddits.length) return 0;
    const scores = dashboard.week_subreddits.map(s => s.synthesis.undercurrent_score);
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [dashboard]);

  const aggregatedStatus = useMemo(() => {
    if (!dashboard?.week_subreddits.length) return 'stable' as const;
    const order = ['crisis', 'declining', 'at_risk', 'watch', 'stable', 'positive', 'thriving'] as const;
    const tags = dashboard.week_subreddits.map(s => s.synthesis.status_tag);
    for (const status of order) {
      if (tags.includes(status)) return status;
    }
    return 'stable' as const;
  }, [dashboard]);

  // v2: View mode (briefing vs deep-dive) — free tier locked to briefing
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (isFree) return 'briefing';
    return (localStorage.getItem('undercurrent-view-mode') as ViewMode) || 'deep-dive';
  });
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    if (mode === 'deep-dive' && !canUseViewMode('deep-dive')) return;
    setViewMode(mode);
    localStorage.setItem('undercurrent-view-mode', mode);
  }, [canUseViewMode]);

  // v2: Aggregated blunt verdict
  const aggregatedVerdict = useMemo(() => {
    if (!dashboard?.week_subreddits.length) return '';
    const verdicts = dashboard.week_subreddits
      .map(s => s.synthesis.blunt_verdict)
      .filter(Boolean);
    return verdicts[0] || '';
  }, [dashboard]);

  // v2: Aggregated findings
  const aggregatedFindings = useMemo((): Finding[] => {
    if (!dashboard?.week_subreddits.length) return [];
    const findings: Finding[] = [];
    for (const sub of dashboard.week_subreddits) {
      for (const f of sub.synthesis.findings ?? []) {
        // Deduplicate by checking text similarity
        if (!findings.some(existing => existing.text === f.text)) {
          findings.push(f);
        }
      }
    }
    // Sort by severity: critical first, then elevated, then monitor
    const order = { critical: 0, elevated: 1, monitor: 2 };
    return findings.sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2));
  }, [dashboard]);

  // v2: Section verdicts
  const aggregatedSectionVerdicts = useMemo(() => {
    if (!dashboard?.week_subreddits.length) return {};
    // Take verdicts from first subreddit (most representative)
    return dashboard.week_subreddits[0]?.synthesis.section_verdicts ?? {};
  }, [dashboard]);

  // v2: Aggregated friction/aligned details
  const aggregatedFrictionDetails = useMemo((): DetailedItem[] => {
    if (!dashboard?.week_subreddits.length) return [];
    const items: DetailedItem[] = [];
    for (const sub of dashboard.week_subreddits) {
      for (const item of sub.synthesis.friction_point_details ?? []) {
        if (!items.some(e => e.text === item.text)) items.push(item);
      }
    }
    return items.sort((a, b) => (b.mention_count ?? 0) - (a.mention_count ?? 0));
  }, [dashboard]);

  const aggregatedAlignedDetails = useMemo((): DetailedItem[] => {
    if (!dashboard?.week_subreddits.length) return [];
    const items: DetailedItem[] = [];
    for (const sub of dashboard.week_subreddits) {
      for (const item of sub.synthesis.aligned_value_details ?? []) {
        if (!items.some(e => e.text === item.text)) items.push(item);
      }
    }
    return items.sort((a, b) => (b.mention_count ?? 0) - (a.mention_count ?? 0));
  }, [dashboard]);

  // Data quality: aggregate mention count and confidence
  const dataQuality = useMemo(() => {
    if (!dashboard?.week_subreddits.length) return null;
    let totalMentions = 0;
    for (const sub of dashboard.week_subreddits) {
      const dq = sub.synthesis.data_quality;
      if (dq) {
        totalMentions += dq.mention_count;
      } else if (sub.deep_analysis_summary) {
        totalMentions += sub.deep_analysis_summary.mention_count;
      }
    }
    const level = totalMentions >= 30 ? 'high' as const
      : totalMentions >= 10 ? 'moderate' as const
      : 'low' as const;
    return { mentionCount: totalMentions, confidenceLevel: level };
  }, [dashboard]);

  // v2: Primary brand top themes (for competitive context)
  const primaryTopThemes = useMemo(() => {
    return aggregatedThemes
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(t => t.theme.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  }, [aggregatedThemes]);

  // Add annotation handler for the trend chart
  const handleAddAnnotation = useCallback(async (date: string, label: string) => {
    if (!projectId || !brandId) return;
    try {
      await addAnnotation(projectId, brandId, date, label);
      refresh(); // Reload to show the new annotation
    } catch (e) {
      console.error('Failed to add annotation:', e);
    }
  }, [projectId, brandId, refresh]);

  // Helper to set params while preserving existing ones
  function updateParams(updates: Record<string, string | undefined>) {
    const next: Record<string, string> = {};
    if (projectId) next.project = projectId;
    if (brandId) next.brand = brandId;
    if (week) next.week = week;
    for (const [k, v] of Object.entries(updates)) {
      if (v) next[k] = v;
      else delete next[k];
    }
    setSearchParams(next);
  }

  // ── Render ─────────────────────────────────────────────────────────────

  // Welcome state
  if (!loading && projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <BarChart3 size={48} className="text-[var(--text-muted)]" />
        <h1 className="heading text-3xl">Undercurrent</h1>
        <p className="body-text text-[var(--text-secondary)] text-center max-w-md">
          Longitudinal brand intelligence from Reddit communities.
          Configure a project and run the pipeline to get started.
        </p>
        <p className="text-xs text-[var(--text-muted)]">Built by Jimmy Friedman</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Loading skeleton */}
      {loading && <DashboardSkeleton />}

      {/* Error state */}
      {error && !loading && (
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

      {/* Empty state */}
      {!loading && !error && !dashboard && projectId && brandId && (
        <div className="paper-card p-12 text-center">
          <BarChart3 size={32} className="mx-auto text-[var(--text-muted)] mb-3" />
          <p className="heading text-xl text-[var(--text-secondary)]">No data yet</p>
          <p className="text-sm text-[var(--text-muted)] mt-2 max-w-sm mx-auto">
            Run the weekly pipeline to generate brand intelligence data for this project.
          </p>
          <code className="block mt-4 text-xs data-text text-[var(--text-muted)] bg-[var(--surface-1)] rounded px-3 py-2 max-w-sm mx-auto">
            python scripts/weekly_pipeline.py --project {projectId}
          </code>
        </div>
      )}

      {/* Brand Banner (always shown when we have project/brand selected) */}
      {!loading && dashboard && (
        <BrandBanner
          score={avgScore}
          status={aggregatedStatus}
          components={avgComponents}
          brandName={dashboard.brand_name}
          snapshotDate={dashboard.snapshot_date}
          projectName={selectedProject?.project_name}
          projects={projects}
          selectedProjectId={projectId}
          selectedBrandId={brandId}
          availableWeeks={availableWeeks}
          selectedWeek={week}
          onProjectChange={pid => {
            const proj = projects.find(p => p.project_id === pid);
            const brand = proj?.brands.find(b => !b.is_competitor) || proj?.brands[0];
            setSearchParams(brand ? { project: pid, brand: brand.brand_id } : { project: pid });
          }}
          onBrandChange={bid => updateParams({ brand: bid })}
          onWeekChange={w => updateParams({ week: w })}
          onRefresh={refresh}
          loading={loading}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          exportButton={
            canUse('export_enabled') ? (
              <ExportReport
                brandName={dashboard.brand_name}
                score={avgScore}
                status={aggregatedStatus}
                components={avgComponents}
                narrative={primaryNarrative}
                themes={aggregatedThemes}
                evidence={aggregatedEvidence}
                trends={trends}
                snapshotDate={dashboard.snapshot_date}
              />
            ) : <UpgradeChip featureName="Export" />
          }
          deepDiveLocked={!canUseViewMode('deep-dive')}
          mentionCount={dataQuality?.mentionCount}
          confidenceLevel={dataQuality?.confidenceLevel}
        />
      )}

      {/* Dashboard content */}
      {!loading && dashboard && viewMode === 'briefing' && (
        <>
          {/* Briefing: compact 2-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <NarrativeSection
              headline={aggregatedHeadline}
              signals={aggregatedSignals}
              deepDive={aggregatedDeepDive}
              narrativeDelta={trends?.narrative_delta}
              bluntVerdict={aggregatedVerdict}
              findings={aggregatedFindings.length > 0 ? aggregatedFindings : undefined}
              sectionVerdict={aggregatedSectionVerdicts.narrative}
              viewMode={viewMode}
            />
            <ScoreTrendChart
              scoreHistory={trends?.score_history ?? []}
              annotations={trends?.annotations ?? []}
              trajectory={trends?.trajectory ?? null}
              onAddAnnotation={projectId && brandId ? handleAddAnnotation : undefined}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Briefing: competitive snapshot (Pro only) */}
            {competitors.length > 0 && projectId && (
              <FeatureGate allowed={canUse('competitive_context')} featureName="Competitive Context">
                <CompetitiveContext
                  projectId={projectId}
                  primaryBrandId={brandId!}
                  primaryBrandName={dashboard.brand_name}
                  primaryScore={avgScore}
                  primaryStatus={aggregatedStatus}
                  primaryComponents={avgComponents}
                  primaryVerdict={aggregatedVerdict}
                  primaryThemes={primaryTopThemes}
                  primaryScoreHistory={trends?.score_history}
                  competitors={competitors}
                  week={week}
                  sectionVerdict={aggregatedSectionVerdicts.competitive}
                />
              </FeatureGate>
            )}

            {/* Briefing: top 3 evidence */}
            <EvidenceTable
              posts={aggregatedEvidence.slice(0, 3)}
              sectionVerdict={aggregatedSectionVerdicts.evidence}
            />
          </div>

          {/* Switch to deep-dive */}
          <div className="text-center">
            {canUseViewMode('deep-dive') ? (
              <button
                onClick={() => handleViewModeChange('deep-dive')}
                className="text-xs text-[var(--color-accent-500)] hover:underline cursor-pointer font-medium"
              >
                View Full Analysis &rarr;
              </button>
            ) : (
              <UpgradeChip featureName="Deep-Dive Analysis" />
            )}
          </div>
        </>
      )}

      {!loading && dashboard && viewMode === 'deep-dive' && (
        <>
          {/* Section B: Narrative + Section C: Trend chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <NarrativeSection
              headline={aggregatedHeadline}
              signals={aggregatedSignals}
              deepDive={aggregatedDeepDive}
              narrativeDelta={trends?.narrative_delta}
              bluntVerdict={aggregatedVerdict}
              findings={aggregatedFindings.length > 0 ? aggregatedFindings : undefined}
              sectionVerdict={aggregatedSectionVerdicts.narrative}
              viewMode={viewMode}
            />
            <ScoreTrendChart
              scoreHistory={trends?.score_history ?? []}
              annotations={trends?.annotations ?? []}
              trajectory={trends?.trajectory ?? null}
              onAddAnnotation={projectId && brandId ? handleAddAnnotation : undefined}
            />
          </div>

          {/* Section E: Theme map + Section G: Community values */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ThemeChart
              themes={aggregatedThemes}
              emergingThemes={trends?.emerging_themes}
              decliningThemes={trends?.declining_themes}
              sectionVerdict={aggregatedSectionVerdicts.theme_map}
            />
            <CommunityValues
              alignment={aggregatedAlignment}
              frictionDetails={aggregatedFrictionDetails.length > 0 ? aggregatedFrictionDetails : undefined}
              alignedDetails={aggregatedAlignedDetails.length > 0 ? aggregatedAlignedDetails : undefined}
            />
          </div>

          {/* Section F: Competitive context (Pro only) */}
          {competitors.length > 0 && projectId && (
            <FeatureGate allowed={canUse('competitive_context')} featureName="Competitive Context">
              <CompetitiveContext
                projectId={projectId}
                primaryBrandId={brandId!}
                primaryBrandName={dashboard.brand_name}
                primaryScore={avgScore}
                primaryStatus={aggregatedStatus}
                primaryComponents={avgComponents}
                primaryVerdict={aggregatedVerdict}
                primaryThemes={primaryTopThemes}
                primaryScoreHistory={trends?.score_history}
                competitors={competitors}
                week={week}
                sectionVerdict={aggregatedSectionVerdicts.competitive}
              />
            </FeatureGate>
          )}

          {/* Section D: Community breakdown */}
          {dashboard.week_subreddits.length > 1 && (
            <div>
              <h3 className="section-label mb-3">Community Breakdown</h3>
              <div className={`grid gap-5 ${
                dashboard.week_subreddits.length <= 2
                  ? 'grid-cols-1 lg:grid-cols-2'
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              }`}>
                {dashboard.week_subreddits.map(sub => (
                  <SubredditCard key={sub.subreddit} data={sub} />
                ))}
              </div>
            </div>
          )}

          {/* Section H: Evidence table */}
          <EvidenceTable
            posts={aggregatedEvidence}
            sectionVerdict={aggregatedSectionVerdicts.evidence}
          />
        </>
      )}
    </div>
  );
}
