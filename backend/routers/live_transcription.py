"""WebSocket live transcription router.

Accepts raw PCM (linear16, 16 kHz mono) frames from the browser, relays them
to Deepgram's streaming API, and forwards transcript events back to the
browser in real time. On client-side `stop`, persists the accumulated
transcript to Supabase and enqueues the normal post-processing pipeline
(diarization, summary, RAG, analytics) via the same job queue that upload
uses.

Safety: every external call is wrapped in try/except — a Deepgram error
must not kill the browser connection or the server worker.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import os
import tempfile
import wave
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from structlog import get_logger

from backend.core.config import get_settings
from backend.models.domain import UserContext
from backend.routers.deps import get_container
from backend.services.container import ServiceContainer
from backend.services.groq_client import whisper_primer_for

logger = get_logger(__name__)

router = APIRouter(tags=["live"])

_DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"

# After this many consecutive empty / very-low-confidence finals we treat
# the Deepgram stream as failed and flip to Groq batch on the spooled audio
# when the client stops.
_EMPTY_FINALS_THRESHOLD = 10


async def _verify_user(token: str) -> UserContext | None:
    if not token:
        return None
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_anon_key,
                },
            )
        if response.status_code != 200:
            return None
        data = response.json()
        return UserContext(id=data["id"], email=data.get("email"), access_token=token)
    except Exception as exc:
        logger.warning("live_ws_auth_failed", error=str(exc))
        return None


def _deepgram_model_for_language(lang: str | None) -> str:
    """Deepgram model routing for streaming.

    `nova-3` is English-first; for non-English we use `nova-2` which has
    broader language coverage. (Note: the batch pipeline skips Deepgram
    entirely for non-English — this is the streaming-only compromise.)
    """
    norm = (lang or "").lower().split("-")[0]
    if not norm or norm == "en":
        return "nova-3"
    return "nova-2"


def _build_deepgram_url(settings, lang: str | None) -> str:
    params = {
        "model": _deepgram_model_for_language(lang),
        "encoding": "linear16",
        "sample_rate": "16000",
        "channels": "1",
        "interim_results": "true",
        "punctuate": "true",
        "smart_format": "true",
        "diarize": "false",
    }
    if lang:
        norm = lang.lower().split("-")[0]
        if norm and norm != "und":
            params["language"] = norm
    return f"{_DEEPGRAM_WS_URL}?{urlencode(params)}"


def _save_raw_pcm_as_wav(raw_pcm_path: Path, wav_path: Path) -> None:
    """Wrap raw 16 kHz mono PCM s16le bytes in a WAV container."""
    with open(raw_pcm_path, "rb") as rf:
        pcm = rf.read()
    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(pcm)


@router.websocket("/ws/live-transcription/{session_id}")
async def live_transcription(websocket: WebSocket, session_id: str) -> None:
    """Stream PCM → Deepgram → client, persist on stop, then enqueue post-processing."""
    await websocket.accept()

    token = websocket.query_params.get("token", "")
    lang = (websocket.query_params.get("lang") or "").strip() or None

    user = await _verify_user(token)
    if user is None:
        await websocket.send_json({"type": "error", "message": "Authentication failed"})
        await websocket.close(code=4401)
        return

    container: ServiceContainer = get_container(websocket)
    session = await container.db.get_session_for_user(session_id, access_token=user.access_token or "")
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close(code=4404)
        return

    settings = get_settings()
    if not settings.deepgram_api_key:
        await websocket.send_json(
            {"type": "error", "message": "Deepgram streaming not configured on this server"}
        )
        await websocket.close(code=4500)
        return

    deepgram_url = _build_deepgram_url(settings, lang)
    deepgram_headers = [("Authorization", f"Token {settings.deepgram_api_key}")]

    # Spool file: every PCM byte the browser sends is appended here. If the
    # Deepgram stream returns garbage on non-English audio, we re-transcribe
    # via Groq Whisper batch against this spool file on stop.
    spool_fd, spool_path_str = tempfile.mkstemp(suffix=".pcm", prefix=f"live_{session_id}_")
    os.close(spool_fd)
    spool_path = Path(spool_path_str)

    final_transcript_parts: list[str] = []
    consecutive_empty_finals = 0
    deepgram_degraded = False
    stop_requested = False

    try:
        dg_ws = await websockets.connect(  # type: ignore[attr-defined]
            deepgram_url,
            additional_headers=deepgram_headers,
            open_timeout=10,
            ping_interval=5,
            ping_timeout=20,
        )
    except TypeError:
        # Older websockets versions use `extra_headers` instead of `additional_headers`.
        dg_ws = await websockets.connect(  # type: ignore[attr-defined]
            deepgram_url,
            extra_headers=deepgram_headers,
            open_timeout=10,
            ping_interval=5,
            ping_timeout=20,
        )
    except Exception as exc:
        logger.warning("live_ws_deepgram_connect_failed", error=str(exc), session_id=session_id)
        await websocket.send_json({"type": "error", "message": f"Deepgram connect failed: {exc}"})
        await websocket.close(code=4500)
        spool_path.unlink(missing_ok=True)
        return

    async def pump_deepgram_to_client() -> None:
        nonlocal consecutive_empty_finals, deepgram_degraded
        try:
            async for message in dg_ws:
                try:
                    event = json.loads(message)
                except json.JSONDecodeError:
                    continue
                if event.get("type") != "Results":
                    continue
                alt = (
                    event.get("channel", {})
                    .get("alternatives", [{}])[0]
                )
                text = (alt.get("transcript") or "").strip()
                is_final = bool(event.get("is_final"))
                confidence = float(alt.get("confidence") or 0.0)

                if is_final:
                    if text:
                        final_transcript_parts.append(text)
                        consecutive_empty_finals = 0
                    else:
                        consecutive_empty_finals += 1
                        if (
                            consecutive_empty_finals >= _EMPTY_FINALS_THRESHOLD
                            and not deepgram_degraded
                        ):
                            deepgram_degraded = True
                            logger.warning(
                                "live_ws_deepgram_degraded",
                                session_id=session_id,
                                consecutive_empty_finals=consecutive_empty_finals,
                                lang=lang,
                            )
                            with contextlib.suppress(Exception):
                                await websocket.send_json({
                                    "type": "warning",
                                    "message": (
                                        "Live transcription is returning empty results — "
                                        "we'll re-transcribe with Whisper when you stop."
                                    ),
                                })

                with contextlib.suppress(Exception):
                    await websocket.send_json({
                        "type": "transcript",
                        "text": text,
                        "is_final": is_final,
                        "confidence": confidence,
                    })
        except websockets.ConnectionClosed:
            pass
        except Exception as exc:
            logger.warning("live_ws_deepgram_pump_error", error=str(exc), session_id=session_id)

    pump_task = asyncio.create_task(pump_deepgram_to_client())

    # Spool writer runs in a thread pool to avoid blocking the event loop
    # on disk writes. Keep an open file handle for the session's lifetime.
    loop = asyncio.get_running_loop()
    spool_file = open(spool_path, "ab", buffering=0)

    def _write_spool(chunk: bytes) -> None:
        spool_file.write(chunk)

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if "bytes" in message and message["bytes"] is not None:
                chunk: bytes = message["bytes"]
                if chunk:
                    await loop.run_in_executor(None, _write_spool, chunk)
                    try:
                        await dg_ws.send(chunk)
                    except Exception as exc:
                        logger.warning(
                            "live_ws_deepgram_send_error",
                            error=str(exc),
                            session_id=session_id,
                        )
            elif "text" in message and message["text"]:
                try:
                    control = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue
                if control.get("type") == "stop":
                    stop_requested = True
                    break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("live_ws_receive_error", error=str(exc), session_id=session_id)
    finally:
        with contextlib.suppress(Exception):
            spool_file.close()
        # Tell Deepgram the stream is done so it emits any final results.
        with contextlib.suppress(Exception):
            await dg_ws.send(json.dumps({"type": "CloseStream"}))
        # Give Deepgram ~2s to flush pending finals.
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(pump_task, timeout=2.0)
        pump_task.cancel()
        with contextlib.suppress(Exception):
            await dg_ws.close()

    accumulated = " ".join(final_transcript_parts).strip()

    # Fallback: Deepgram was degraded OR returned empty — re-transcribe the
    # spooled audio via Groq Whisper batch. Runs the same denoise + primer
    # path that uploads use.
    used_groq_fallback = False
    if (deepgram_degraded or not accumulated) and spool_path.stat().st_size > 0:
        wav_path: Path | None = None
        try:
            wav_fd, wav_path_str = tempfile.mkstemp(suffix=".wav", prefix=f"live_{session_id}_")
            os.close(wav_fd)
            wav_path = Path(wav_path_str)
            await loop.run_in_executor(None, _save_raw_pcm_as_wav, spool_path, wav_path)

            if container.groq_client is not None:
                prompt = whisper_primer_for(lang)
                model = "whisper-large-v3" if (lang and lang.lower().split("-")[0] not in ("en", "")) else None
                result = await container.groq_client.transcribe_audio(
                    wav_path, language=lang, model=model, prompt=prompt,
                )
                groq_text = (result.get("text") or "").strip()
                if groq_text:
                    accumulated = groq_text
                    used_groq_fallback = True
                    logger.info(
                        "live_ws_groq_fallback_used",
                        session_id=session_id,
                        chars=len(groq_text),
                    )
        except Exception as exc:
            logger.warning("live_ws_groq_fallback_failed", error=str(exc), session_id=session_id)
        finally:
            if wav_path is not None:
                with contextlib.suppress(Exception):
                    wav_path.unlink(missing_ok=True)

    # Persist transcript and kick off the normal post-processing pipeline.
    try:
        await container.db.update_session(
            session_id,
            {
                "transcript": accumulated,
                "language_detected": (lang or "und"),
            },
        )
        if accumulated:
            await container.jobs.enqueue(session_id=session_id, user_id=user.id)
    except Exception as exc:
        logger.exception("live_ws_persist_or_enqueue_failed", session_id=session_id, error=str(exc))

    # Clean up spool file unconditionally.
    with contextlib.suppress(Exception):
        spool_path.unlink(missing_ok=True)

    if stop_requested:
        with contextlib.suppress(Exception):
            await websocket.send_json({
                "type": "done",
                "session_id": session_id,
                "transcript": accumulated,
                "used_groq_fallback": used_groq_fallback,
            })
        with contextlib.suppress(Exception):
            await websocket.close()
