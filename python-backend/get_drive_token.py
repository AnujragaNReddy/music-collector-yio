"""Run this ONCE, locally, to authorize Music Collector against your own
Google Drive and print the four values that go into Render's environment
variables. Never deployed, never run by the server itself.

Setup before running:
  1. In Google Cloud Console: APIs & Services -> Credentials ->
     Create Credentials -> OAuth client ID -> type "Desktop app".
  2. Under "OAuth consent screen", click "Publish App" (drive.file is not
     a restricted scope, so this needs no Google review).
  3. pip install -r requirements.txt
  4. Set GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET in your shell
     (the two values from step 1), then:
       python get_drive_token.py

A browser window will open asking you to sign in and approve access.
Approve it, then come back here — this prints everything you need.
"""

import os
import sys

from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
FOLDER_NAME = "Music Collector"


def main():
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()

    if not client_id or not client_secret:
        print(
            "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in "
            "your shell first (from the Desktop app OAuth client you "
            "created in Google Cloud Console), then run this again.",
            file=sys.stderr,
        )
        sys.exit(1)

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    print("Opening a browser window to sign in and approve access...")
    credentials = flow.run_local_server(port=0)

    print("Authorized. Creating a fresh 'Music Collector' folder in your Drive...")
    service = build("drive", "v3", credentials=credentials, cache_discovery=False)
    folder = (
        service.files()
        .create(
            body={
                "name": FOLDER_NAME,
                "mimeType": "application/vnd.google-apps.folder",
            },
            fields="id, webViewLink",
        )
        .execute()
    )

    print()
    print("=" * 70)
    print("Set these four environment variables on the backend service in Render:")
    print("=" * 70)
    print(f"GOOGLE_OAUTH_CLIENT_ID={client_id}")
    print(f"GOOGLE_OAUTH_CLIENT_SECRET={client_secret}")
    print(f"GOOGLE_OAUTH_REFRESH_TOKEN={credentials.refresh_token}")
    print(f"GOOGLE_DRIVE_ROOT_FOLDER_ID={folder['id']}")
    print("=" * 70)
    print(f"New Drive folder: {folder.get('webViewLink')}")
    print(
        "(Feel free to rename or move that folder in Drive afterward — "
        "that doesn't revoke access, since it's tracked by id.)"
    )


if __name__ == "__main__":
    main()
