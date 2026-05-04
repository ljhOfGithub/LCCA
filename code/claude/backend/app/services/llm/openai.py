"""OpenAI client implementation (GPT-4, GPT-3.5)."""
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


class OpenAIClient(LLMClient):
    """OpenAI API client supporting GPT-4, GPT-3.5-turbo, etc.

    Supports both OpenAI's official API and OpenAI-compatible endpoints.
    """

    DEFAULT_MODEL = "gpt-4o"
    DEFAULT_BASE_URL = "https://api.openai.com/v1"

    # Model mapping for different capabilities
    MODELS = {
        "gpt-4": {"max_tokens": 8192},
        "gpt-4-turbo": {"max_tokens": 128000},
        "gpt-4o": {"max_tokens": 128000},
        "gpt-3.5-turbo": {"max_tokens": 16385},
    }

    def __init__(
        self,
        api_key: str,
        base_url: str | None = None,
        timeout: int = 30,
        max_retries: int = 3,
    ):
        """Initialize OpenAI client.

        Args:
            api_key: OpenAI API key
            base_url: Optional base URL for compatible APIs
            timeout: Request timeout (default 30s)
            max_retries: Max retry attempts (default 3)
        """
        super().__init__(api_key, base_url, timeout, max_retries)
        self.base_url = base_url or self.DEFAULT_BASE_URL
        self._client = None

    def get_provider(self) -> LLMProvider:
        return LLMProvider.OPENAI

    def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
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
        """Generate completion using OpenAI API.

        Args:
            prompt: User message
            model: Model name (default: gpt-4o)
            temperature: Sampling temperature (0-2)
            max_tokens: Max tokens to generate
            system_prompt: Optional system message

        Returns:
            LLMResponse with generated content

        Raises:
            LLMError: On API errors
            RateLimitError: On rate limit
            AuthenticationError: On auth failure
        """
        model = model or self.DEFAULT_MODEL
        temperature = temperature if temperature is not None else self.DEFAULT_TEMPERATURE
        max_tokens = max_tokens or self.DEFAULT_MAX_TOKENS

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        try:
            client = self._get_client()
            response = await client.post("/chat/completions", json=payload)

            if response.status_code == 401:
                raise AuthenticationError("Invalid OpenAI API key")
            elif response.status_code == 429:
                raise RateLimitError("OpenAI rate limit exceeded")
            elif response.status_code >= 400:
                error_text = response.text
                logger.error(f"OpenAI API error: {response.status_code} - {error_text}")
                raise LLMError(f"OpenAI API error: {response.status_code}")

            data = response.json()

            return LLMResponse(
                content=data["choices"][0]["message"]["content"],
                model=data.get("model", model),
                usage=data.get("usage", {}),
                raw_response=data,
            )

        except httpx.HTTPError as e:
            logger.error(f"OpenAI HTTP error: {e}")
            raise LLMError(f"HTTP error: {e}") from e

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None