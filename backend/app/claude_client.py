"""Anthropic Claude API client wrapper for brand intelligence analysis.

Provides structured output calls to Claude Haiku (classification) and
Claude Sonnet (deep analysis, synthesis, trends) with retry logic,
cost tracking, and atomic JSON schema enforcement.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import anthropic
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential_jitter,
    before_sleep_log,
)

logger = logging.getLogger(__name__)

# ── Model IDs ────────────────────────────────────────────────────────────────

HAIKU_MODEL = "claude-haiku-4-5"
SONNET_MODEL = "claude-sonnet-4-5"

# ── Cost tracking (per 1M tokens) ────────────────────────────────────────────

MODEL_COSTS = {
    HAIKU_MODEL: {"input": 1.00, "output": 5.00},
    SONNET_MODEL: {"input": 3.00, "output": 15.00},
}


def _is_retryable(exc: BaseException) -> bool:
    """Return True for transient errors that should be retried."""
    if isinstance(exc, anthropic.RateLimitError):
        return True
    if isinstance(exc, anthropic.APIStatusError):
        return exc.status_code >= 500
    if isinstance(exc, anthropic.APIConnectionError):
        return True
    return False


class CostTracker:
    """Accumulates token usage and estimated costs across pipeline calls."""

    def __init__(self):
        self.calls: list[dict] = []
        self.total_input_tokens = 0
        self.total_output_tokens = 0

    def record(self, model: str, usage: anthropic.types.Usage, stage: str = ""):
        input_tokens = usage.input_tokens
        output_tokens = usage.output_tokens
        costs = MODEL_COSTS.get(model, {"input": 0, "output": 0})
        cost = (input_tokens * costs["input"] + output_tokens * costs["output"]) / 1_000_000
        self.calls.append({
            "stage": stage,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": round(cost, 6),
        })
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens

    @property
    def total_cost(self) -> float:
        return round(sum(c["cost_usd"] for c in self.calls), 4)

    def summary(self) -> str:
        lines = [f"API calls: {len(self.calls)}"]
        lines.append(f"Total tokens: {self.total_input_tokens:,} in / {self.total_output_tokens:,} out")
        lines.append(f"Estimated cost: ${self.total_cost:.4f}")
        return "\n".join(lines)


class ClaudeClient:
    """Wrapper around the Anthropic SDK for structured brand intelligence calls."""

    def __init__(self, cost_tracker: CostTracker | None = None):
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY not set. "
                "Set it as an environment variable to use Claude analysis."
            )
        self._client = anthropic.Anthropic(api_key=api_key)
        self.cost_tracker = cost_tracker or CostTracker()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=1, max=10, jitter=1),
        retry=retry_if_exception(_is_retryable),
        before_sleep=before_sleep_log(logger, logging.WARNING),
    )
    def call_structured(
        self,
        *,
        model: str,
        system: str,
        user_content: str,
        output_schema: dict[str, Any],
        max_tokens: int = 4096,
        stage: str = "",
    ) -> dict[str, Any]:
        """Make a structured output call to Claude.

        Uses output_config.format with json_schema to guarantee valid JSON
        matching the provided schema. Returns the parsed JSON dict.
        """
        t0 = time.monotonic()

        response = self._client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_content}],
            output_config={
                "format": {
                    "type": "json_schema",
                    "schema": output_schema,
                }
            },
        )

        duration = round(time.monotonic() - t0, 2)
        self.cost_tracker.record(model, response.usage, stage=stage)

        # Extract text content from response
        text = ""
        for block in response.content:
            if block.type == "text":
                text = block.text
                break

        if not text:
            raise ValueError(f"Empty response from Claude ({stage})")

        result = json.loads(text)
        logger.info(
            f"Claude {stage}: {response.usage.input_tokens}in/"
            f"{response.usage.output_tokens}out tokens, {duration}s"
        )
        return result

    def classify(
        self,
        *,
        system: str,
        user_content: str,
        output_schema: dict[str, Any],
        max_tokens: int = 4096,
        stage: str = "classification",
    ) -> dict[str, Any]:
        """Classification call using Haiku (cheap, high-volume)."""
        return self.call_structured(
            model=HAIKU_MODEL,
            system=system,
            user_content=user_content,
            output_schema=output_schema,
            max_tokens=max_tokens,
            stage=stage,
        )

    def analyze(
        self,
        *,
        system: str,
        user_content: str,
        output_schema: dict[str, Any],
        max_tokens: int = 4096,
        stage: str = "analysis",
    ) -> dict[str, Any]:
        """Deep analysis call using Sonnet (targeted, moderate cost)."""
        return self.call_structured(
            model=SONNET_MODEL,
            system=system,
            user_content=user_content,
            output_schema=output_schema,
            max_tokens=max_tokens,
            stage=stage,
        )
