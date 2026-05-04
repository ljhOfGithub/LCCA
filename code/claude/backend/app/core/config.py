from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://lcca_user:lcca_password@postgres:5432/lcca_exam"
    sync_database_url: str = "postgresql://lcca_user:lcca_password@postgres:5432/lcca_exam"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # S3/MinIO
    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "lcca-artifacts"
    s3_region: str = "us-east-1"

    # App
    app_name: str = "LCCA Exam System"
    debug: bool = False
    secret_key: str = "change-me-in-production"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # LLM API
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o"

    # ASR API
    asr_api_key: str = ""
    asr_api_url: str = "https://api.example.com/asr"

    # Frontend URL (for CORS)
    frontend_url: str = "http://localhost:3000"

    # Timeouts
    attempt_timeout_seconds: int = 7200  # 2 hours
    scoring_timeout_seconds: int = 600  # 10 minutes (for LLM scoring)

    # Scoring retry configuration
    scoring_max_retries: int = 3
    scoring_retry_delay_seconds: int = 30  # Exponential backoff


settings = Settings()