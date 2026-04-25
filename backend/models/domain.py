from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, List


class JobState(str, Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


@dataclass
class UserContext:
    id: str
    email: str | None = None
    access_token: str | None = None


@dataclass
class ProcessingJob:
    job_id: str
    session_id: str
    user_id: str
    status: JobState = JobState.queued
    progress: int = 0
    message: str = "Queued"
    retries: int = 0
    error: str | None = None
    # "upload" — full transcription chain (Deepgram/Groq/Whisper) + summary.
    # "live"   — transcript already populated by the live WS endpoint, so
    #            skip transcription, run summary + RAG + analytics only.
    kind: str = "upload"
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class TranscriptSegment:
    speaker: str
    text: str
    start: float
    end: float


@dataclass
class TranscriptionResult:
    transcript_text: str
    language: str
    language_confidence: float | None
    segments: list[TranscriptSegment]
    raw_response: dict[str, Any]
    # Word-level tokens with per-word timestamps, used by the hybrid
    # diarization aligner.  Each entry mirrors Deepgram's word object:
    # {"word": str, "punctuated_word": str, "start": float, "end": float, ...}
    raw_words: List[dict[str, Any]] = field(default_factory=list)
