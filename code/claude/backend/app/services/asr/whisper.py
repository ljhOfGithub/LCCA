"""Whisper API client implementation."""
import logging
from typing import BinaryIO

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.services.asr.base import ASRClient, ASRResult

logger = logging.getLogger(__name__)


class WhisperClient(ASRClient):
    """Whisper API client.

    Supports OpenAI's Whisper API and compatible endpoints (LocalAI, etc.)
    """

    DEFAULT_BASE_URL = "https://api.openai.com/v1"

    def __init__(
        self,
        api_key: str,
        base_url: str | None = None,
        timeout: int = 60,
        max_retries: int = 3,
    ):
        """Initialize Whisper client.

        Args:
            api_key: OpenAI API key
            base_url: Optional base URL for compatible APIs
            timeout: Request timeout (default 60s, audio processing is slower)
            max_retries: Max retry attempts (default 3)
        """
        super().__init__(api_key, base_url, timeout, max_retries)
        self.base_url = base_url or self.DEFAULT_BASE_URL
        self._client = None

    def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                },
                timeout=httpx.Timeout(self.timeout),
            )
        return self._client

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        reraise=True,
    )
    async def transcribe(
        self,
        audio_url: str,
        language: str = "en",
    ) -> str:
        """Transcribe audio using Whisper API.

        Args:
            audio_url: URL to the audio file (must be publicly accessible)
            language: Language code (ISO 639-1)

        Returns:
            Transcribed text

        Raises:
            Exception: On transcription errors
        """
        try:
            client = self._get_client()

            # Whisper API accepts URL or multipart file upload
            # For URL-based transcription:
            payload = {
                "model": "whisper-1",
                "language": language,
                "response_format": "verbose_json",
            }

            # If audio_url is actually a file path or needs upload
            if audio_url.startswith("http"):
                payload["url"] = audio_url
                response = await client.post(
                    "/audio/transcriptions",
                    json=payload,
                )
            else:
                # Local file upload
                with open(audio_url, "rb") as f:
                    files = {"file": (audio_url, f, "audio/mpeg")}
                    response = await client.post(
                        "/audio/transcriptions",
                        data=payload,
                        files=files,
                    )

            if response.status_code >= 400:
                error_text = response.text
                logger.error(f"Whisper API error: {response.status_code} - {error_text}")
                raise Exception(f"Whisper API error: {response.status_code}")

            data = response.json()
            return data.get("text", "")

        except httpx.HTTPError as e:
            logger.error(f"Whisper HTTP error: {e}")
            raise Exception(f"HTTP error: {e}") from e

    async def transcribe_with_timestamps(
        self,
        audio_url: str,
        language: str = "en",
    ) -> ASRResult:
        """Transcribe with word-level timestamps.

        Args:
            audio_url: URL to the audio file
            language: Language code

        Returns:
            ASRResult with detailed timing info
        """
        try:
            client = self._get_client()

            payload = {
                "model": "whisper-1",
                "language": language,
                "response_format": "verbose_json",
                "timestamp_granularities[]": "word",
            }

            if audio_url.startswith("http"):
                payload["url"] = audio_url
                response = await client.post(
                    "/audio/transcriptions",
                    json=payload,
                )
            else:
                with open(audio_url, "rb") as f:
                    files = {"file": (audio_url, f, "audio/mpeg")}
                    response = await client.post(
                        "/audio/transcriptions",
                        data=payload,
                        files=files,
                    )

            if response.status_code >= 400:
                raise Exception(f"Whisper API error: {response.status_code}")

            data = response.json()

            return ASRResult(
                text=data.get("text", ""),
                language=data.get("language"),
                duration=data.get("duration"),
                raw_result=data,
            )

        except httpx.HTTPError as e:
            logger.error(f"Whisper HTTP error: {e}")
            raise Exception(f"HTTP error: {e}") from e

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None