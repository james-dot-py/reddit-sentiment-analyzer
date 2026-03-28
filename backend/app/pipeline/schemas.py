"""JSON schemas for Claude structured output calls.

Each schema is used with output_config.format.json_schema to guarantee
valid JSON responses from the API. Schemas must use additionalProperties: false
on all object types.
"""

# ── Stage 2: Classification ──────────────────────────────────────────────────

CLASSIFICATION_MENTION_SCHEMA = {
    "type": "object",
    "properties": {
        "mentions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source_id": {"type": "string"},
                    "brand_id": {"type": "string"},
                    "topic_cluster": {
                        "type": "string",
                        "enum": [
                            "product_quality", "price_value", "customer_service",
                            "competitor_comparison", "recommendation", "complaint",
                            "ingredient_concern", "product_switch", "general_mention",
                        ],
                    },
                    "relevance_score": {"type": "number"},
                    "text_excerpt": {"type": "string"},
                },
                "required": ["source_id", "brand_id", "topic_cluster", "relevance_score", "text_excerpt"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["mentions"],
    "additionalProperties": False,
}

# ── Stage 3: Deep Analysis ───────────────────────────────────────────────────

DEEP_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "analyzed_mentions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "mention_id": {"type": "string"},
                    "sentiment": {
                        "type": "string",
                        "enum": ["positive", "neutral", "negative", "mixed"],
                    },
                    "sentiment_granular": {"type": "string"},
                    "emotion": {"type": "string"},
                    "intensity": {"type": "integer"},
                    "themes": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "context_summary": {"type": "string"},
                },
                "required": [
                    "mention_id", "sentiment", "sentiment_granular",
                    "emotion", "intensity", "themes", "context_summary",
                ],
                "additionalProperties": False,
            },
        },
        "top_themes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "theme": {"type": "string"},
                    "count": {"type": "integer"},
                    "avg_sentiment_score": {"type": "number"},
                    "velocity": {"type": "number"},
                },
                "required": ["theme", "count", "avg_sentiment_score", "velocity"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["analyzed_mentions", "top_themes"],
    "additionalProperties": False,
}

# ── Stage 4: Synthesis (LLM portions only) ───────────────────────────────────

SYNTHESIS_LLM_SCHEMA = {
    "type": "object",
    "properties": {
        "narrative_headline": {"type": "string"},
        "narrative_signals": {
            "type": "array",
            "items": {"type": "string"},
        },
        "narrative_deep_dive": {"type": "string"},
        "trajectory": {"type": "integer"},
        "community_alignment_score": {"type": "integer"},
        "status_tag": {
            "type": "string",
            "enum": [
                "thriving", "positive", "stable",
                "watch", "at_risk", "declining", "crisis",
            ],
        },
        "aligned_values": {
            "type": "array",
            "items": {"type": "string"},
        },
        "friction_points": {
            "type": "array",
            "items": {"type": "string"},
        },
        "key_evidence_posts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "post_url": {"type": "string"},
                    "post_title": {"type": "string"},
                    "upvotes": {"type": "integer"},
                    "comment_count": {"type": "integer"},
                    "why_notable": {"type": "string"},
                    "sentiment_label": {
                        "type": "string",
                        "enum": ["positive", "negative", "neutral"],
                    },
                },
                "required": ["post_url", "post_title", "upvotes", "comment_count", "why_notable", "sentiment_label"],
                "additionalProperties": False,
            },
        },
        # v2 additions
        "blunt_verdict": {"type": "string"},
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "severity": {
                        "type": "string",
                        "enum": ["critical", "elevated", "monitor"],
                    },
                    "category": {
                        "type": "string",
                        "enum": ["product_issue", "trust_issue", "channel_risk", "trend_signal"],
                    },
                    "text": {"type": "string"},
                    "mention_count": {"type": "integer"},
                },
                "required": ["severity", "category", "text", "mention_count"],
                "additionalProperties": False,
            },
        },
        "section_verdicts": {
            "type": "object",
            "properties": {
                "theme_map": {"type": "string"},
                "competitive": {"type": "string"},
                "evidence": {"type": "string"},
                "narrative": {"type": "string"},
            },
            "required": ["theme_map", "competitive", "evidence", "narrative"],
            "additionalProperties": False,
        },
        "friction_point_details": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "mention_count": {"type": "integer"},
                    "trend": {
                        "type": "string",
                        "enum": ["rising", "stable", "declining"],
                    },
                    "category": {
                        "type": "string",
                        "enum": ["product", "trust", "channel"],
                    },
                },
                "required": ["text", "mention_count", "trend", "category"],
                "additionalProperties": False,
            },
        },
        "aligned_value_details": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "mention_count": {"type": "integer"},
                    "trend": {
                        "type": "string",
                        "enum": ["rising", "stable", "declining"],
                    },
                    "category": {
                        "type": "string",
                        "enum": ["product", "trust", "channel"],
                    },
                },
                "required": ["text", "mention_count", "trend", "category"],
                "additionalProperties": False,
            },
        },
    },
    "required": [
        "narrative_headline", "narrative_signals", "narrative_deep_dive",
        "trajectory", "community_alignment_score",
        "status_tag", "aligned_values", "friction_points", "key_evidence_posts",
        "blunt_verdict", "findings", "section_verdicts",
        "friction_point_details", "aligned_value_details",
    ],
    "additionalProperties": False,
}

# ── Stage 5: Trend Analysis ──────────────────────────────────────────────────

TREND_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "trajectory": {
            "type": "string",
            "enum": ["improving", "stable", "declining", "volatile"],
        },
        "narrative_delta": {"type": "string"},
        "emerging_themes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "theme": {"type": "string"},
                    "first_seen": {"type": "string"},
                    "growth_rate": {
                        "type": "string",
                        "enum": ["accelerating", "steady", "slowing"],
                    },
                },
                "required": ["theme", "first_seen", "growth_rate"],
                "additionalProperties": False,
            },
        },
        "declining_themes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "theme": {"type": "string"},
                    "peak": {"type": "string"},
                    "trend": {
                        "type": "string",
                        "enum": ["fading", "collapsed", "plateaued"],
                    },
                },
                "required": ["theme", "peak", "trend"],
                "additionalProperties": False,
            },
        },
        "inflection_points": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["date", "description"],
                "additionalProperties": False,
            },
        },
    },
    "required": [
        "trajectory", "narrative_delta",
        "emerging_themes", "declining_themes", "inflection_points",
    ],
    "additionalProperties": False,
}

# ── Community Profile ────────────────────────────────────────────────────────

COMMUNITY_PROFILE_SCHEMA = {
    "type": "object",
    "properties": {
        "values_celebrated": {
            "type": "array",
            "items": {"type": "string"},
        },
        "friction_points": {
            "type": "array",
            "items": {"type": "string"},
        },
        "dominant_tone": {"type": "string"},
        "key_opinion_dynamics": {"type": "string"},
    },
    "required": [
        "values_celebrated", "friction_points",
        "dominant_tone", "key_opinion_dynamics",
    ],
    "additionalProperties": False,
}
