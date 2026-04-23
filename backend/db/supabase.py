from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, urlparse

import httpx
from structlog import get_logger

from backend.core.config import Settings

logger = get_logger(__name__)


@dataclass(slots=True)
class SupabaseClient:
    settings: Settings

    def _headers(self, service_role: bool = True) -> dict[str, str]:
        api_key = self.settings.supabase_service_role_key if service_role else self.settings.supabase_anon_key
        return {
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    def _user_headers(self, access_token: str) -> dict[str, str]:
        return {
            "apikey": self.settings.supabase_anon_key or "",
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | list[dict[str, Any]] | None = None,
        service_role: bool = True,
        extra_headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        headers = self._headers(service_role=service_role)
        if extra_headers:
            headers.update(extra_headers)
        url = f"{self.settings.supabase_url}{path}"
        async with httpx.AsyncClient(timeout=self.settings.http_timeout_seconds) as client:
            response = await client.request(method, url, params=params, json=json_body, headers=headers)
        return response

    @staticmethod
    def _filter_expr(value: Any) -> str:
        if isinstance(value, tuple) and len(value) == 2:
            op, val = value
            return f"{op}.{val}"
        return f"eq.{value}"

    async def fetch_one(
        self,
        table: str,
        *,
        filters: dict[str, Any],
        columns: str = "*",
        access_token: str | None = None,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {"select": columns, "limit": 1}
        for key, value in filters.items():
            params[key] = self._filter_expr(value)
        response = await self._request(
            "GET",
            f"/rest/v1/{table}",
            params=params,
            service_role=access_token is None,
            extra_headers=self._user_headers(access_token) if access_token else None,
        )
        response.raise_for_status()
        rows = response.json()
        return rows[0] if rows else None

    async def fetch_many(
        self,
        table: str,
        *,
        filters: dict[str, Any] | None = None,
        columns: str = "*",
        access_token: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"select": columns}
        if filters:
            for key, value in filters.items():
                params[key] = self._filter_expr(value)
        response = await self._request(
            "GET",
            f"/rest/v1/{table}",
            params=params,
            service_role=access_token is None,
            extra_headers=self._user_headers(access_token) if access_token else None,
        )
        response.raise_for_status()
        return response.json()

    async def insert_rows(self, table: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        headers = {"Prefer": "return=representation"}
        response = await self._request(
            "POST",
            f"/rest/v1/{table}",
            json_body=rows,
            extra_headers=headers,
        )
        response.raise_for_status()
        return response.json()

    async def upsert_rows(
        self,
        table: str,
        rows: list[dict[str, Any]],
        *,
        on_conflict: str | None = None,
        ignore_duplicates: bool = False,
    ) -> list[dict[str, Any]]:
        headers = {"Prefer": "return=representation"}
        if ignore_duplicates:
            headers["Prefer"] = "resolution=ignore-duplicates,return=representation"
        params: dict[str, Any] | None = None
        if on_conflict:
            params = {"on_conflict": on_conflict}
        response = await self._request(
            "POST",
            f"/rest/v1/{table}",
            params=params,
            json_body=rows,
            extra_headers=headers,
        )
        response.raise_for_status()
        return response.json()

    async def update_rows(
        self,
        table: str,
        *,
        filters: dict[str, Any],
        values: dict[str, Any],
        access_token: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        for key, value in filters.items():
            params[key] = self._filter_expr(value)
        headers = {"Prefer": "return=representation"}
        response = await self._request(
            "PATCH",
            f"/rest/v1/{table}",
            params=params,
            json_body=values,
            service_role=access_token is None,
            extra_headers=(self._user_headers(access_token) if access_token else {}) | headers,
        )
        response.raise_for_status()
        return response.json()

    async def update_session(self, session_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
        rows = await self._safe_update_rows("sessions", filters={"id": session_id}, values=values)
        return rows[0] if rows else None

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        return await self.fetch_one("sessions", filters={"id": session_id})

    async def get_session_for_user(self, session_id: str, access_token: str) -> dict[str, Any] | None:
        return await self.fetch_one("sessions", filters={"id": session_id}, access_token=access_token)

    async def get_meeting_for_user(self, meeting_id: str, access_token: str) -> dict[str, Any] | None:
        return await self.fetch_one("meetings", filters={"id": meeting_id}, access_token=access_token)

    async def list_sessions_for_meeting(self, meeting_id: str) -> list[dict[str, Any]]:
        return await self.fetch_many(
            "sessions",
            filters={"meeting_id": meeting_id},
            columns="id,audio_file_url",
        )

    async def delete_meeting(self, meeting_id: str) -> None:
        response = await self._request(
            "DELETE",
            "/rest/v1/meetings",
            params={"id": f"eq.{meeting_id}"},
        )
        response.raise_for_status()

    async def resolve_media_url(self, audio_file_url: str, expires_in: int = 3600) -> str:
        if audio_file_url.startswith("r2:"):
            raise ValueError("R2 audio refs must be resolved by R2StorageService, not SupabaseClient")

        if audio_file_url.startswith("http://") or audio_file_url.startswith("https://"):
            signed_url = await self._try_convert_storage_public_url_to_signed_url(audio_file_url)
            return signed_url or audio_file_url

        if "/" not in audio_file_url:
            raise ValueError("audio_file_url must be a full URL or 'bucket/path' format")
        bucket, path = audio_file_url.split("/", 1)
        return await self.create_signed_object_url(bucket=bucket, path=path, expires_in=expires_in)

    async def delete_storage_object(self, audio_file_url: str) -> None:
        """Delete an object from Supabase Storage given a 'bucket/path' ref or full URL."""
        try:
            if audio_file_url.startswith("http://") or audio_file_url.startswith("https://"):
                parsed_path = urlparse(audio_file_url).path or ""
                marker = "/storage/v1/object/public/"
                if marker not in parsed_path:
                    return
                suffix = parsed_path.split(marker, 1)[1]
                if "/" not in suffix:
                    return
                bucket, path = suffix.split("/", 1)
            elif "/" in audio_file_url:
                bucket, path = audio_file_url.split("/", 1)
            else:
                return
            encoded_path = quote(path, safe="/")
            response = await self._request(
                "DELETE",
                f"/storage/v1/object/{bucket}/{encoded_path}",
            )
            if response.is_success:
                logger.info("supabase_storage_deleted", bucket=bucket, path=path, status=response.status_code)
            else:
                body = ""
                try:
                    body = response.text[:200]
                except Exception:
                    pass
                logger.warning(
                    "supabase_storage_delete_nonok",
                    bucket=bucket,
                    path=path,
                    status=response.status_code,
                    body=body,
                )
        except Exception as exc:
            logger.warning("supabase_storage_delete_failed", audio_file_url=audio_file_url, error=str(exc))

    async def list_storage_objects(self, bucket: str, prefix: str, limit: int = 1000) -> list[str]:
        """Return object names (relative to bucket) under a prefix. Recurses via repeated calls.

        Supabase Storage's /list endpoint is non-recursive by default — it returns folders
        as entries with no id. We recurse into anything that looks like a folder (id is None).
        """
        collected: list[str] = []
        stack: list[str] = [prefix.rstrip("/")]
        while stack:
            current = stack.pop()
            try:
                response = await self._request(
                    "POST",
                    f"/storage/v1/object/list/{bucket}",
                    json_body={"prefix": current, "limit": limit, "offset": 0},
                )
                if not response.is_success:
                    logger.warning(
                        "supabase_storage_list_failed",
                        bucket=bucket,
                        prefix=current,
                        status=response.status_code,
                    )
                    continue
                entries = response.json() or []
            except Exception as exc:
                logger.warning("supabase_storage_list_error", bucket=bucket, prefix=current, error=str(exc))
                continue
            for entry in entries:
                name = entry.get("name")
                if not name:
                    continue
                full = f"{current}/{name}" if current else name
                if entry.get("id") is None:
                    # Folder — recurse.
                    stack.append(full)
                else:
                    collected.append(full)
        return collected

    async def download_audio(self, audio_file_url: str) -> bytes:
        signed_url = await self.resolve_media_url(audio_file_url, expires_in=3600)
        return await self._download_from_url(signed_url)

    async def _try_convert_storage_public_url_to_signed_url(self, url: str) -> str | None:
        parsed = urlparse(url)
        path = parsed.path or ""

        # Example:
        # /storage/v1/object/public/meeting-files/<user>/<meeting>/<file>
        marker = "/storage/v1/object/public/"
        if marker not in path:
            return None

        suffix = path.split(marker, 1)[1]
        if "/" not in suffix:
            return None
        bucket, object_path = suffix.split("/", 1)
        if not bucket or not object_path:
            return None
        return await self.create_signed_object_url(bucket=bucket, path=object_path, expires_in=3600)

    async def create_signed_object_url(self, bucket: str, path: str, expires_in: int = 3600) -> str:
        encoded_path = quote(path, safe="/")
        response = await self._request(
            "POST",
            f"/storage/v1/object/sign/{bucket}/{encoded_path}",
            json_body={"expiresIn": expires_in},
        )
        response.raise_for_status()
        payload = response.json()
        signed_path = payload.get("signedURL")
        if not signed_path:
            raise RuntimeError("Supabase did not return signedURL")
        if signed_path.startswith("http://") or signed_path.startswith("https://"):
            return signed_path
        return f"{self.settings.supabase_url}/storage/v1{signed_path}"

    async def _download_from_url(self, url: str) -> bytes:
        async with httpx.AsyncClient(timeout=self.settings.http_timeout_seconds) as client:
            response = await client.get(url)
        response.raise_for_status()
        return response.content

    async def append_processing_status(
        self,
        session_id: str,
        *,
        status: str,
        progress: int,
        message: str,
        retries: int = 0,
        error: str | None = None,
    ) -> None:
        session = await self.get_session(session_id)
        if not session:
            return

        analytics = session.get("analytics_data")
        if isinstance(analytics, str):
            try:
                analytics = json.loads(analytics)
            except json.JSONDecodeError:
                analytics = {}
        if not isinstance(analytics, dict):
            analytics = {}
        analytics["processing_status"] = {
            "status": status,
            "progress": progress,
            "message": message,
            "retries": retries,
            "error": error,
        }
        values = {
            "analytics_data": analytics,
            "processing_status": status,
            "processing_progress": progress,
            "processing_message": message,
            "processing_retries": retries,
            "processing_error": error,
        }
        await self._safe_update_rows("sessions", filters={"id": session_id}, values=values)

    async def _safe_update_rows(
        self,
        table: str,
        *,
        filters: dict[str, Any],
        values: dict[str, Any],
        access_token: str | None = None,
    ) -> list[dict[str, Any]]:
        pending = dict(values)
        while pending:
            response = await self._request(
                "PATCH",
                f"/rest/v1/{table}",
                params={key: self._filter_expr(value) for key, value in filters.items()},
                json_body=pending,
                service_role=access_token is None,
                extra_headers=(self._user_headers(access_token) if access_token else {})
                | {"Prefer": "return=representation"},
            )
            if response.is_success:
                return response.json()

            payload: dict[str, Any] = {}
            try:
                payload = response.json()
            except Exception:
                response.raise_for_status()

            message = str(payload.get("message", ""))
            unknown_field = self._extract_unknown_column(message)
            if unknown_field and unknown_field in pending:
                pending.pop(unknown_field, None)
                continue
            response.raise_for_status()
        return []

    @staticmethod
    def _extract_unknown_column(message: str) -> str | None:
        markers = [
            "Could not find the '",
            "column ",
        ]
        for marker in markers:
            if marker in message:
                if marker == "Could not find the '":
                    rest = message.split(marker, 1)[1]
                    return rest.split("'", 1)[0]
                if marker == "column ":
                    rest = message.split("column ", 1)[1]
                    return rest.split(" ", 1)[0].strip('"')
        return None
