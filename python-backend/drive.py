"""Google Drive upload helper for scraped music files.

Uses OAuth delegation (acting as the user, against their own Drive storage
quota) rather than a service account — service accounts have no storage
quota of their own and can't create files even in a folder shared with
them (Google's own error: "Service Accounts do not have storage quota.
... use OAuth delegation instead."). The one-time authorization is done
locally via get_drive_token.py (see README.md); the resulting refresh
token lets this module silently mint fresh access tokens on every call,
with no further interaction needed.

Scope is drive.file (access only to files/folders this app itself
created) rather than the full drive scope: drive.file is not a
Google-restricted scope, so the OAuth consent screen can be published to
Production without Google's manual review — the full drive scope would
either require that review or be stuck in "Testing" status, where
refresh tokens expire after 7 days.
"""

import io
import os
from functools import lru_cache
from typing import Optional

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
TOKEN_URI = "https://oauth2.googleapis.com/token"

ROOT_FOLDER_ID = os.environ.get("GOOGLE_DRIVE_ROOT_FOLDER_ID", "").strip()
OAUTH_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
OAUTH_CLIENT_SECRET = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
OAUTH_REFRESH_TOKEN = os.environ.get("GOOGLE_OAUTH_REFRESH_TOKEN", "").strip()


def drive_enabled() -> bool:
    return bool(
        ROOT_FOLDER_ID
        and OAUTH_CLIENT_ID
        and OAUTH_CLIENT_SECRET
        and OAUTH_REFRESH_TOKEN
    )


@lru_cache(maxsize=1)
def _get_service():
    credentials = Credentials(
        token=None,
        refresh_token=OAUTH_REFRESH_TOKEN,
        token_uri=TOKEN_URI,
        client_id=OAUTH_CLIENT_ID,
        client_secret=OAUTH_CLIENT_SECRET,
        scopes=SCOPES,
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
