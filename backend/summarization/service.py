from __future__ import annotations

from typing import Any
import httpx
from structlog import get_logger

from backend.core.config import Settings
from backend.language import is_language_match, language_code_to_name, normalize_language_code
from backend.services.groq_client import GroqClient

logger = get_logger(__name__)


class SummaryService:
    def __init__(self, settings: Settings, groq_client: GroqClient):
        self.settings = settings
        self.groq_client = groq_client

    async def generate_summary(
        self,
        *,
        transcript: str,
        session_language: str,
    ) -> dict[str, Any]:
        locked_language = normalize_language_code(session_language)
        transcript_for_prompt = self._clip_transcript(transcript)

        model_candidates = [self.settings.groq_model_summary, self.settings.groq_model_chat]
        seen: set[str] = set()
        ordered_models: list[str] = []
        for model in model_candidates:
            if model and model not in seen:
                seen.add(model)
                ordered_models.append(model)

        max_attempts = max(1, self.settings.language_validation_max_retries + 1)
        result: dict[str, Any] | None = None
        language_mismatch_detail: tuple[str, float] | None = None
        last_error: Exception | None = None

        for attempt in range(max_attempts):
            previous_wrong_language = (
                language_mismatch_detail[0] if language_mismatch_detail else None
            )
            messages = self._build_summary_messages(
                session_language=locked_language,
                transcript_for_prompt=transcript_for_prompt,
                retry=(attempt > 0),
                previous_wrong_language=previous_wrong_language,
            )
            for model in ordered_models:
                try:
                    result = await self._generate_with_model(model=model, messages=messages)
                    break
                except Exception as exc:
                    last_error = exc
                    continue
            if result is None:
                continue

            summary_blob = self._summary_text_blob(result)
            language_ok, detected_language, detected_confidence = is_language_match(summary_blob, locked_language)
            if language_ok:
                break
            language_mismatch_detail = (detected_language, detected_confidence)
            logger.warning(
                "summary_language_mismatch_retry",
                expected_language=locked_language,
                detected_language=detected_language,
                confidence=detected_confidence,
                attempt=attempt + 1,
            )
            result = None

        if result is None:
            detail = self._error_detail(last_error)
            if language_mismatch_detail is not None:
                mismatch_lang, mismatch_conf = language_mismatch_detail
                detail = (
                    f"language mismatch after retries; detected='{mismatch_lang}' "
                    f"(confidence={mismatch_conf:.2f})"
                )
            raise RuntimeError(f"Groq summary generation failed: {detail}") from last_error

        return {
            "executive_summary": result.get("executive_summary", ""),
            "key_points": result.get("key_points", []),
            "action_items": result.get("action_items", []),
            "decisions": result.get("decisions", []),
            "follow_ups": result.get("follow_ups", []),
            "speaker_breakdown": result.get("speaker_breakdown", []),
            "mom": result.get("mom", {}),
            "language": locked_language,
        }

    async def _generate_with_model(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
    ) -> dict[str, Any]:
        try:
            raw = await self.groq_client.chat_completion(
                model=model,
                messages=messages,
                temperature=self.settings.summary_temperature,
                response_as_json=True,
            )
            return self.groq_client.parse_json(raw)
        except Exception:
            raw = await self.groq_client.chat_completion(
                model=model,
                messages=messages,
                temperature=self.settings.summary_temperature,
                response_as_json=False,
            )
            return self.groq_client.parse_json(raw)

    @staticmethod
    def _build_summary_messages(
        *,
        session_language: str,
        transcript_for_prompt: str,
        retry: bool,
        previous_wrong_language: str | None = None,
    ) -> list[dict[str, str]]:
        language_name = language_code_to_name(session_language)
        if retry:
            wrong_name = (
                language_code_to_name(previous_wrong_language)
                if previous_wrong_language
                else "another language"
            )
            retry_clause = (
                f"CRITICAL: Your previous response was in {wrong_name}, "
                f"not {language_name}. Regenerate the ENTIRE output in {language_name} "
                f"only. Every string in the JSON — including action items, decisions, "
                f"and MoM fields — must be written in {language_name}. No exceptions."
            )
        else:
            retry_clause = ""
        prompt = (
            "Return strictly valid JSON. Build a meeting summary object with keys: "
            "executive_summary (string), key_points (array[string]), action_items "
            "(array[object{task,owner,deadline,confidence}]), decisions (array[string]), "
            "follow_ups (array[string]), speaker_breakdown (array[object{speaker,contribution}]), "
            "mom (object{title,overview,agenda,discussion,decisions,action_items,next_steps}). "
            "Keep answers concise and specific."
        )
        return [
            {
                "role": "system",
                "content": (
                    "You are a precise meeting intelligence engine. "
                    f"You MUST respond ONLY in {language_name}. "
                    "Do NOT mix languages. "
                    "Do NOT translate unless asked. "
                    f"{retry_clause}".strip()
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Session language: {language_name} (ISO code: {session_language})\n\n"
                    f"Transcript:\n{transcript_for_prompt}\n\n{prompt}"
                ),
            },
        ]

    @staticmethod
    def _clip_transcript(transcript: str) -> str:
        max_chars = 50000
        if len(transcript) <= max_chars:
            return transcript
        head = transcript[:30000]
        tail = transcript[-18000:]
        return (
            f"{head}\n\n[Transcript truncated due to size. Showing beginning and ending sections.]\n\n{tail}"
        )

    @staticmethod
    def _error_detail(error: Exception | None) -> str:
        if error is None:
            return "unknown error"
        if isinstance(error, httpx.HTTPStatusError):
            try:
                body = error.response.text.strip()
                if body:
                    return body
            except Exception:
                pass
        return str(error)

    @staticmethod
    def _summary_text_blob(summary: dict[str, Any]) -> str:
        text_parts: list[str] = []
        for key in ("executive_summary",):
            value = summary.get(key)
            if isinstance(value, str) and value.strip():
                text_parts.append(value.strip())
        for key in ("key_points", "decisions", "follow_ups"):
            value = summary.get(key)
            if isinstance(value, list):
                text_parts.extend(str(item).strip() for item in value if str(item).strip())
        action_items = summary.get("action_items")
        if isinstance(action_items, list):
            for item in action_items:
                if isinstance(item, dict):
                    text_parts.extend(
                        str(item.get(field, "")).strip()
                        for field in ("task", "owner", "deadline")
                        if str(item.get(field, "")).strip()
                    )
                elif str(item).strip():
                    text_parts.append(str(item).strip())
        mom = summary.get("mom")
        if isinstance(mom, dict):
            for value in mom.values():
                if isinstance(value, str) and value.strip():
                    text_parts.append(value.strip())
                elif isinstance(value, list):
                    text_parts.extend(str(item).strip() for item in value if str(item).strip())
        return "\n".join(text_parts)
