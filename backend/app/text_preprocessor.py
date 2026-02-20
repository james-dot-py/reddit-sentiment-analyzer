"""Centralized text pre-processing utilities shared across all NLP modules.

Imports from here keep stop-word lists in a single place so word cloud,
entity extraction, n-gram, and keyword-sentiment pipelines stay consistent.
"""

from __future__ import annotations

import re

# ── Shared Reddit / web stop words ───────────────────────────────────────
# Used by n-gram extraction, word cloud generation, and entity filtering to
# suppress Reddit boilerplate, common web jargon, and low-signal filler words.

REDDIT_STOP_WORDS: set[str] = {
    # Reddit & web platform terms
    "https", "http", "www", "com", "reddit", "amp", "gt", "lt",
    "deleted", "removed", "edit", "update", "post", "comment",
    "thread", "sub", "subreddit", "upvote", "downvote",
    "moderator", "moderators", "mod", "mods", "automod",
    "automoderator", "bot", "flair", "sidebar", "wiki",
    "karma", "crosspost", "repost", "ama",
    "discord", "join", "follow", "subscribe", "unsubscribe",
    "report", "reported", "reporting", "rule", "rules",
    "submission", "submissions", "removal", "approve", "approved",
    # Automod / bot boilerplate vocabulary
    "performed", "automatically", "action", "concerns",
    "contact", "message", "questions", "please",
    "civil", "promote", "socials", "server", "voice",
    "opinions", "connect", "official", "free",
    "decided", "heavily", "posting", "thanks",
    # Sidebar / rules / sticky boilerplate
    "discussion", "welcome", "personal", "attacks",
    "read", "individuals", "learn", "strategies",
    "tips", "experienced", "experts", "community",
    "guidelines", "allowed", "prohibited",
    # Common adjectives/adverbs/verbs that add noise
    "good", "great", "bad", "best", "worst", "better", "worse",
    "really", "very", "much", "many", "lot", "lots", "always",
    "never", "still", "even", "also", "just", "like", "get",
    "got", "going", "go", "make", "made", "thing", "things",
    "way", "want", "need", "know", "think", "say", "said",
    "would", "could", "one", "people", "time", "actually",
    "right", "well", "back", "new", "use", "used", "something",
    "someone", "anything", "everyone", "nothing", "everything",
    "yeah", "yes", "lol", "lmao", "im", "dont", "doesnt",
    "ive", "thats", "youre", "theyre", "isnt", "cant", "wont",
}

# Multi-word n-gram phrases to suppress — Reddit moderation boilerplate and
# platform noise that appear as bigrams/trigrams but carry no sentiment signal.
STOP_NGRAM_PHRASES: set[str] = {
    # Moderation / automod boilerplate
    "heavily reported", "auto moderator", "auto mod",
    "removed rule", "removed comment", "comment removed",
    "post removed", "removed post", "rule violation",
    "moderator action", "mod team", "mod action",
    "message moderators", "contact moderators", "message mods",
    "action performed", "performed automatically",
    "automatically please", "please questions",
    "questions concerns", "thanks posting",
    "posting civil", "heavily decided",
    "decided promote", "promote socials",
    "socials action", "official free",
    "free server", "server voice",
    "voice opinions", "opinions server",
    "server connect",
    # Platform CTAs
    "follow join discord", "join discord", "follow join",
    "discord server", "join server",
    "subscribe follow", "please subscribe",
    # Meta-discussion noise
    "edit update", "edit thanks", "edit typo", "edit grammar",
    "edit clarify", "edit added", "edit word",
    "deleted removed", "removed deleted",
    "upvote downvote", "downvote upvote",
    # Common Reddit filler bigrams
    "feel like", "lot people", "pretty much", "make sure",
    "long time", "first time", "every time", "last time",
    "end day", "point view",
}


def clean_text(text: str) -> str:
    """Basic cleaning for NLP processing (strips URLs, markdown, HTML entities)."""
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"\[.*?\]\(.*?\)", "", text)  # Markdown links
    text = re.sub(r"[>#*_~`]", "", text)        # Markdown formatting
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return text.strip()


def filter_tokens(tokens: list[str], extra_stopwords: set[str] | None = None) -> list[str]:
    """Return alphabetic tokens longer than 2 chars that are not stop words.

    Merges REDDIT_STOP_WORDS with *extra_stopwords* (e.g. NLTK English stop
    words) so callers don't need to do the union themselves.
    """
    combined = REDDIT_STOP_WORDS | (extra_stopwords or set())
    return [t for t in tokens if t.isalpha() and len(t) > 2 and t not in combined]


def filter_entity_text(text: str) -> bool:
    """Return True if an entity string should be kept (not a stop word, len > 1)."""
    stripped = text.strip()
    return len(stripped) > 1 and stripped.lower() not in REDDIT_STOP_WORDS
