export type ViewMode = 'combined' | string;

export type SortMethod = "hot" | "new" | "rising" | "top";
export type TimeFilter = "day" | "week" | "month" | "year" | "all";
export type SentimentLabel = "positive" | "neutral" | "negative";

export interface AnalysisRequest {
  subreddits: string[];
  post_limit: number;
  sort: SortMethod;
  time_filter: TimeFilter;
  include_comments: boolean;
  comment_depth: number;
}

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  score: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  url: string;
}

export interface RedditComment {
  id: string;
  post_id: string;
  subreddit: string;
  body: string;
  author: string;
  score: number;
  created_utc: number;
}

export interface SentimentResult {
  label: SentimentLabel;
  confidence: number;
  compound_score: number;
  scores: Record<string, number>;
}

export interface PostWithSentiment {
  post: RedditPost;
  sentiment: SentimentResult;
}

export interface CommentWithSentiment {
  comment: RedditComment;
  sentiment: SentimentResult;
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

export interface TimeSeriesPoint {
  date: string;
  avg_sentiment: number;
  count: number;
  subreddit: string;
}

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

export interface KeywordComparison {
  keyword: string;
  with_keyword: SentimentStats;
  without_keyword: SentimentStats;
}

export interface WordCloudResponse {
  image: string;
  sentiment: string;
  text_count: number;
}

export interface ContextSnippet {
  text: string;
  sentiment_score: number;
  sentiment_label: string;
  source_type: 'post' | 'comment';
  post_title?: string;
  permalink?: string;
}

export interface KeywordTimePoint {
  date: string;
  avg_sentiment: number;
  mention_count: number;
}

export interface KeywordAnalysisResult {
  keyword: string;
  mention_count: number;
  stats: SentimentStats;
  baseline_stats: SentimentStats;
  top_positive: PostWithSentiment[];
  top_negative: PostWithSentiment[];
  timeline: KeywordTimePoint[];
  snippets: ContextSnippet[];
  distribution: number[];
}

export interface KeywordAnalysisResponse {
  analysis_id: string;
  results: KeywordAnalysisResult[];
}

export interface AnalysisResponse {
  analysis_id: string;
  subreddit_summaries: SubredditSentimentSummary[];
  posts: PostWithSentiment[];
  comments: CommentWithSentiment[];
  time_series: TimeSeriesPoint[];
  nlp_insights: NLPInsights;
  summary_text: string;
  sentiment_distribution: number[];
}

export interface SampleInfo {
  subreddit: string;
  description: string;
  post_count: number;
  comment_count: number;
  fetched_at: string;
  sort: string;
  time_filter: string;
  cached: boolean;
  precomputed: boolean;
}

export interface ProgressEvent {
  stage: "started" | "fetching" | "analyzing" | "aggregating" | "nlp" | "summarizing" | "complete" | "error" | "results";
  message?: string;
  progress?: number;
  analysis_id?: string;
  data?: AnalysisResponse;
}
