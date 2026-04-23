from __future__ import annotations

import asyncio
import mimetypes

from backend.core.config import get_settings
from backend.services.container import ServiceContainer


async def _run() -> None:
    settings = get_settings()
    container = ServiceContainer.build(settings)

    if not container.r2.is_available():
        print("R2/B2 storage not configured — aborting. Check your .env.")
        return

    sessions = await container.db.fetch_many(
        "sessions",
        filters={"audio_file_url": ("not.is", "null")},
        columns="id,audio_file_url",
    )

    migrated = 0
    skipped = 0
    failed = 0

    for session in sessions:
        session_id = session["id"]
        audio_file_url = session.get("audio_file_url") or ""
        if audio_file_url.startswith("r2:"):
            skipped += 1
            continue
        try:
            audio_bytes = await container.db.download_audio(audio_file_url)
            ext = audio_file_url.rsplit(".", 1)[-1].lower() if "." in audio_file_url else "mp3"
            content_type = mimetypes.guess_type(f"file.{ext}")[0] or "audio/mpeg"
            r2_key = f"audio/{session_id}.{ext}"
            container.r2.upload_bytes(r2_key, audio_bytes, content_type=content_type)
            await container.db.update_session(session_id, {"audio_file_url": f"r2:{r2_key}"})
            await container.db.delete_storage_object(audio_file_url)
            migrated += 1
            print(f"migrated session={session_id} key={r2_key} size={len(audio_bytes)}")
        except Exception as exc:
            failed += 1
            print(f"failed session={session_id} error={exc!s}")

    print(f"done: migrated={migrated} skipped={skipped} failed={failed}")


def main() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    main()
