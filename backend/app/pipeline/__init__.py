"""Brand intelligence analysis pipeline — Stages 2-5 + community profiles.

Pipeline stages:
  Stage 2: Classification (Haiku) — find and classify brand mentions
  Stage 3: Deep Analysis (Sonnet) — nuanced sentiment on relevant mentions
  Stage 4: Synthesis (Sonnet) — narrative + Undercurrent Score
  Stage 5: Trends (Sonnet) — cross-week trajectory analysis
  Community Profile — subreddit cultural values and dynamics
"""

from .stage2_classification import classify_brand_mentions
from .stage3_deep_analysis import analyze_mentions_deeply
from .stage4_synthesis import synthesize_brand
from .stage5_trends import analyze_trends, load_prior_syntheses
from .community_profile import generate_community_profile, needs_profile_update

__all__ = [
    "classify_brand_mentions",
    "analyze_mentions_deeply",
    "synthesize_brand",
    "analyze_trends",
    "load_prior_syntheses",
    "generate_community_profile",
    "needs_profile_update",
]
