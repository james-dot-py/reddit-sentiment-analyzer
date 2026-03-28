// ── v2 Brand Intelligence Types ──────────────────────────────────────────

// ── View mode ──────────────────────────────────────────────────────────
export type ViewMode = 'briefing' | 'deep-dive';

// ── Findings with severity (Narrative Intelligence) ────────────────────
export type FindingSeverity = 'critical' | 'elevated' | 'monitor';
export type FindingCategory = 'product_issue' | 'trust_issue' | 'channel_risk' | 'trend_signal';

export interface Finding {
  severity: FindingSeverity;
  category: FindingCategory;
  text: string;
  mention_count?: number;
}

// ── Section verdicts ("so what" statements) ────────────────────────────
export interface SectionVerdicts {
  theme_map?: string;
  competitive?: string;
  evidence?: string;
  narrative?: string;
}

// ── Enhanced friction/alignment with metrics ───────────────────────────
export interface DetailedItem {
  text: string;
  mention_count?: number;
  trend?: 'rising' | 'stable' | 'declining';
  category?: 'product' | 'trust' | 'channel';
}

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
  // v2 metadata
  subreddit?: string;
  post_date?: string;
  sentiment_label?: 'positive' | 'negative' | 'neutral';
}

export interface SynthesisData {
  brand_id: string;
  snapshot_date: string;
  subreddit: string;
  undercurrent_score: number;
  score_components: ScoreComponents;
  status_tag: StatusTag;
  narrative_headline: string;
  narrative_signals: string[];
  narrative_deep_dive: string;
  narrative_summary: string;
  community_alignment: CommunityAlignment;
  key_evidence_posts: EvidencePost[];
  // Data quality / confidence
  data_quality?: DataQuality;
  // v2 extensions (optional for backward compat with existing data)
  blunt_verdict?: string;
  findings?: Finding[];
  section_verdicts?: SectionVerdicts;
  friction_point_details?: DetailedItem[];
  aligned_value_details?: DetailedItem[];
}

// ── Deep analysis summary ───────────────────────────────────────────────

export interface ThemeEntry {
  theme: string;
  count: number;
  avg_sentiment: number;
  velocity?: number;  // -1 to 1 for bubble chart size
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
  smoothed_score?: number;
  status: StatusTag;
}

// ── Data quality / confidence ──────────────────────────────────────────

export interface DataQuality {
  mention_count: number;
  total_posts_scanned: number;
  confidence_level: 'low' | 'moderate' | 'high';
  confidence_note: string;
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

