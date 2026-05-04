"""ZhipuAI (智谱AI) client implementation."""
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


class ZhipuClient(LLMClient):
    """ZhipuAI API client.

    智谱AI is a Chinese LLM provider (GLM series).
    API docs: https://open.bigmodel.cn/dev/api
    """

    DEFAULT_MODEL = "glm-4-flash"
    DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4"

    def __init__(
        self,
        api_key: str,
        base_url: str | None = None,
        timeout: int = 30,
        max_retries: int = 3,
    ):
        """Initialize ZhipuAI client.

        Args:
            api_key: ZhipuAI API key
            base_url: Optional base URL
            timeout: Request timeout (default 30s)
            max_retries: Max retry attempts (default 3)
        """
        super().__init__(api_key, base_url, timeout, max_retries)
        self.base_url = base_url or self.DEFAULT_BASE_URL
        self._client = None

    def get_provider(self) -> LLMProvider:
        return LLMProvider.ZHIPU

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
        """Generate completion using ZhipuAI API.

        Args:
            prompt: User message
            model: Model name (default: glm-4-flash)
            temperature: Sampling temperature (0-1)
            max_tokens: Max tokens to generate
            system_prompt: Optional system prompt

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
                raise AuthenticationError("Invalid ZhipuAI API key")
            elif response.status_code == 429:
                raise RateLimitError("ZhipuAI rate limit exceeded")
            elif response.status_code >= 400:
                error_text = response.text
                logger.error(f"ZhipuAI API error: {response.status_code} - {error_text}")
                raise LLMError(f"ZhipuAI API error: {response.status_code}")

            data = response.json()

            return LLMResponse(
                content=data["choices"][0]["message"]["content"],
                model=data.get("model", model),
                usage=data.get("usage", {}),
                raw_response=data,
            )

        except httpx.HTTPError as e:
            logger.error(f"ZhipuAI HTTP error: {e}")
            raise LLMError(f"HTTP error: {e}") from e

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None