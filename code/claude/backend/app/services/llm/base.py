"""LLM Client base interface and common types."""
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

logger = logging.getLogger(__name__)


class LLMProvider(str, Enum):
    """Supported LLM providers."""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    MINIMAX = "minimax"
    ZHIPU = "zhipu"


@dataclass
class LLMResponse:
    """Response from LLM API."""
    content: str
    model: str
    usage: dict = field(default_factory=dict)
    raw_response: Any = None


class LLMError(Exception):
    """Base exception for LLM errors."""
    pass


class RateLimitError(LLMError):
    """Rate limit exceeded."""
    pass


class AuthenticationError(LLMError):
    """Authentication failed (invalid API key)."""
    pass


class LLMClient(ABC):
    """Abstract base class for LLM clients.

    All LLM providers must implement the complete() method.
    This class provides common retry logic and error handling.

    Usage:
        client = OpenAIClient(api_key="...")
        response = await client.complete(
            prompt="Hello, world!",
            model="gpt-4",
            temperature=0.7,
            max_tokens=2000,
        )
    """

    DEFAULT_TIMEOUT: int = 30  # seconds
    DEFAULT_MAX_RETRIES: int = 3
    DEFAULT_TEMPERATURE: float = 0.7
    DEFAULT_MAX_TOKENS: int = 2000

    def __init__(
        self,
        api_key: str,
        base_url: str | None = None,
        timeout: int = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ):
        """Initialize LLM client.

        Args:
            api_key: API key for the provider
            base_url: Optional base URL (for OpenAI-compatible APIs)
            timeout: Request timeout in seconds (default 30)
            max_retries: Maximum retry attempts (default 3)
        """
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self.max_retries = max_retries
        self._client = None

    @abstractmethod
    async def complete(
        self,
        prompt: str,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        system_prompt: str | None = None,
    ) -> LLMResponse:
        """Generate completion from LLM.

        Args:
            prompt: User prompt / input
            model: Model to use (provider-specific)
            temperature: Sampling temperature (0-2)
            max_tokens: Maximum tokens to generate
            system_prompt: Optional system prompt

        Returns:
            LLMResponse with content and metadata

        Raises:
            LLMError: On API errors
            RateLimitError: On rate limit
            AuthenticationError: On auth failure
        """
        pass

    @abstractmethod
    def get_provider(self) -> LLMProvider:
        """Get the provider type."""
        pass

    def _log_retry(self, attempt: int, exception: Exception) -> None:
        """Log retry attempt."""
        logger.warning(
            f"LLM request failed (attempt {attempt}/{self.max_retries}): {exception}"
        )

    def _create_retry_decorator(self):
        """Create retry decorator with exponential backoff."""
        return retry(
            stop=stop_after_attempt(self.max_retries),
            wait=wait_exponential(multiplier=1, min=1, max=10),
            retry=retry_if_exception_type((RateLimitError, LLMError)),
            before_sleep=lambda retry_state: self._log_retry(
                retry_state.attempt_number,
                retry_state.outcome.exception()
            ),
        )

    async def close(self):
        """Close the HTTP client."""
        if self._client and hasattr(self._client, "aclose"):
            await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()