from __future__ import annotations

from dataclasses import dataclass

from backend.models.domain import ProcessingJob
from backend.services.session_processing import SessionProcessingService


@dataclass(slots=True)
class SessionWorker:
    processor: SessionProcessingService

    async def run(self, job: ProcessingJob, progress_update) -> None:
        async def progress(progress: int, message: str) -> None:
            await progress_update(job, progress, message)

        if job.kind == "live":
            await self.processor.process_live_session(
                session_id=job.session_id,
                user_id=job.user_id,
                progress_callback=progress,
            )
        else:
            await self.processor.process_session(
                session_id=job.session_id,
                user_id=job.user_id,
                progress_callback=progress,
            )

