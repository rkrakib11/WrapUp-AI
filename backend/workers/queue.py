from __future__ import annotations

import asyncio
from datetime import datetime
from uuid import uuid4

from structlog import get_logger

from backend.core.config import Settings
from backend.db.supabase import SupabaseClient
from backend.models.domain import JobState, ProcessingJob

logger = get_logger(__name__)


class JobQueue:
    def __init__(self, settings: Settings, db: SupabaseClient, process_fn):
        self.settings = settings
        self.db = db
        self.process_fn = process_fn
        self.jobs_by_session: dict[str, ProcessingJob] = {}
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._workers: list[asyncio.Task] = []
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        for index in range(self.settings.worker_concurrency):
            task = asyncio.create_task(self._worker_loop(worker_id=index + 1))
            self._workers.append(task)

    async def stop(self) -> None:
        self._running = False
        for task in self._workers:
            task.cancel()
        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers = []

    async def enqueue(
        self,
        *,
        session_id: str,
        user_id: str,
        kind: str = "upload",
    ) -> ProcessingJob:
        existing = self.jobs_by_session.get(session_id)
        if existing and existing.status in {JobState.queued, JobState.processing}:
            return existing

        job = ProcessingJob(
            job_id=str(uuid4()),
            session_id=session_id,
            user_id=user_id,
            status=JobState.queued,
            kind=kind,
        )
        self.jobs_by_session[session_id] = job
        await self.db.append_processing_status(session_id, status=job.status.value, progress=0, message=job.message)
        await self._queue.put(session_id)
        return job

    def get_job(self, session_id: str) -> ProcessingJob | None:
        return self.jobs_by_session.get(session_id)

    async def _worker_loop(self, worker_id: int) -> None:
        while self._running:
            try:
                session_id = await asyncio.wait_for(
                    self._queue.get(),
                    timeout=self.settings.worker_poll_interval_seconds,
                )
            except asyncio.TimeoutError:
                continue
            job = self.jobs_by_session.get(session_id)
            if not job:
                self._queue.task_done()
                continue

            logger.info("worker_started_job", worker_id=worker_id, session_id=session_id, job_id=job.job_id)
            try:
                await self._set_job_status(job, JobState.processing, 3, "Processing started")
                await self.process_fn(job, self._set_progress)
                await self._set_job_status(job, JobState.completed, 100, "Completed")
            except Exception as exc:
                job.retries += 1
                job.error = str(exc)
                if job.retries <= self.settings.max_job_retries:
                    await self._set_job_status(
                        job,
                        JobState.queued,
                        job.progress,
                        f"Retrying ({job.retries}/{self.settings.max_job_retries})",
                    )
                    await asyncio.sleep(self.settings.job_retry_backoff_seconds * job.retries)
                    await self._queue.put(session_id)
                else:
                    await self._set_job_status(job, JobState.failed, job.progress, "Failed", error=str(exc))
                logger.exception("worker_job_failed", worker_id=worker_id, session_id=session_id, error=str(exc))
            finally:
                self._queue.task_done()

    async def _set_progress(self, job: ProcessingJob, progress: int, message: str) -> None:
        job.progress = progress
        job.message = message
        job.updated_at = datetime.utcnow()
        await self.db.append_processing_status(
            job.session_id,
            status=job.status.value,
            progress=job.progress,
            message=job.message,
            retries=job.retries,
            error=job.error,
        )

    async def _set_job_status(
        self,
        job: ProcessingJob,
        status: JobState,
        progress: int,
        message: str,
        error: str | None = None,
    ) -> None:
        job.status = status
        job.progress = progress
        job.message = message
        job.error = error
        job.updated_at = datetime.utcnow()
        await self.db.append_processing_status(
            job.session_id,
            status=status.value,
            progress=progress,
            message=message,
            retries=job.retries,
            error=job.error,
        )

