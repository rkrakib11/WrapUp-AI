"""Audio utilities: video→audio extraction, chunking for Groq Whisper API.

Uses ffmpeg for all media operations. ffmpeg must be installed on the system.
"""
from __future__ import annotations

import asyncio
import math
import os
import subprocess
import tempfile
from pathlib import Path

from structlog import get_logger

logger = get_logger(__name__)


def is_ffmpeg_available() -> bool:
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            timeout=5,
        )
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


async def get_audio_duration(audio_path: Path) -> float:
    """Get duration of an audio/video file in seconds using ffprobe."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _get_duration_sync, audio_path)


def _get_duration_sync(audio_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    duration_str = result.stdout.strip()
    if not duration_str:
        raise RuntimeError(f"ffprobe could not determine duration for {audio_path}")
    return float(duration_str)


async def extract_audio_from_video(
    video_path: Path,
    *,
    codec: str = "libopus",
    bitrate: str = "64k",
) -> Path:
    """Extract audio track from video, returning path to a compressed audio file.

    The caller is responsible for deleting the returned file.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _extract_audio_sync, video_path, codec, bitrate,
    )


def _extract_audio_sync(video_path: Path, codec: str, bitrate: str) -> Path:
    ext = ".ogg" if "opus" in codec else ".m4a" if "aac" in codec else ".wav"
    fd, out_path = tempfile.mkstemp(suffix=ext)
    os.close(fd)

    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vn",                      # drop video stream
        "-ac", "1",                 # mono
        "-ar", "16000",             # 16 kHz (optimal for Whisper)
        "-c:a", codec,
        "-b:a", bitrate,
        out_path,
    ]
    logger.info("ffmpeg_extract_audio", input=str(video_path), output=out_path)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        os.unlink(out_path)
        raise RuntimeError(f"ffmpeg audio extraction failed: {result.stderr[:500]}")

    original_size = video_path.stat().st_size
    extracted_size = Path(out_path).stat().st_size
    logger.info(
        "ffmpeg_extract_audio_done",
        original_mb=round(original_size / 1_048_576, 1),
        extracted_mb=round(extracted_size / 1_048_576, 1),
        reduction=f"{(1 - extracted_size / max(original_size, 1)) * 100:.0f}%",
    )
    return Path(out_path)


async def chunk_audio(
    audio_path: Path,
    chunk_duration_seconds: int = 600,
) -> list[Path]:
    """Split audio into chunks of the given duration. Returns list of chunk paths.

    Each chunk is a self-contained audio file that can be sent to Groq Whisper.
    If the file is small enough for a single request, returns [audio_path] unchanged.
    The caller is responsible for deleting chunk files (but NOT the original).
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _chunk_audio_sync, audio_path, chunk_duration_seconds,
    )


def _chunk_audio_sync(audio_path: Path, chunk_duration_seconds: int) -> list[Path]:
    # Check if file is small enough — Groq limit is 25 MB
    file_size = audio_path.stat().st_size
    if file_size <= 24 * 1_048_576:  # 24 MB safety margin
        return [audio_path]

    duration = _get_duration_sync(audio_path)
    if duration <= 0:
        return [audio_path]

    num_chunks = max(1, math.ceil(duration / chunk_duration_seconds))
    if num_chunks == 1:
        return [audio_path]

    logger.info(
        "ffmpeg_chunking_audio",
        duration_sec=round(duration, 1),
        num_chunks=num_chunks,
        chunk_duration=chunk_duration_seconds,
    )

    chunk_paths: list[Path] = []
    for i in range(num_chunks):
        start = i * chunk_duration_seconds
        fd, chunk_path = tempfile.mkstemp(suffix=".ogg")
        os.close(fd)

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start),
            "-i", str(audio_path),
            "-t", str(chunk_duration_seconds),
            "-vn",
            "-ac", "1",
            "-ar", "16000",
            "-c:a", "libopus",
            "-b:a", "64k",
            chunk_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            # Clean up already-created chunks
            for p in chunk_paths:
                try:
                    os.unlink(p)
                except OSError:
                    pass
            raise RuntimeError(f"ffmpeg chunk {i} failed: {result.stderr[:300]}")
        chunk_paths.append(Path(chunk_path))

    logger.info(
        "ffmpeg_chunking_done",
        num_chunks=len(chunk_paths),
        chunk_sizes_mb=[round(p.stat().st_size / 1_048_576, 2) for p in chunk_paths],
    )
    return chunk_paths


# ffmpeg -af filter chain. Kept intentionally minimal:
#   highpass=f=80   — drop rumble / AC hum below 80 Hz. Cheap, near-zero risk.
#
# What's deliberately NOT here:
#   loudnorm       — compresses dynamic range; shaves soft consonants in
#                    Bengali/Hindi/Arabic and noticeably hurt accuracy on
#                    real user uploads. Whisper handles loudness variation
#                    on its own.
#   afftdn=-25     — too aggressive on non-Latin speech; phoneme-level
#                    artifacts worse than the noise it removes.
#
# If a future experiment shows loudnorm helps, gate it behind a setting
# rather than adding it back to every pipeline.
_WHISPER_CLEAN_FILTER = "highpass=f=80"


async def convert_to_wav_16k(audio_path: Path, *, clean: bool = True) -> Path:
    """Convert any audio file to 16 kHz mono WAV for Groq Whisper compatibility.

    When `clean` is True (default), also applies a denoise + loudness
    normalisation filter chain. Pass `clean=False` to skip the filters when
    the caller already pre-processed the audio (e.g. per-chunk re-conversion).

    Returns the original path if already suitable, or a new temp file.
    The caller is responsible for deleting the returned file if it differs from input.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _convert_wav_sync, audio_path, clean)


def _convert_wav_sync(audio_path: Path, clean: bool = True) -> Path:
    fd, out_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    cmd = [
        "ffmpeg", "-y",
        "-i", str(audio_path),
        "-vn",
    ]
    if clean:
        cmd += ["-af", _WHISPER_CLEAN_FILTER]
    cmd += [
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "pcm_s16le",
        out_path,
    ]
    # afftdn+loudnorm are CPU-heavy — bump timeout from 300s → 600s so long
    # uploads don't fail on Oracle's single-core VM.
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        os.unlink(out_path)
        # If the filter chain itself is the problem (old ffmpeg missing
        # afftdn on some distros), fall back once to an unfiltered conversion.
        if clean:
            logger.warning(
                "ffmpeg_clean_filter_failed_retrying_without",
                error=result.stderr[:200],
            )
            return _convert_wav_sync(audio_path, clean=False)
        raise RuntimeError(f"ffmpeg conversion failed: {result.stderr[:500]}")
    return Path(out_path)
