// ── v2 Brand Intelligence Types ──────────────────────────────────────────

export type StatusTag =
  | "thriving"
  | "positive"
  | "stable"
  | "watch"
  | "at_risk"
  | "declining"
  | "crisis";

export type Trajectory = "improving" | "stable" | "declining" | "volatile";

// ── Project config ──────────────────────────────────────────────────────

export interface Project {
  project_id: string;
  project_name: string;
  brands: BrandConfig[];
  subreddits: SubredditConfig[];
}

export interface BrandConfig {
  brand_id: string;
  brand_name: string;
  aliases: string[];
  is_competitor: boolean;
}

export interface SubredditConfig {
  subreddit: string;
  relevance: string;
  pull_config: {
    post_limit: number;
    comment_depth: number;
    sort: string;
    time_filter: string;
  };
}

// ── Score components ────────────────────────────────────────────────────

export interface ScoreComponents {
  sentiment_mix: number;
  intensity: number;
  trajectory: number;
  community_alignment: number;
}

// ── Synthesis (per-subreddit) ───────────────────────────────────────────

export interface CommunityAlignment {
  aligned_values: string[];
  friction_points: string[];
}

export interface EvidencePost {
  post_url: string;
  post_title: string;
  upvotes: number;
  comment_count: number;
  why_notable: string;
}

export interface SynthesisData {
  brand_id: string;
  snapshot_date: string;
  subreddit: string;
  undercurrent_score: number;
  score_components: ScoreComponents;
  status_tag: StatusTag;
  narrative_summary: string;
  community_alignment: CommunityAlignment;
  key_evidence_posts: EvidencePost[];
}

// ── Deep analysis summary ───────────────────────────────────────────────

export interface ThemeEntry {
  theme: string;
  count: number;
  avg_sentiment: number;
}

export interface DeepAnalysisSummary {
  sentiment_distribution: {
    positive: number;
    neutral: number;
    negative: number;
    mixed: number;
  };
  average_intensity: number;
  top_themes: ThemeEntry[];
  mention_count: number;
}

// ── Community profile ───────────────────────────────────────────────────

export interface CommunityProfile {
  subreddit: string;
  profile_date: string;
  community_size_approx: string;
  values_celebrated: string[];
  friction_points: string[];
  dominant_tone: string;
  key_opinion_dynamics: string;
}

// ── Dashboard aggregate ─────────────────────────────────────────────────

export interface SubredditDashboardData {
  subreddit: string;
  synthesis: SynthesisData;
  deep_analysis_summary: DeepAnalysisSummary | null;
  community_profile: CommunityProfile | null;
}

export interface BrandDashboard {
  brand_id: string;
  brand_name: string;
  is_competitor: boolean;
  snapshot_date: string;
  week_subreddits: SubredditDashboardData[];
}

// ── Trends ──────────────────────────────────────────────────────────────

export interface ScorePoint {
  date: string;
  score: number;
  status: StatusTag;
}

export interface EmergingTheme {
  theme: string;
  first_seen: string;
  growth_rate: string;
}

export interface DecliningTheme {
  theme: string;
  peak: string;
  trend: string;
}

export interface InflectionPoint {
  date: string;
  description: string;
}

export interface Annotation {
  annotation_id: string;
  date: string;
  label: string;
  type: string;
  added_by: string;
}

export interface TrendData {
  brand_id: string;
  generated_at: string | null;
  score_history: ScorePoint[];
  trajectory: Trajectory | null;
  narrative_delta: string;
  emerging_themes: EmergingTheme[];
  declining_themes: DecliningTheme[];
  inflection_points: InflectionPoint[];
  annotations: Annotation[];
}

