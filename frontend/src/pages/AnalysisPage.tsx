import { ChevronDown, ChevronUp, KeyRound, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchSavedAnalysis, fetchSnapshotIndex } from '../api';
import { useAnalysis } from '../hooks/useAnalysis';
import { AnalysisForm } from '../components/AnalysisForm';
import { ProgressBar } from '../components/ProgressBar';
import { ScrollytellingLayout } from '../components/ScrollytellingLayout';
import { SampleGallery } from '../components/SampleGallery';
import { WeekSelector } from '../components/WeekSelector';
import { HeroVisualization } from '../components/HeroVisualization';
import type { AnalysisRequest, SnapshotIndex } from '../types';

function computeEstimateSeconds(req: AnalysisRequest): number {
  const numSubs = req.subreddits.length;
  const fetchReqs = Math.ceil(req.post_limit / 100) * numSubs;
  const commentReqs = req.include_comments ? Math.min(req.post_limit, 50) * numSubs : 0;
  const totalReqs = fetchReqs + commentReqs;
  const fetchTime = totalReqs * 1;
  const totalTexts = req.post_limit * numSubs + (req.include_comments ? req.post_limit * numSubs * 5 : 0);
  const analysisTime = Math.ceil(totalTexts / 16);
  return fetchTime + analysisTime + 5;
}

export function AnalysisPage() {
  const { status, progress, stage, message, result, error, startAnalysis, startSampleAnalysis, cancel, loadResult, loadSnapshot, reset } = useAnalysis();
  const location = useLocation();
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [estimateSeconds, setEstimateSeconds] = useState(0);
  const [customExpanded, setCustomExpanded] = useState(false);

  const [selectedSubreddit, setSelectedSubreddit] = useState<string | null>(null);
  const [snapshotIndex, setSnapshotIndex] = useState<SnapshotIndex | null>(null);

  // Fetch snapshot index on mount
  useEffect(() => {
    fetchSnapshotIndex().then(setSnapshotIndex).catch(() => {});
  }, []);

  const handleSubmit = useCallback((req: AnalysisRequest) => {
    setEstimateSeconds(computeEstimateSeconds(req));
    startAnalysis(req);
  }, [startAnalysis]);

  const handleSubredditPick = useCallback((subreddit: string) => {
    setSelectedSubreddit(subreddit);
    // If the snapshot index is loaded and has no weekly data yet for this
    // subreddit, fall back to the precomputed sample analysis immediately.
    const weeks = snapshotIndex?.by_subreddit[subreddit.toLowerCase()] ?? [];
    if (snapshotIndex && weeks.length === 0) {
      startSampleAnalysis(subreddit);
    }
  }, [snapshotIndex, startSampleAnalysis]);

  const handleWeekSelect = useCallback((week: string) => {
    if (selectedSubreddit) loadSnapshot(week, selectedSubreddit);
  }, [selectedSubreddit, loadSnapshot]);

  const handleBack = useCallback(() => {
    setSelectedSubreddit(null);
    reset();
  }, [reset]);

  useEffect(() => {
    const state = location.state as { loadAnalysisId?: string } | null;
    if (state?.loadAnalysisId) {
      setLoadingHistory(true);
      fetchSavedAnalysis(state.loadAnalysisId)
        .then((data) => loadResult(data))
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
    }
  }, [location.state, loadResult]);

  // Derive selected week from result's analysis_id (format: snapshot_{sub}_{date})
  const selectedWeek = result?.analysis_id?.match(/snapshot_[^_]+_(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

  const availableWeeks =
    selectedSubreddit && snapshotIndex
      ? (snapshotIndex.by_subreddit[selectedSubreddit.toLowerCase()] ?? [])
      : [];

  return (
    <div className="space-y-6">
      {loadingHistory && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-indigo-500" />
        </div>
      )}

      {status === 'loading' && (
        <ProgressBar progress={progress} stage={stage} message={message} estimateSeconds={estimateSeconds} />
      )}

      {status === 'error' && error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {status === 'done' && result && (
        <>
          <WeekSelector
            subreddit={selectedSubreddit ?? result.subreddit_summaries[0]?.subreddit ?? ''}
            availableWeeks={availableWeeks}
            selectedWeek={selectedWeek}
            onSelect={handleWeekSelect}
            onBack={handleBack}
            compact
          />
          <ScrollytellingLayout result={result} />
        </>
      )}

      {status === 'idle' && !result && !loadingHistory && selectedSubreddit && (
        <WeekSelector
          subreddit={selectedSubreddit}
          availableWeeks={availableWeeks}
          selectedWeek={selectedWeek}
          onSelect={handleWeekSelect}
          onBack={handleBack}
        />
      )}

      {status === 'idle' && !result && !loadingHistory && !selectedSubreddit && (
        <>
          {/* Hero section — editorial */}
          <div className="pt-8 pb-4">
            <div className="text-center mb-6">
              <h2 className="heading mb-3 text-4xl text-[var(--text-primary)]">
                Undercurrent
              </h2>
              <p className="body-text mx-auto max-w-lg text-sm">
                Sentiment analysis and natural language processing reveal the
                hidden patterns in how online communities speak — and what
                that language says about what they believe.
              </p>
            </div>

            <HeroVisualization />

            <div className="mt-4 flex justify-center gap-3">
              <span className="rounded border border-[var(--border-default)] px-3 py-1 data-text text-xs text-[var(--text-muted)]">
                NLP Classification
              </span>
              <span className="rounded border border-[var(--border-default)] px-3 py-1 data-text text-xs text-[var(--text-muted)]">
                Sentiment Modeling
              </span>
              <span className="rounded border border-[var(--border-default)] px-3 py-1 data-text text-xs text-[var(--text-muted)]">
                Entity Recognition
              </span>
              <span className="rounded border border-[var(--border-default)] px-3 py-1 data-text text-xs text-[var(--text-muted)]">
                Multi-Community
              </span>
            </div>
          </div>

          {/* Sample Gallery — the star of the page */}
          <SampleGallery onSubredditPick={handleSubredditPick} disabled={false} />

          {/* Collapsible custom analysis section */}
          <div className="pt-2">
            <button
              onClick={() => setCustomExpanded(!customExpanded)}
              className="mx-auto flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-indigo-500/40 hover:text-indigo-400"
            >
              Analyze Your Own Subreddit
              {customExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {customExpanded && (
              <div className="mt-4 space-y-3">
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <KeyRound size={18} className="mt-0.5 flex-shrink-0 text-amber-400" />
                  <div className="text-sm text-amber-300/90">
                    <strong className="font-semibold">Reddit API credentials required.</strong>{' '}
                    Custom subreddit analysis fetches live data from Reddit's OAuth API.
                    The server needs <code className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs">REDDIT_CLIENT_ID</code> and{' '}
                    <code className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs">REDDIT_CLIENT_SECRET</code> environment variables configured.
                  </div>
                </div>
                <AnalysisForm onSubmit={handleSubmit} onCancel={cancel} status={status} />
              </div>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-[var(--text-muted)] pb-4">
            Built by Jimmy Friedman
          </p>
        </>
      )}
    </div>
  );
}
