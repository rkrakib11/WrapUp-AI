from functools import lru_cache
from pathlib import Path

from pydantic import AnyHttpUrl, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Resolve .env relative to the project root, not the process CWD.
# Systemd starts uvicorn with WorkingDirectory=/ by default, which means
# a relative env_file=".env" silently resolves to /.env and finds nothing.
# Anchor here to backend/core/config.py → backend/ → project root (parent.parent.parent).
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.exists() else ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "WrapUp AI Backend"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_log_level: str = "INFO"
    cors_allow_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:4173,http://127.0.0.1:4173,"
        "http://localhost:8080,http://localhost:8081,http://localhost:8082,http://localhost:8083,"
        "http://127.0.0.1:8080,http://127.0.0.1:8081,http://127.0.0.1:8082,http://127.0.0.1:8083"
    )
    worker_concurrency: int = 2
    worker_poll_interval_seconds: float = 0.25
    job_retry_backoff_seconds: float = 5.0
    max_job_retries: int = 3
    http_timeout_seconds: float = 60.0
    deepgram_timeout_seconds: float = 3600.0

    supabase_url: AnyHttpUrl
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str | None = None

    deepgram_api_key: str
    # Optional extra Deepgram keys (comma-separated). If the primary key
    # hits a rate-limit or auth error, the next key is tried automatically.
    # Example: DEEPGRAM_API_KEYS_EXTRA=key2,key3
    deepgram_api_keys_extra: str = ""
    deepgram_model: str = "nova-3"
    deepgram_recovery_languages: str = "bn,hi,ar,en"
    deepgram_recovery_max_candidates: int = 4
    groq_api_key: str
    # Optional extra Groq keys (comma-separated). Rotated on rate-limit/auth errors.
    # Example: GROQ_API_KEYS_EXTRA=gsk_key2,gsk_key3
    groq_api_keys_extra: str = ""
    groq_model_summary: str = "llama-3.3-70b-versatile"
    groq_model_chat: str = "llama-3.1-8b-instant"

    stripe_secret_key: str
    stripe_webhook_secret: str
    stripe_price_plus: str
    stripe_price_business: str

    embedding_model: str = "intfloat/multilingual-e5-base"
    enable_transformer_embeddings: bool = True
    rag_top_k: int = 4
    rag_chunk_size: int = 900
    rag_chunk_overlap: int = 150
    language_detection_confidence_threshold: float = 0.85
    language_dominance_threshold: float = 0.80
    language_validation_max_retries: int = 2

    # ------------------------------------------------------------------
    # Hybrid speaker diarization (pyannote.audio)
    # ------------------------------------------------------------------
    # HuggingFace token with access to pyannote/speaker-diarization-3.1.
    # Leave empty to fall back to Deepgram's built-in diarization.
    pyannote_auth_token: str | None = None
    # Set to False to force Deepgram-only diarization even if pyannote is set.
    diarization_enabled: bool = True
    # Allowed speaker-count range passed to pyannote (1–20 supported).
    diarization_min_speakers: int = 1
    diarization_max_speakers: int = 20
    # Consecutive same-speaker turns separated by ≤ this gap (seconds) are merged.
    diarization_merge_gap: float = 0.5
    # Segments shorter than this (seconds) with < 5 words are dropped.
    diarization_min_segment_duration: float = 0.3

    # ------------------------------------------------------------------
    # Whisper fallback transcription (faster-whisper, runs locally)
    # ------------------------------------------------------------------
    # Set to False to disable Whisper fallback entirely.
    whisper_fallback_enabled: bool = True
    # Whisper model size: tiny / base / small / medium / large-v2 / large-v3
    whisper_model: str = "large-v3"
    # Device: "cpu" or "cuda" (auto-detected to cpu on Mac)
    whisper_device: str = "cpu"
    # CTranslate2 compute type: "int8" (fastest/smallest) or "float32"
    whisper_compute_type: str = "int8"
    # Beam size for decoding (higher = more accurate, slower)
    whisper_beam_size: int = 5
    # Number of candidates at temperature=0 (best_of)
    whisper_best_of: int = 5
    # If Deepgram avg word confidence is below this, run Whisper as well
    # and pick the better result.
    whisper_confidence_threshold: float = 0.80

    # ------------------------------------------------------------------
    # Groq Whisper cloud transcription (replaces local Whisper fallback)
    # ------------------------------------------------------------------
    # Groq Whisper model: "whisper-large-v3-turbo" (fast) or "whisper-large-v3"
    groq_whisper_model: str = "whisper-large-v3-turbo"
    # Max audio chunk duration in seconds (Groq 25 MB limit → ~10 min at 128 kbps)
    groq_whisper_chunk_duration_seconds: int = 600
    # Max parallel Groq Whisper requests (respect rate limits)
    groq_whisper_max_parallel: int = 4
    # Timeout for a single Groq Whisper transcription request
    groq_whisper_timeout_seconds: float = 300.0

    # ------------------------------------------------------------------
    # Audio preprocessing
    # ------------------------------------------------------------------
    # Preprocess audio before sending to Whisper (normalise + denoise).
    # Deepgram handles raw audio natively so preprocessing is Whisper-only.
    audio_preprocessing_enabled: bool = True

    # ------------------------------------------------------------------
    # Video → Audio extraction (ffmpeg)
    # ------------------------------------------------------------------
    # Extract audio from video files before transcription to reduce size.
    video_audio_extraction_enabled: bool = True
    # Target audio codec for extraction (aac is fast, opus is smaller).
    video_audio_codec: str = "libopus"
    # Target audio bitrate for extraction.
    video_audio_bitrate: str = "64k"

    # ------------------------------------------------------------------
    # S3-compatible object storage (Cloudflare R2 or Backblaze B2)
    # ------------------------------------------------------------------
    r2_account_id: str | None = None  # R2 only — not needed for B2
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket_name: str | None = None
    # Explicit endpoint URL — required for B2, auto-constructed for R2.
    # B2 example: https://s3.us-east-005.backblazeb2.com
    r2_endpoint_url: str | None = None
    # Optional public custom domain for download URLs.
    r2_public_domain: str | None = None

    data_dir: Path = Field(default=Path("backend/data"))
    faiss_dir_name: str = "faiss"
    summary_temperature: float = 0.2
    chat_temperature: float = 0.1

    @property
    def cors_origins_list(self) -> list[str]:
        return [item.strip() for item in self.cors_allow_origins.split(",") if item.strip()]

    @property
    def deepgram_api_key_list(self) -> list[str]:
        """All Deepgram API keys: primary first, then any extras."""
        keys = [self.deepgram_api_key]
        if self.deepgram_api_keys_extra:
            keys.extend(k.strip() for k in self.deepgram_api_keys_extra.split(",") if k.strip())
        return keys

    @property
    def groq_api_key_list(self) -> list[str]:
        """All Groq API keys: primary first, then any extras."""
        keys = [self.groq_api_key]
        if self.groq_api_keys_extra:
            keys.extend(k.strip() for k in self.groq_api_keys_extra.split(",") if k.strip())
        return keys

    @model_validator(mode="after")
    def validate_non_empty(self) -> "Settings":
        required_values = {
            "SUPABASE_URL": str(self.supabase_url),
            "SUPABASE_ANON_KEY": self.supabase_anon_key,
            "SUPABASE_SERVICE_ROLE_KEY": self.supabase_service_role_key,
            "DEEPGRAM_API_KEY": self.deepgram_api_key,
            "GROQ_API_KEY": self.groq_api_key,
            "STRIPE_SECRET_KEY": self.stripe_secret_key,
            "STRIPE_WEBHOOK_SECRET": self.stripe_webhook_secret,
            "STRIPE_PRICE_PLUS": self.stripe_price_plus,
            "STRIPE_PRICE_BUSINESS": self.stripe_price_business,
        }
        empty_keys = [name for name, value in required_values.items() if not value or not value.strip()]
        if empty_keys:
            missing = ", ".join(empty_keys)
            raise ValueError(f"Missing required environment variables: {missing}")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
