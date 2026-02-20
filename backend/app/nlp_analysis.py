"""NLP analysis: NER, n-grams, text statistics, word clouds."""

from __future__ import annotations

import base64
import io
import logging
from collections import Counter
from typing import Optional

import textstat

from .models import NamedEntity, NgramEntry, NLPInsights, TextStatistics
from .text_preprocessor import (
    REDDIT_STOP_WORDS,
    STOP_NGRAM_PHRASES,
    clean_text,
    filter_tokens,
    filter_entity_text,
)

logger = logging.getLogger(__name__)

# Lazy-loaded spaCy model
_nlp = None


def _load_spacy():
    global _nlp
    if _nlp is not None:
        return
    import spacy
    try:
        _nlp = spacy.load("en_core_web_md")
    except OSError:
        logger.warning("en_core_web_md not found, falling back to en_core_web_sm")
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            logger.error("No spaCy model found. Run: python -m spacy download en_core_web_md")
            raise
    # Disable unneeded pipeline components for speed
    _nlp.max_length = 2_000_000


def extract_entities(texts: list[str], top_n: int = 30) -> list[NamedEntity]:
    """Extract named entities from texts using spaCy."""
    _load_spacy()

    entity_counts: Counter = Counter()
    target_labels = {"PERSON", "ORG", "GPE", "NORP", "EVENT", "PRODUCT", "WORK_OF_ART"}

    # Process in chunks to avoid memory issues
    combined = " ".join(clean_text(t) for t in texts[:500])
    if len(combined) > _nlp.max_length:
        combined = combined[: _nlp.max_length]

    doc = _nlp(combined)
    for ent in doc.ents:
        if ent.label_ in target_labels and filter_entity_text(ent.text):
            entity_counts[(ent.text.strip(), ent.label_)] += 1

    results = []
    for (text, label), count in entity_counts.most_common(top_n):
        results.append(NamedEntity(text=text, label=label, count=count))
    return results


def compute_ngrams(texts: list[str], n: int = 2, top_k: int = 20) -> list[NgramEntry]:
    """Compute most common n-grams from texts."""
    import nltk
    from nltk.corpus import stopwords

    try:
        stop_words = set(stopwords.words("english"))
    except LookupError:
        nltk.download("stopwords", quiet=True)
        stop_words = set(stopwords.words("english"))

    try:
        nltk.data.find("tokenizers/punkt_tab")
    except LookupError:
        nltk.download("punkt_tab", quiet=True)

    ngram_counts: Counter = Counter()

    for text in texts:
        text = clean_text(text).lower()
        tokens = nltk.word_tokenize(text)
        tokens = filter_tokens(tokens, extra_stopwords=stop_words)

        grams = list(nltk.ngrams(tokens, n))
        ngram_counts.update(grams)

    # Filter out known boilerplate n-gram phrases
    results = []
    for gram, count in ngram_counts.most_common(top_k * 3):  # over-fetch to compensate for filtering
        phrase = " ".join(gram)
        if phrase not in STOP_NGRAM_PHRASES:
            results.append(NgramEntry(text=phrase, count=count))
            if len(results) >= top_k:
                break
    return results


def compute_text_stats(
    post_texts: list[str],
    comment_texts: Optional[list[str]] = None,
) -> TextStatistics:
    """Compute text statistics."""
    post_lengths = [len(t.split()) for t in post_texts if t.strip()]
    avg_post_length = sum(post_lengths) / max(len(post_lengths), 1)

    avg_comment_length = None
    if comment_texts:
        comment_lengths = [len(t.split()) for t in comment_texts if t.strip()]
        if comment_lengths:
            avg_comment_length = sum(comment_lengths) / len(comment_lengths)

    # Vocabulary richness (type-token ratio)
    all_texts = post_texts + (comment_texts or [])
    all_words = []
    for t in all_texts:
        all_words.extend(t.lower().split())
    total_words = len(all_words)
    unique_words = len(set(all_words))
    vocab_richness = unique_words / max(total_words, 1)

    # Reading level (Flesch-Kincaid grade level)
    combined = " ".join(t for t in all_texts if t.strip())[:50000]
    reading_level = textstat.flesch_kincaid_grade(combined) if combined else 0

    return TextStatistics(
        avg_post_length=round(avg_post_length, 1),
        avg_comment_length=round(avg_comment_length, 1) if avg_comment_length else None,
        vocabulary_richness=round(vocab_richness, 4),
        reading_level=round(reading_level, 1),
        total_words=total_words,
    )


def generate_wordcloud_image(texts: list[str], max_words: int = 100, custom_stopwords: Optional[list[str]] = None) -> str:
    """Generate a word cloud and return as base64-encoded PNG."""
    from wordcloud import WordCloud, STOPWORDS

    stopwords = set(STOPWORDS)
    if custom_stopwords:
        stopwords.update(custom_stopwords)
    # Merge shared Reddit/web stop words so word cloud stays consistent
    # with n-gram filtering
    stopwords.update(REDDIT_STOP_WORDS)

    combined = " ".join(clean_text(t) for t in texts)
    if not combined.strip():
        return ""

    wc = WordCloud(
        width=800,
        height=400,
        max_words=max_words,
        stopwords=stopwords,
        background_color="#F9F7F1",
        colormap="Dark2",
        contour_width=0,
        margin=10,
    )
    wc.generate(combined)

    buf = io.BytesIO()
    wc.to_image().save(buf, format="PNG")
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


def run_full_nlp_analysis(
    post_texts: list[str],
    comment_texts: Optional[list[str]] = None,
) -> NLPInsights:
    """Run all NLP analyses and return aggregated insights."""
    all_texts = post_texts + (comment_texts or [])

    entities = extract_entities(all_texts)
    bigrams = compute_ngrams(all_texts, n=2)
    trigrams = compute_ngrams(all_texts, n=3)
    text_stats = compute_text_stats(post_texts, comment_texts)

    return NLPInsights(
        entities=entities,
        bigrams=bigrams,
        trigrams=trigrams,
        text_stats=text_stats,
    )
