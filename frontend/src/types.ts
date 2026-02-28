// Types will be rewritten in Phase 4 to match the new brand intelligence data model.
// Keeping minimal types needed by retained panels (NLPInsights, SentimentDistribution).

export type SentimentLabel = "positive" | "neutral" | "negative";

export interface SnapshotIndex {
  weeks: string[];
  by_subreddit: Record<string, string[]>;
}

// ── Kept for retained panels ──────────────────────────────────────────────

export interface NamedEntity {
  text: string;
  label: string;
  count: number;
}

export interface NgramEntry {
  text: string;
  count: number;
}

export interface TextStatistics {
  avg_post_length: number;
  avg_comment_length: number | null;
  vocabulary_richness: number;
  reading_level: number;
  total_words: number;
}

export interface NLPInsights {
  entities: NamedEntity[];
  bigrams: NgramEntry[];
  trigrams: NgramEntry[];
  text_stats: TextStatistics;
}

export interface SentimentStats {
  mean: number;
  median: number;
  std_dev: number;
  positive_pct: number;
  neutral_pct: number;
  negative_pct: number;
  total_count: number;
}

export interface SubredditSentimentSummary {
  subreddit: string;
  post_stats: SentimentStats;
  comment_stats: SentimentStats | null;
  post_count: number;
  comment_count: number;
}
