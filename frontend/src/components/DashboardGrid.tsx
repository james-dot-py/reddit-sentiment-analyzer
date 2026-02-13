import { useMemo, useState } from 'react';
import type { AnalysisResponse, ViewMode } from '../types';
import { ExportButtons } from './ui/ExportButtons';
import { AISummary } from './panels/AISummary';
import { SentimentDistribution } from './panels/SentimentDistribution';
import { SentimentOverTime } from './panels/SentimentOverTime';
import { SubredditComparison } from './panels/SubredditComparison';
import { PolarizingPosts } from './panels/PolarizingPosts';
import { NLPInsights } from './panels/NLPInsights';
import { WordClouds } from './panels/WordClouds';
import { KeywordSentiment } from './panels/KeywordSentiment';
import { CompareSection } from './CompareSection';
import { Glossary } from './Glossary';

interface Props {
  result: AnalysisResponse;
}

export function DashboardGrid({ result }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('combined');
  const subreddits = result.subreddit_summaries.map((s) => s.subreddit);
  const showToggle = subreddits.length > 1;
  const isFiltered = viewMode !== 'combined';

  const filtered = useMemo(() => {
    if (!isFiltered) return result;

    const sub = viewMode;
    const posts = result.posts.filter((p) => p.post.subreddit === sub);
    const comments = result.comments.filter((c) => c.comment.subreddit === sub);
    const time_series = result.time_series.filter((t) => t.subreddit === sub);
    const subreddit_summaries = result.subreddit_summaries.filter((s) => s.subreddit === sub);

    const sentiment_distribution = posts.map((p) => p.sentiment.compound_score);
    if (comments.length > 0) {
      sentiment_distribution.push(...comments.map((c) => c.sentiment.compound_score));
    }

    return {
      ...result,
      posts,
      comments,
      time_series,
      subreddit_summaries,
      sentiment_distribution,
    };
  }, [result, viewMode, isFiltered]);

  const totalPosts = result.posts.length;
  const totalComments = result.comments.length;
  const totalCommunities = result.subreddit_summaries.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-muted)]">
          Analyzed{' '}
          <strong className="text-[var(--text-primary)]">{totalPosts}</strong> posts
          {totalComments > 0 && (
            <>
              {' '}and{' '}
              <strong className="text-[var(--text-primary)]">{totalComments}</strong> comments
            </>
          )}
          {' '}across{' '}
          <strong className="text-[var(--text-primary)]">{totalCommunities}</strong> communit{totalCommunities !== 1 ? 'ies' : 'y'}
        </div>
        <ExportButtons analysisId={result.analysis_id} />
      </div>

      {showToggle && (
        <div className="flex gap-1 rounded-xl bg-[var(--surface-1)] p-1 border border-[var(--border-subtle)]">
          <button
            onClick={() => setViewMode('combined')}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              viewMode === 'combined'
                ? 'accent-gradient text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Combined
          </button>
          {subreddits.map((sub) => (
            <button
              key={sub}
              onClick={() => setViewMode(sub)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                viewMode === sub
                  ? 'accent-gradient text-white shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              r/{sub}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <AISummary text={result.summary_text} />
          {isFiltered && (
            <p className="mt-1 text-xs italic text-[var(--text-muted)]">
              Showing full corpus synthesis (not filtered by community).
            </p>
          )}
        </div>

        {/* Compare Section — primary feature */}
        <div className="lg:col-span-2">
          <CompareSection analysisId={result.analysis_id} />
        </div>

        <SentimentDistribution
          distribution={filtered.sentiment_distribution}
          summaries={filtered.subreddit_summaries}
        />

        <div className="lg:col-span-1">
          <KeywordSentiment analysisId={result.analysis_id} />
        </div>

        <div className="lg:col-span-2">
          <SentimentOverTime timeSeries={filtered.time_series} />
        </div>

        {result.subreddit_summaries.length > 1 && !isFiltered && (
          <div className="lg:col-span-2">
            <SubredditComparison summaries={result.subreddit_summaries} />
          </div>
        )}

        <div className="lg:col-span-2">
          <WordClouds analysisId={result.analysis_id} />
        </div>

        <div className="lg:col-span-2">
          <NLPInsights insights={result.nlp_insights} isFiltered={isFiltered} />
        </div>

        <div className="lg:col-span-2">
          <PolarizingPosts posts={filtered.posts} />
        </div>
      </div>

      <Glossary />
    </div>
  );
}
