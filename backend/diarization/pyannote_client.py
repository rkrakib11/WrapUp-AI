from __future__ import annotations

import asyncio
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from structlog import get_logger

if TYPE_CHECKING:
    from backend.core.config import Settings

logger = get_logger(__name__)


@dataclass
class DiarizationTurn:
    """A single speaker turn produced by pyannote diarization."""

    start: float
    end: float
    speaker: str  # normalized "Speaker 1", "Speaker 2", …


class PyannoteDiarizationService:
    """
    Speaker diarization using pyannote.audio v3.

    Requires:
    - ``pip install pyannote.audio``
    - PYANNOTE_AUTH_TOKEN env var (free HuggingFace token)
    - Accept model terms at https://hf.co/pyannote/speaker-diarization-3.1
    """

    _MODEL_ID = "pyannote/speaker-diarization-3.1"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._pipeline = None  # loaded lazily on first use

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def is_available(self) -> bool:
        """Return True only when pyannote is installed *and* a token is set."""
        if not self.settings.pyannote_auth_token:
            return False
        try:
            import pyannote.audio  # noqa: F401
            return True
        except ImportError:
            return False

    async def diarize_url(
        self,
        url: str,
        *,
        suffix: str = ".wav",
    ) -> list[DiarizationTurn]:
        """Download audio from *url* and run diarization."""
        import httpx

        timeout = httpx.Timeout(timeout=600.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url)
            response.raise_for_status()
            audio_bytes = response.content

        return await self.diarize_bytes(audio_bytes, suffix=suffix)

    async def diarize_bytes(
        self,
        audio_bytes: bytes,
        *,
        suffix: str = ".wav",
    ) -> list[DiarizationTurn]:
        """Write *audio_bytes* to a temp file, run diarization, clean up."""
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = Path(tmp.name)
        try:
            return await self.diarize_file(tmp_path)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    async def diarize_file(self, audio_path: Path) -> list[DiarizationTurn]:
        """Run diarization on a local audio file (non-blocking)."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._diarize_sync, audio_path)

    # ------------------------------------------------------------------
    # Internal synchronous work (runs in thread-pool executor)
    # ------------------------------------------------------------------

    def _load_pipeline(self):
        if self._pipeline is not None:
            return self._pipeline

        try:
            from pyannote.audio import Pipeline
        except ImportError as exc:
            raise RuntimeError(
                "pyannote.audio is not installed. "
                "Run: pip install pyannote.audio"
            ) from exc

        token = self.settings.pyannote_auth_token
        if not token:
            raise RuntimeError(
                "PYANNOTE_AUTH_TOKEN is not set. "
                "Obtain a free token at https://hf.co/settings/tokens and "
                "accept the model terms at https://hf.co/pyannote/speaker-diarization-3.1"
            )

        logger.info("loading_pyannote_pipeline", model=self._MODEL_ID)
        import torch

        # pyannote.audio v4 renamed `use_auth_token` -> `token`. Try the new
        # name first (what Oracle has), fall back to the v3.x kwarg if the
        # installed version still uses it. Without this branch, v4 raises:
        #   Pipeline.from_pretrained() got an unexpected keyword argument 'use_auth_token'
        # which silently disables hybrid diarization AND triggers a costly
        # Deepgram-with-diarize fallback + 4-language recovery loop, adding
        # ~10s per upload.
        try:
            pipeline = Pipeline.from_pretrained(self._MODEL_ID, token=token)
        except TypeError:
            pipeline = Pipeline.from_pretrained(self._MODEL_ID, use_auth_token=token)
        if torch.cuda.is_available():
            pipeline.to(torch.device("cuda"))
            logger.info("pyannote_on_gpu")
        else:
            logger.info("pyannote_on_cpu")

        self._pipeline = pipeline
        return pipeline

    def _diarize_sync(self, audio_path: Path) -> list[DiarizationTurn]:
        pipeline = self._load_pipeline()

        min_spk = max(1, self.settings.diarization_min_speakers)
        max_spk = max(min_spk, self.settings.diarization_max_speakers)

        kwargs: dict = {}
        # Only pass speaker hints if user narrowed the range
        if min_spk > 1:
            kwargs["min_speakers"] = min_spk
        if max_spk < 20:
            kwargs["max_speakers"] = max_spk

        logger.info(
            "pyannote_diarization_start",
            path=str(audio_path),
            min_speakers=min_spk,
            max_speakers=max_spk,
        )

        annotation = pipeline(str(audio_path), **kwargs)

        # Collect and sort all raw turns
        raw_turns: list[tuple[float, float, str]] = []
        for turn, _, label in annotation.itertracks(yield_label=True):
            raw_turns.append((float(turn.start), float(turn.end), label))
        raw_turns.sort(key=lambda x: x[0])

        # Normalize labels to "Speaker N" in first-appearance order
        label_map: dict[str, str] = {}
        normalized: list[DiarizationTurn] = []
        for start, end, label in raw_turns:
            if label not in label_map:
                label_map[label] = f"Speaker {len(label_map) + 1}"
            normalized.append(
                DiarizationTurn(
                    start=round(start, 3),
                    end=round(end, 3),
                    speaker=label_map[label],
                )
            )

        # Merge adjacent same-speaker turns within gap threshold
        merged = _merge_turns(
            normalized,
            gap_threshold=self.settings.diarization_merge_gap,
        )

        logger.info(
            "pyannote_diarization_complete",
            raw_turns=len(raw_turns),
            merged_turns=len(merged),
            speaker_count=len(label_map),
            speakers=list(label_map.values()),
        )
        return merged


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _merge_turns(
    turns: list[DiarizationTurn],
    gap_threshold: float = 0.5,
) -> list[DiarizationTurn]:
    """Merge consecutive same-speaker turns whose gap is ≤ *gap_threshold*."""
    if not turns:
        return []
    merged = [turns[0]]
    for turn in turns[1:]:
        prev = merged[-1]
        if turn.speaker == prev.speaker and (turn.start - prev.end) <= gap_threshold:
            merged[-1] = DiarizationTurn(
                start=prev.start,
                end=max(prev.end, turn.end),
                speaker=prev.speaker,
            )
        else:
            merged.append(turn)
    return merged
