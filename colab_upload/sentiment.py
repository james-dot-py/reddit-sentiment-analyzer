"""Sentiment analysis using HuggingFace transformers (RoBERTa)."""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
from scipy.special import softmax

from .models import SentimentLabel, SentimentResult

logger = logging.getLogger(__name__)

# Lazy-loaded globals
_tokenizer = None
_model = None
_model_loading = False

MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"

# The model outputs 3 classes: negative (0), neutral (1), positive (2)
LABEL_MAP = {0: SentimentLabel.negative, 1: SentimentLabel.neutral, 2: SentimentLabel.positive}
COMPOUND_MAP = {SentimentLabel.negative: -1.0, SentimentLabel.neutral: 0.0, SentimentLabel.positive: 1.0}


def _load_model():
    """Lazy-load the sentiment model and tokenizer."""
    global _tokenizer, _model, _model_loading

    if _tokenizer is not None and _model is not None:
        return

    if _model_loading:
        return

    _model_loading = True
    logger.info(f"Loading sentiment model: {MODEL_NAME}")

    try:
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        _model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
        logger.info("Sentiment model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load sentiment model: {e}")
        raise
    finally:
        _model_loading = False


def is_model_loaded() -> bool:
    return _tokenizer is not None and _model is not None


def preload_model() -> None:
    """Pre-load the model at startup."""
    _load_model()


def _preprocess_text(text: str) -> str:
    """Clean text for the sentiment model."""
    # Truncate long text (model max is 512 tokens, ~300 words is safe)
    text = text.strip()
    if len(text) > 1500:
        text = text[:1500]
    # Replace Reddit-specific patterns
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return text


def analyze_text(text: str) -> Optional[SentimentResult]:
    """Analyze sentiment of a single text string."""
    _load_model()

    text = _preprocess_text(text)
    if not text:
        return None

    try:
        import torch

        encoded = _tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        with torch.no_grad():
            output = _model(**encoded)
        scores = output.logits[0].detach().numpy()
        probs = softmax(scores)

        # Determine top label
        top_idx = int(np.argmax(probs))
        label = LABEL_MAP[top_idx]
        confidence = float(probs[top_idx])

        # Compute compound score: weighted average using label semantics
        # negative=-1, neutral=0, positive=+1, weighted by their probabilities
        compound = float(probs[2] - probs[0])  # P(positive) - P(negative)

        return SentimentResult(
            label=label,
            confidence=confidence,
            compound_score=round(compound, 4),
            scores={
                "negative": round(float(probs[0]), 4),
                "neutral": round(float(probs[1]), 4),
                "positive": round(float(probs[2]), 4),
            },
        )
    except Exception as e:
        logger.warning(f"Sentiment analysis failed for text: {e}")
        return None


def analyze_batch(texts: list[str], batch_size: int = 16) -> list[Optional[SentimentResult]]:
    """Analyze sentiment of multiple texts in batches for efficiency."""
    _load_model()
    import torch

    results: list[Optional[SentimentResult]] = []

    for i in range(0, len(texts), batch_size):
        batch_texts = [_preprocess_text(t) for t in texts[i : i + batch_size]]

        # Handle empty texts
        non_empty_indices = [j for j, t in enumerate(batch_texts) if t.strip()]
        non_empty_texts = [batch_texts[j] for j in non_empty_indices]

        batch_results: list[Optional[SentimentResult]] = [None] * len(batch_texts)

        if non_empty_texts:
            try:
                encoded = _tokenizer(
                    non_empty_texts,
                    return_tensors="pt",
                    truncation=True,
                    max_length=512,
                    padding=True,
                )
                with torch.no_grad():
                    output = _model(**encoded)
                all_scores = output.logits.detach().numpy()

                for k, idx in enumerate(non_empty_indices):
                    probs = softmax(all_scores[k])
                    top_idx = int(np.argmax(probs))
                    label = LABEL_MAP[top_idx]
                    confidence = float(probs[top_idx])
                    compound = float(probs[2] - probs[0])

                    batch_results[idx] = SentimentResult(
                        label=label,
                        confidence=confidence,
                        compound_score=round(compound, 4),
                        scores={
                            "negative": round(float(probs[0]), 4),
                            "neutral": round(float(probs[1]), 4),
                            "positive": round(float(probs[2]), 4),
                        },
                    )
            except Exception as e:
                logger.warning(f"Batch sentiment analysis failed: {e}")

        results.extend(batch_results)

    return results
