"""Google Drive upload helper for scraped music files.

Uses a service account rather than per-user OAuth: this is a backend-only,
single-user tool with no login screen, and a service account needs no
interactive consent flow or token refresh to babysit. It has its own
identity and can only see a Drive folder once that folder is explicitly
shared with its email address — see README.md for the one-time setup.
"""

import io
import json
import os
from functools import lru_cache
from typing import Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

SCOPES = ["https://www.googleapis.com/auth/drive"]

ROOT_FOLDER_ID = os.environ.get("GOOGLE_DRIVE_ROOT_FOLDER_ID", "").strip()
SERVICE_ACCOUNT_JSON = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()


def drive_enabled() -> bool:
    return bool(ROOT_FOLDER_ID and SERVICE_ACCOUNT_JSON)


@lru_cache(maxsize=1)
def _get_service():
    info = json.loads(SERVICE_ACCOUNT_JSON)
    credentials = service_account.Credentials.from_service_account_info(
        info, scopes=SCOPES
    )
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def get_or_create_folder(name: str, parent_id: str) -> str:
    """Finds a folder named `name` directly under `parent_id`, creating it
    if it doesn't exist yet."""

    service = _get_service()
    safe_name = name.replace("'", "\\'")
    query = (
        f"name = '{safe_name}' and "
        f"'{parent_id}' in parents and "
        "mimeType = 'application/vnd.google-apps.folder' and "
        "trashed = false"
    )
    results = (
        service.files()
        .list(q=query, fields="files(id, name)", pageSize=1)
        .execute()
    )
    existing = results.get("files", [])
    if existing:
        return existing[0]["id"]

    created = (
        service.files()
        .create(
            body={
                "name": name,
                "mimeType": "application/vnd.google-apps.folder",
                "parents": [parent_id],
            },
            fields="id",
        )
        .execute()
    )
    return created["id"]


def resolve_drive_folder(path_str: Optional[str]) -> dict:
    """Turns a path like "Music/Telugu" into nested folders under the
    configured root (creating any that don't exist yet) and returns the
    final folder's id and a link to view it in Drive."""

    folder_id = ROOT_FOLDER_ID
    parts = [p.strip() for p in (path_str or "").split("/") if p.strip()]
    for part in parts:
        folder_id = get_or_create_folder(part, folder_id)

    service = _get_service()
    meta = service.files().get(fileId=folder_id, fields="webViewLink").execute()
    return {"id": folder_id, "web_view_link": meta.get("webViewLink")}


def upload_bytes(
    data: bytes,
    filename: str,
    folder_id: str,
    mime_type: str = "application/octet-stream",
) -> dict:
    service = _get_service()
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=mime_type, resumable=False)
    created = (
        service.files()
        .create(
            body={"name": filename, "parents": [folder_id]},
            media_body=media,
            fields="id, webViewLink",
        )
        .execute()
    )
    return {"id": created["id"], "web_view_link": created.get("webViewLink")}
