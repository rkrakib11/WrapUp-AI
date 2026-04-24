from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
from structlog import get_logger

from backend.core.config import Settings

logger = get_logger(__name__)


# One-sentence priming strings passed to Whisper as `prompt`. Whisper uses the
# prompt both as a glossary (spelling/style) and as a language anchor — giving
# it target-language text dramatically reduces language drift on short clips
# and on first-token decisions where it would otherwise default to English.
WHISPER_LANGUAGE_PRIMERS: dict[str, str] = {
    "bn": "এটি একটি বাংলা ভাষার কথোপকথন। বক্তারা বাংলায় কথা বলছেন।",
    "hi": "यह हिंदी भाषा में एक बातचीत है। वक्ता हिंदी में बोल रहे हैं।",
    "ar": "هذه محادثة باللغة العربية. المتحدثون يتكلمون بالعربية.",
    "zh": "这是一段中文普通话对话。说话者在用中文交流。",
    "ur": "یہ اردو زبان میں ایک گفتگو ہے۔ بولنے والے اردو میں بات کر رہے ہیں۔",
    "fa": "این یک مکالمه به زبان فارسی است. گویندگان به فارسی صحبت می‌کنند.",
    "fr": "C'est une conversation en français. Les locuteurs parlent français.",
    "es": "Esta es una conversación en español. Los hablantes hablan español.",
    "de": "Dies ist ein Gespräch auf Deutsch. Die Sprecher sprechen Deutsch.",
    "ja": "これは日本語の会話です。話者は日本語で話しています。",
    "ko": "이것은 한국어 대화입니다. 화자들이 한국어로 말하고 있습니다.",
    "pt": "Esta é uma conversa em português. Os falantes estão falando português.",
    "it": "Questa è una conversazione in italiano. I parlanti parlano italiano.",
    "ru": "Это разговор на русском языке. Говорящие говорят по-русски.",
    "tr": "Bu bir Türkçe konuşmadır. Konuşmacılar Türkçe konuşuyor.",
    "id": "Ini adalah percakapan dalam bahasa Indonesia. Pembicara berbicara dalam bahasa Indonesia.",
    "en": "This is an English language conversation.",
}


def whisper_primer_for(language: str | None) -> str | None:
    if not language:
        return None
    return WHISPER_LANGUAGE_PRIMERS.get(language.lower().split("-")[0])


class GroqClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_url = "https://api.groq.com/openai/v1"

    async def chat_completion(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        temperature: float,
        response_as_json: bool = False,
    ) -> str:
        if not self.settings.groq_api_key:
            raise RuntimeError("GROQ_API_KEY is not configured")
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if response_as_json:
            payload["response_format"] = {"type": "json_object"}

        last_error: Exception | None = None
        for key_idx, api_key in enumerate(self.settings.groq_api_key_list):
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            try:
                async with httpx.AsyncClient(timeout=self.settings.http_timeout_seconds) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        json=payload,
                        headers=headers,
                    )
                response.raise_for_status()
                if key_idx > 0:
                    logger.info("groq_key_rotation_succeeded", endpoint="chat", key_index=key_idx)
                content = response.json()["choices"][0]["message"]["content"]
                return content.strip()
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in (429, 401, 403):
                    logger.warning(
                        "groq_key_failed_rotating",
                        endpoint="chat",
                        key_index=key_idx,
                        status=exc.response.status_code,
                        keys_remaining=len(self.settings.groq_api_key_list) - key_idx - 1,
                    )
                    last_error = exc
                    continue
                raise
        raise last_error or RuntimeError("All Groq API keys exhausted for chat completion")

    # ------------------------------------------------------------------
    # Groq Whisper transcription API
    # ------------------------------------------------------------------

    async def transcribe_audio(
        self,
        audio_path: Path,
        *,
        language: str | None = None,
        model: str | None = None,
        prompt: str | None = None,
    ) -> dict[str, Any]:
        """Transcribe a single audio file via Groq Whisper API.

        Returns the parsed JSON response with keys: text, language, segments, etc.
        File must be ≤ 25 MB. Automatically rotates API keys on rate-limit/auth errors.
        """
        if not self.settings.groq_api_key:
            raise RuntimeError("GROQ_API_KEY is not configured")

        whisper_model = model or self.settings.groq_whisper_model
        timeout = httpx.Timeout(
            timeout=self.settings.groq_whisper_timeout_seconds,
            connect=30.0,
        )
        data: dict[str, str] = {
            "model": whisper_model,
            "response_format": "verbose_json",
            "temperature": "0.0",
        }
        if language:
            data["language"] = language
        if prompt:
            data["prompt"] = prompt

        last_error: Exception | None = None
        for key_idx, api_key in enumerate(self.settings.groq_api_key_list):
            headers = {"Authorization": f"Bearer {api_key}"}
            try:
                with open(audio_path, "rb") as f:
                    files = {"file": (audio_path.name, f, "audio/wav")}
                    async with httpx.AsyncClient(timeout=timeout) as client:
                        response = await client.post(
                            f"{self.base_url}/audio/transcriptions",
                            headers=headers,
                            files=files,
                            data=data,
                        )
                response.raise_for_status()
                if key_idx > 0:
                    logger.info("groq_key_rotation_succeeded", endpoint="whisper", key_index=key_idx)
                return response.json()
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in (429, 401, 403):
                    logger.warning(
                        "groq_key_failed_rotating",
                        endpoint="whisper",
                        key_index=key_idx,
                        status=exc.response.status_code,
                        keys_remaining=len(self.settings.groq_api_key_list) - key_idx - 1,
                    )
                    last_error = exc
                    continue
                raise
        raise last_error or RuntimeError("All Groq API keys exhausted for Whisper transcription")

    async def transcribe_audio_chunked(
        self,
        chunk_paths: list[Path],
        *,
        language: str | None = None,
        model: str | None = None,
        prompt: str | None = None,
    ) -> list[dict[str, Any]]:
        """Transcribe multiple audio chunks in parallel via Groq Whisper API.

        Returns list of parsed JSON responses in chunk order.
        """
        max_parallel = self.settings.groq_whisper_max_parallel
        semaphore = asyncio.Semaphore(max_parallel)

        async def _transcribe_one(path: Path) -> dict[str, Any]:
            async with semaphore:
                return await self.transcribe_audio(
                    path, language=language, model=model, prompt=prompt,
                )

        tasks = [_transcribe_one(p) for p in chunk_paths]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        final: list[dict[str, Any]] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning(
                    "groq_whisper_chunk_failed",
                    chunk_index=i,
                    chunk_path=str(chunk_paths[i]),
                    error=str(result),
                )
                final.append({"text": "", "segments": [], "language": "und"})
            else:
                final.append(result)
        return final

    @staticmethod
    def parse_json(text: str) -> dict[str, Any]:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                return json.loads(text[start : end + 1])
            raise
