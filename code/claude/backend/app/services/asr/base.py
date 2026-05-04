"""ASR client base interface."""
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ASRResult:
    """Result from ASR transcription."""
    text: str
    language: str | None = None
    confidence: float | None = None
    duration: float | None = None  # audio duration in seconds
    raw_result: dict[str, Any] = field(default_factory=dict)


class ASRClient(ABC):
    """Abstract base class for ASR clients.

    All ASR providers must implement the transcribe() method.
    """

    DEFAULT_TIMEOUT: int = 60  # seconds for ASR (longer than LLM)
    DEFAULT_MAX_RETRIES: int = 3

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: int = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ):
        """Initialize ASR client.

        Args:
            api_key: API key for the provider
            base_url: Optional base URL
            timeout: Request timeout in seconds
            max_retries: Maximum retry attempts
        """
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self.max_retries = max_retries
        self._client = None

    @abstractmethod
    async def transcribe(
        self,
        audio_url: str,
        language: str = "en",
    ) -> str:
        """Transcribe audio to text.

        Args:
            audio_url: URL or path to the audio file
            language: Language code (ISO 639-1, e.g., "en", "zh")

        Returns:
            Transcribed text

        Raises:
            Exception: On transcription errors
        """
        pass

    async def close(self):
        """Close the HTTP client."""
        if self._client and hasattr(self._client, "aclose"):
            await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()