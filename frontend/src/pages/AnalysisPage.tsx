import { BarChart3, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchSavedAnalysis } from '../api';
import { useAnalysis } from '../hooks/useAnalysis';
import { AnalysisForm } from '../components/AnalysisForm';
import { ProgressBar } from '../components/ProgressBar';
import { DashboardGrid } from '../components/DashboardGrid';
import { SampleGallery } from '../components/SampleGallery';
import type { AnalysisRequest } from '../types';

function computeEstimateSeconds(req: AnalysisRequest): number {
  const numSubs = req.subreddits.length;
  const fetchReqs = Math.ceil(req.post_limit / 100) * numSubs;
  const commentReqs = req.include_comments ? Math.min(req.post_limit, 50) * numSubs : 0;
  const totalReqs = fetchReqs + commentReqs;
  // OAuth API: ~1s per request
  const fetchTime = totalReqs * 1;
  const totalTexts = req.post_limit * numSubs + (req.include_comments ? req.post_limit * numSubs * 5 : 0);
  const analysisTime = Math.ceil(totalTexts / 16);
  return fetchTime + analysisTime + 5;
}

export function AnalysisPage() {
  const { status, progress, stage, message, result, error, startAnalysis, startSampleAnalysis, cancel, loadResult } = useAnalysis();
  const location = useLocation();
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [estimateSeconds, setEstimateSeconds] = useState(0);

  const handleSubmit = useCallback((req: AnalysisRequest) => {
    setEstimateSeconds(computeEstimateSeconds(req));
    startAnalysis(req);
  }, [startAnalysis]);

  const handleSampleSelect = useCallback((subreddit: string) => {
    setEstimateSeconds(45);
    startSampleAnalysis(subreddit);
  }, [startSampleAnalysis]);

  useEffect(() => {
    const state = location.state as { loadAnalysisId?: string } | null;
    if (state?.loadAnalysisId) {
      setLoadingHistory(true);
      fetchSavedAnalysis(state.loadAnalysisId)
        .then((data) => loadResult(data))
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
      window.history.replaceState({}, '');
    }
  }, [location.state, loadResult]);

  return (
    <div className="space-y-6">
      <AnalysisForm onSubmit={handleSubmit} onCancel={cancel} status={status} />

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
        <DashboardGrid result={result} />
      )}

      {status === 'idle' && !result && !loadingHistory && (
        <>
          <div className="py-16 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl accent-gradient shadow-lg">
              <BarChart3 size={36} className="text-white" />
            </div>
            <h2 className="mb-2 text-3xl font-bold text-[var(--text-primary)]">
              SubReddit Sentiment Analyzer
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Turn Reddit communities into quantitative research. Sentiment analysis, NLP insights, and data visualizations — no data science degree required.
            </p>
            <p className="mx-auto mb-8 max-w-lg text-sm leading-relaxed text-[var(--text-muted)]">
              Analyze what communities think about topics, people, and concepts by quantifying sentiment and language patterns across posts and comments. Built for humanities researchers, social scientists, marketers, and the endlessly curious.
            </p>
            <div className="mb-8 flex justify-center gap-2">
              <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-400">
                RoBERTa NLP
              </span>
              <span className="rounded-full bg-violet-500/10 border border-violet-500/20 px-3 py-1 text-xs font-medium text-violet-400">
                spaCy NER
              </span>
              <span className="rounded-full bg-purple-500/10 border border-purple-500/20 px-3 py-1 text-xs font-medium text-purple-400">
                Multi-Community
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Built by Jimmy Friedman
            </p>
          </div>

          <SampleGallery onSelect={handleSampleSelect} disabled={status === 'loading'} />

          <p className="text-center text-xs text-[var(--text-muted)] mt-4">
            Custom subreddit analysis requires Reddit API credentials.
            Use the form above with your own OAuth keys, or explore the pre-fetched samples below.
          </p>
        </>
      )}
    </div>
  );
}
