"""Pipeline utilities: atomic writes, token estimation, batching."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def save_atomic(path: Path, data: Any) -> None:
    """Write JSON data atomically — write to .tmp, then os.replace()."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(
        dir=str(path.parent), suffix=".tmp", prefix=path.stem + "_"
    )
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, str(path))
    except Exception:
        # Clean up temp file on failure
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token for English text."""
    return max(1, len(text) // 4)


def batch_by_tokens(
    items: list[dict],
    text_key: str,
    target_tokens: int = 3000,
    max_items: int = 50,
) -> list[list[dict]]:
    """Split items into batches targeting a token budget.

    Each batch aims for ~target_tokens of text content, with a hard cap
    of max_items per batch.
    """
    batches: list[list[dict]] = []
    current_batch: list[dict] = []
    current_tokens = 0

    for item in items:
        text = item.get(text_key, "")
        item_tokens = estimate_tokens(text)

        if current_batch and (
            current_tokens + item_tokens > target_tokens
            or len(current_batch) >= max_items
        ):
            batches.append(current_batch)
            current_batch = []
            current_tokens = 0

        current_batch.append(item)
        current_tokens += item_tokens

    if current_batch:
        batches.append(current_batch)

    return batches


def now_iso() -> str:
    """UTC ISO timestamp."""
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path) -> Any:
    """Load JSON file, return None if not found."""
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
