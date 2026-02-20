import { useMemo, useState } from 'react';
import type { AnalysisResponse, TribalTopic, ViewMode } from '../types';
import { ExportButtons } from './ui/ExportButtons';
import { AISummary } from './panels/AISummary';
import { SentimentDistribution } from './panels/SentimentDistribution';
import { SentimentOverTime } from './panels/SentimentOverTime';
import { SubredditComparison } from './panels/SubredditComparison';
import { PolarizingPosts } from './panels/PolarizingPosts';
import { NLPInsights } from './panels/NLPInsights';
import { WordClouds } from './panels/WordClouds';
import { CompareSection } from './CompareSection';
import { TribalMap } from './panels/TribalMap';
import { ConceptSearch } from './panels/ConceptSearch';
import { Glossary } from './Glossary';

interface Props {
  result: AnalysisResponse;
}

export function ScrollytellingLayout({ result }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('combined');
  const [highlightTopic, setHighlightTopic] = useState<TribalTopic | null>(null);

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
    <div className="mx-auto max-w-3xl pb-20">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="mb-8">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="heading text-3xl mb-2">
              {subreddits.length === 1
                ? `r/${subreddits[0]}`
                : `${subreddits.map((s) => `r/${s}`).join(' + ')}`}
            </h1>
            <p className="data-text text-xs text-[var(--text-muted)]">
              {totalPosts} posts
              {totalComments > 0 && ` · ${totalComments} comments`}
              {' · '}
              {totalCommunities} communit{totalCommunities !== 1 ? 'ies' : 'y'}
            </p>
          </div>
          <ExportButtons analysisId={result.analysis_id} />
        </div>

        {showToggle && (
          <div className="flex gap-1 rounded bg-[var(--surface-1)] p-1 border border-[var(--border-subtle)]">
            <button
              onClick={() => setViewMode('combined')}
              className={`rounded px-4 py-1.5 text-sm font-medium transition-all ${
                viewMode === 'combined'
                  ? 'accent-gradient shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Combined
            </button>
            {subreddits.map((sub) => (
              <button
                key={sub}
                onClick={() => setViewMode(sub)}
                className={`rounded px-4 py-1.5 text-sm font-medium transition-all ${
                  viewMode === sub
                    ? 'accent-gradient shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                r/{sub}
              </button>
            ))}
          </div>
        )}
      </header>

      <hr className="editorial-divider" />

      {/* ── Section 1: Summary ──────────────────────────────────── */}
      <section className="space-y-4">
        <AISummary text={result.summary_text} />
        {isFiltered && (
          <p className="text-xs italic text-[var(--text-muted)]">
            Showing full corpus synthesis (not filtered by community).
          </p>
        )}
      </section>

      <hr className="editorial-divider" />

      {/* ── Section 2: Sentiment Landscape ─────────────────────────── */}
      {result.tribal_analysis && result.tribal_analysis.topics.length > 0 && (
        <>
          <section className="space-y-6">
            <h2 className="heading text-2xl mb-3">The Sentiment Landscape</h2>

            <TribalMap
              tribalAnalysis={result.tribal_analysis}
              highlightTopic={highlightTopic}
            />

            {/* Drilldown: Sacred & Blasphemous topics */}
            <TopicDrilldown
              topics={result.tribal_analysis.topics}
            />
          </section>

          <hr className="editorial-divider" />

          {/* ── Section 3: Concept Explorer ──────────────────────── */}
          <section>
            <ConceptSearch
              analysisId={result.analysis_id}
              onResult={setHighlightTopic}
            />
          </section>

          <hr className="editorial-divider" />
        </>
      )}

      {/* ── Section 4: Emotional Spectrum ───────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="heading text-2xl mb-2">Sentiment Distribution</h2>
          <p className="body-text text-sm">
            How sentiment is distributed across the dataset. A tight cluster suggests consensus;
            a bimodal spread signals polarization.
          </p>
        </div>
        <SentimentDistribution
          distribution={filtered.sentiment_distribution}
          summaries={filtered.subreddit_summaries}
        />
      </section>

      <hr className="editorial-divider" />

      {/* ── Section 5: Keyword Valence ──────────────────────────── */}
      <section>
        <CompareSection analysisId={result.analysis_id} />
      </section>

      <hr className="editorial-divider" />

      {/* ── Section 6: Timeline ──────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="heading text-2xl mb-2">The Timeline</h2>
          <p className="body-text text-sm">
            Sentiment shifts over time — spikes may correspond to
            breaking news, viral posts, or community events.
          </p>
        </div>
        <SentimentOverTime timeSeries={filtered.time_series} />
      </section>

      <hr className="editorial-divider" />

      {/* ── Section 7: Community Comparison ──────────────────────── */}
      {result.subreddit_summaries.length > 1 && !isFiltered && (
        <>
          <section className="space-y-4">
            <div>
              <h2 className="heading text-2xl mb-2">Community Comparison</h2>
              <p className="body-text text-sm">
                How do these communities differ in their emotional baselines?
              </p>
            </div>
            <SubredditComparison summaries={result.subreddit_summaries} />
          </section>
          <hr className="editorial-divider" />
        </>
      )}

      {/* ── Section 8: Language & Themes ─────────────────────────── */}
      <section className="space-y-6">
        <div>
          <h2 className="heading text-2xl mb-2">Language &amp; Themes</h2>
          <p className="body-text text-sm">
            Named entities, recurring phrases, and the linguistic fingerprint
            of this community.
          </p>
        </div>
        <NLPInsights insights={result.nlp_insights} isFiltered={isFiltered} />
        <WordClouds analysisId={result.analysis_id} />
      </section>

      <hr className="editorial-divider" />

      {/* ── Section 9: The Extremes ──────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="heading text-2xl mb-2">Outlier Posts</h2>
          <p className="body-text text-sm">
            The posts with the strongest sentiment signals — positive and negative.
          </p>
        </div>
        <PolarizingPosts posts={filtered.posts} />
      </section>

      <Glossary />
    </div>
  );
}

/** Drilldown for Sacred and Blasphemous topics */
function TopicDrilldown({ topics }: { topics: import('../types').TribalTopic[] }) {
  const sacred = topics.filter((t) => t.tribal_class === 'Sacred');
  const blasphemous = topics.filter((t) => t.tribal_class === 'Blasphemous');
  const controversial = topics.filter((t) => t.tribal_class === 'Controversial');

  if (sacred.length === 0 && blasphemous.length === 0 && controversial.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <TopicColumn
        title="Celebrated"
        topics={sacred}
        color="var(--tribal-sacred)"
      />
      <TopicColumn
        title="Rejected"
        topics={blasphemous}
        color="var(--tribal-blasphemous)"
      />
      <TopicColumn
        title="Divisive"
        topics={controversial}
        color="var(--tribal-controversial)"
      />
    </div>
  );
}

function TopicColumn({
  title,
  topics,
  color,
}: {
  title: string;
  topics: import('../types').TribalTopic[];
  color: string;
}) {
  if (topics.length === 0) return null;

  return (
    <div className="paper-card p-4 space-y-3">
      <h4 className="heading text-sm" style={{ color }}>
        {title}
      </h4>
      {topics.slice(0, 4).map((t) => (
        <div key={t.topic} className="space-y-1">
          <div className="data-text text-xs font-medium text-[var(--text-primary)]">
            {t.topic}
          </div>
          <div className="data-text text-xs text-[var(--text-muted)]">
            {t.mention_count} mentions · {t.mean_sentiment > 0 ? '+' : ''}
            {t.mean_sentiment.toFixed(3)} avg
          </div>
          {t.sample_texts[0] && (
            <div
              className="pull-quote text-xs !text-[var(--text-muted)] !my-1"
              style={{ borderLeftColor: color }}
            >
              {t.sample_texts[0].slice(0, 100)}
              {t.sample_texts[0].length > 100 ? '...' : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
