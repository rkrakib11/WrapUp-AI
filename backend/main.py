from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from structlog import get_logger

from backend.core.config import get_settings
from backend.core.logging import configure_logging
from backend.routers import (
    chat_router,
    live_transcription_router,
    meetings_router,
    sessions_router,
    share_router,
    stripe_router,
)
from backend.services.container import ServiceContainer

logger = get_logger(__name__)


async def _periodic_subscription_reconciler(app: FastAPI, interval_seconds: int = 3600) -> None:
    while True:
        try:
            updated = await app.state.container.stripe.reconcile_expired_subscriptions()
            logger.info("subscription_reconcile_cycle", updated=updated)
        except Exception as exc:
            logger.warning("subscription_reconcile_failed", error=str(exc))
        await asyncio.sleep(interval_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings = get_settings()
    container = ServiceContainer.build(settings)
    app.state.container = container
    logger.info(
        "startup_feature_flags",
        deepgram_enabled=bool(settings.deepgram_api_key),
        groq_enabled=bool(settings.groq_api_key),
        stripe_enabled=bool(settings.stripe_webhook_secret),
        transformer_embeddings_enabled=settings.enable_transformer_embeddings,
    )
    await container.jobs.start()
    reconcile_task = asyncio.create_task(_periodic_subscription_reconciler(app))
    app.state.reconcile_task = reconcile_task
    logger.info("backend_started", app_name=settings.app_name, env=settings.app_env)
    try:
        yield
    finally:
        app.state.reconcile_task.cancel()
        await asyncio.gather(app.state.reconcile_task, return_exceptions=True)
        await container.jobs.stop()
        logger.info("backend_stopped")


app = FastAPI(title="WrapUp AI Backend", version="1.0.0", lifespan=lifespan)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins_list,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions_router)
app.include_router(meetings_router)
app.include_router(share_router)
app.include_router(stripe_router)
app.include_router(chat_router)
app.include_router(live_transcription_router)


@app.get("/healthz")
async def health() -> dict[str, str]:
    return {"status": "ok"}
