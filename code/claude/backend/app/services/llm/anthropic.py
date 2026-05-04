"""Anthropic client implementation (Claude 3, Claude 3.5, etc)."""
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.services.llm.base import (
    LLMClient,
    LLMProvider,
    LLMResponse,
    LLMError,
    RateLimitError,
    AuthenticationError,
)

logger = logging.getLogger(__name__)


class AnthropicClient(LLMClient):
    """Anthropic API client supporting Claude 3, Claude 3.5 Sonnet, etc.

    Uses the Anthropic Messages API (2023-06-01).
    """

    DEFAULT_MODEL = "claude-3-5-sonnet-20241022"
    DEFAULT_BASE_URL = "https://api.anthropic.com/v1"
    API_VERSION = "2023-06-01"

    # Claude models and their context windows
    MODELS = {
        "claude-3-opus-20240229": {"max_tokens": 4096, "context_window": 200000},
        "claude-3-sonnet-20240229": {"max_tokens": 4096, "context_window": 200000},
        "claude-3-5-haiku-20241022": {"max_tokens": 8192, "context_window": 200000},
        "claude-3-5-sonnet-20241022": {"max_tokens": 8192, "context_window": 200000},
    }

    def __init__(
        self,
        api_key: str,
        base_url: str | None = None,
        timeout: int = 30,
        max_retries: int = 3,
    ):
        """Initialize Anthropic client.

        Args:
            api_key: Anthropic API key
            base_url: Optional base URL (rarely needed)
            timeout: Request timeout (default 30s)
            max_retries: Max retry attempts (default 3)
        """
        super().__init__(api_key, base_url, timeout, max_retries)
        self.base_url = base_url or self.DEFAULT_BASE_URL
        self._client = None

    def get_provider(self) -> LLMProvider:
        return LLMProvider.ANTHROPIC

    def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": self.API_VERSION,
                    "Content-Type": "application/json",
                },
                timeout=httpx.Timeout(self.timeout),
            )
        return self._client

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        reraise=True,
    )
    async def complete(
        self,
        prompt: str,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        system_prompt: str | None = None,
    ) -> LLMResponse:
        """Generate completion using Anthropic API.

        Args:
            prompt: User message
            model: Model name (default: claude-3-5-sonnet)
            temperature: Sampling temperature (0-1)
            max_tokens: Max tokens to generate (required for Anthropic)
            system_prompt: Optional system prompt

        Returns:
            LLMResponse with generated content

        Raises:
            LLMError: On API errors
            RateLimitError: On rate limit
            AuthenticationError: On auth failure
        """
        model = model or self.DEFAULT_MODEL
        max_tokens = max_tokens or self.DEFAULT_MAX_TOKENS

        # Build messages
        messages = []
        if system_prompt:
            messages.append({"role": "user", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }

        # Anthropic uses temperature in 0-1 range
        if temperature is not None:
            payload["temperature"] = temperature

        try:
            client = self._get_client()
            response = await client.post("/messages", json=payload)

            if response.status_code == 401:
                raise AuthenticationError("Invalid Anthropic API key")
            elif response.status_code == 429:
                raise RateLimitError("Anthropic rate limit exceeded")
            elif response.status_code >= 400:
                error_text = response.text
                logger.error(f"Anthropic API error: {response.status_code} - {error_text}")
                raise LLMError(f"Anthropic API error: {response.status_code}")

            data = response.json()

            return LLMResponse(
                content=data["content"][0]["text"],
                model=data.get("model", model),
                usage=data.get("usage", {}),
                raw_response=data,
            )

        except httpx.HTTPError as e:
            logger.error(f"Anthropic HTTP error: {e}")
            raise LLMError(f"HTTP error: {e}") from e

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None