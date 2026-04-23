from __future__ import annotations

from typing import Any
from structlog import get_logger

from backend.core.config import Settings
from backend.language import is_language_match, is_translation_request, language_code_to_name, normalize_language_code
from backend.rag.chunker import chunk_text
from backend.rag.embeddings import EmbeddingService
from backend.rag.faiss_store import FaissStore
from backend.services.groq_client import GroqClient

logger = get_logger(__name__)


class RagService:
    def __init__(
        self,
        settings: Settings,
        embedding_service: EmbeddingService,
        faiss_store: FaissStore,
        groq_client: GroqClient,
    ):
        self.settings = settings
        self.embedding_service = embedding_service
        self.faiss_store = faiss_store
        self.groq_client = groq_client

    def delete_session_index(self, session_id: str) -> bool:
        """Delete the FAISS index + metadata for a session. Safe to call when absent."""
        try:
            return self.faiss_store.delete_session(session_id)
        except Exception as exc:
            logger.warning("faiss_delete_failed", session_id=session_id, error=str(exc))
            return False

    def index_session_transcript(
        self,
        *,
        session_id: str,
        transcript: str,
        transcript_language: str,
    ) -> int:
        _ = transcript_language
        chunks = chunk_text(
            transcript,
            chunk_size=self.settings.rag_chunk_size,
            overlap=self.settings.rag_chunk_overlap,
        )
        # Use passage prefix — required by E5 family for correct retrieval quality.
        vectors = self.embedding_service.embed_passages(chunks)
        self.faiss_store.save(session_id=session_id, vectors=vectors, chunks=chunks)
        return len(chunks)

    async def answer_question(
        self,
        *,
        session_id: str,
        session_language: str,
        question: str,
    ) -> dict[str, Any]:
        locked_language = normalize_language_code(session_language)
        # Use query prefix — required by E5 family for correct retrieval quality.
        query_vector = self.embedding_service.embed_query(question)
        contexts = self.faiss_store.search(session_id, query_vector, self.settings.rag_top_k)
        context_text = "\n\n".join(contexts)
        allow_translation = is_translation_request(question)

        answer: str | None = None
        max_attempts = max(1, self.settings.language_validation_max_retries + 1)
        for attempt in range(max_attempts):
            messages = self._build_qa_messages(
                session_language=locked_language,
                question=question,
                context_text=context_text,
                retry=(attempt > 0),
            )
            answer = await self.groq_client.chat_completion(
                model=self.settings.groq_model_chat,
                messages=messages,
                temperature=self.settings.chat_temperature,
                response_as_json=False,
            )
            if allow_translation:
                break
            language_ok, detected_language, confidence = is_language_match(answer, locked_language)
            if language_ok:
                break
            logger.warning(
                "rag_language_mismatch_retry",
                expected_language=locked_language,
                detected_language=detected_language,
                confidence=confidence,
                attempt=attempt + 1,
            )
            answer = None

        if answer is None:
            raise RuntimeError("Failed to produce an answer in the locked session language.")

        return {"answer": answer, "language": locked_language, "sources": contexts}

    @staticmethod
    def _build_qa_messages(
        *,
        session_language: str,
        question: str,
        context_text: str,
        retry: bool,
    ) -> list[dict[str, str]]:
        language_name = language_code_to_name(session_language)
        retry_clause = (
            f"CRITICAL: Your previous response was not in {language_name}. "
            "You MUST regenerate your answer in ONLY that language. No exceptions."
            if retry
            else ""
        )
        return [
            {
                "role": "system",
                "content": (
                    "You are a meeting assistant. Answer strictly from provided context. "
                    f"You MUST respond ONLY in {language_name}. "
                    "Do NOT mix languages. "
                    "Do NOT translate unless asked. "
                    f"{retry_clause}".strip()
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Session language: {language_name} (ISO code: '{session_language}').\n"
                    "If context is insufficient, say what is missing.\n\n"
                    f"Question:\n{question}\n\nContext:\n{context_text}"
                ),
            },
        ]
