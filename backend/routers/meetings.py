from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from structlog import get_logger

from backend.core.security import get_current_user
from backend.models.domain import UserContext
from backend.routers.deps import get_container
from backend.schemas.meeting import SuggestTimesRequest, SuggestTimesResponse
from backend.services.container import ServiceContainer

logger = get_logger(__name__)

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.post("/suggest-times", response_model=SuggestTimesResponse)
async def suggest_times(
    request: SuggestTimesRequest,
    container: ServiceContainer = Depends(get_container),
    user: UserContext = Depends(get_current_user),
) -> SuggestTimesResponse:
    _ = user
    try:
        return await container.meetings.suggest_times(
            meetings=request.meetings,
            date=request.date,
            timezone=request.timezone,
            duration_minutes=request.duration_minutes,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.delete("/{meeting_id}")
async def delete_meeting(
    meeting_id: str,
    container: ServiceContainer = Depends(get_container),
    user: UserContext = Depends(get_current_user),
) -> dict:
    """Hard-delete a meeting and every artifact it owns.

    Cleans up: audio in B2/R2, audio in Supabase Storage, FAISS index, and the
    DB row (with cascade-delete handling sessions/action_items/notes/chats/etc).
    Storage/RAG failures are logged but do not block the DB delete.
    """
    meeting = await container.db.get_meeting_for_user(
        meeting_id, access_token=user.access_token or ""
    )
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    sessions = await container.db.list_sessions_for_meeting(meeting_id)
    for session in sessions:
        session_id = session.get("id")
        audio_file_url = session.get("audio_file_url") or ""
        if audio_file_url.startswith("r2:"):
            try:
                if container.r2.is_available():
                    container.r2.delete_object(audio_file_url[3:])
            except Exception as exc:
                logger.warning(
                    "meeting_delete_r2_failed",
                    meeting_id=meeting_id,
                    session_id=session_id,
                    error=str(exc),
                )
        elif audio_file_url:
            try:
                await container.db.delete_storage_object(audio_file_url)
            except Exception as exc:
                logger.warning(
                    "meeting_delete_supabase_storage_failed",
                    meeting_id=meeting_id,
                    session_id=session_id,
                    error=str(exc),
                )
        if session_id:
            container.rag.delete_session_index(session_id)

    # Sweep: any leftover files under meeting-files/{owner}/{meeting}/ — e.g.
    # the original video for an uploaded meeting whose audio_file_url got
    # replaced with an r2:// ref after extraction. Scoped to this user's
    # folder so we never touch anyone else's storage.
    owner_id = meeting.get("owner_id")
    if owner_id:
        prefix = f"{owner_id}/{meeting_id}"
        try:
            leftover = await container.db.list_storage_objects("meeting-files", prefix)
        except Exception as exc:
            logger.warning(
                "meeting_delete_storage_list_failed",
                meeting_id=meeting_id,
                prefix=prefix,
                error=str(exc),
            )
            leftover = []
        for obj_path in leftover:
            try:
                await container.db.delete_storage_object(f"meeting-files/{obj_path}")
            except Exception as exc:
                logger.warning(
                    "meeting_delete_leftover_failed",
                    meeting_id=meeting_id,
                    path=obj_path,
                    error=str(exc),
                )

    try:
        await container.db.delete_meeting(meeting_id)
    except Exception as exc:
        logger.exception(
            "meeting_delete_db_failed", meeting_id=meeting_id, error=str(exc)
        )
        raise HTTPException(status_code=500, detail="Failed to delete meeting") from exc

    logger.info("meeting_deleted", meeting_id=meeting_id, sessions=len(sessions))
    return {"deleted": True, "meeting_id": meeting_id}
