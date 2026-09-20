import json
import os
import re
import requests

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import unquote

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel


# ============================================================
# CONFIG
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent

# When set (e.g. on a public deployment), requests must send a matching
# X-API-Key header. Left unset, it's open — fine for local-only use on your
# own machine.
API_KEY = os.environ.get("API_KEY", "")


def require_api_key(x_api_key: str = Header(default="")):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

DOWNLOADS_ROOT = PROJECT_ROOT / "Downloads"

DOWNLOADS_ROOT.mkdir(
    parents=True,
    exist_ok=True
)

EXTENSION_CATEGORIES = {
    "images": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"},
    "documents": {".doc", ".docx", ".pdf", ".txt", ".rtf"},
    "spreadsheets": {".xls", ".xlsx", ".csv"},
    "audio": {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"},
    "video": {".mp4", ".mov", ".mkv", ".webm", ".avi"},
}


def categorize_extension(ext):
    ext = ext.lower()
    for category, exts in EXTENSION_CATEGORIES.items():
        if ext in exts:
            return category
    return "other"


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/140.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
}


def clean_filename(name):

    name = unquote(name)

    name = re.sub(
        r'[<>:"/\\|?*]',
        '',
        name
    )

    name = re.sub(
        r'\s+',
        ' ',
        name
    )

    return name.strip()


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="Music Collector File Fetch API"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Restrict this to your React URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# FETCH FILES (download a list of direct file URLs you supply)
# ============================================================

class FetchRequest(BaseModel):

    urls: list[str]

    folder_name: Optional[str] = None


@app.post("/api/fetch", dependencies=[Depends(require_api_key)])
def fetch_files(request: FetchRequest):

    urls = [u.strip() for u in request.urls if u.strip()]

    if not urls:
        raise HTTPException(status_code=400, detail="No URLs provided")

    folder_name = (
        clean_filename(request.folder_name)
        if request.folder_name
        else datetime.now().strftime("fetch-%Y%m%d-%H%M%S")
    )

    batch_folder = DOWNLOADS_ROOT / (folder_name or "fetch")
    batch_folder.mkdir(parents=True, exist_ok=True)

    entries = []
    errors = []
    seen_names = set()

    for url in urls:

        if not url.startswith(("http://", "https://")):
            errors.append({"url": url, "error": "Invalid URL"})
            continue

        try:
            with requests.get(url, headers=HEADERS, stream=True, timeout=60) as r:
                r.raise_for_status()

                clean_url = url.split("?")[0]
                ext = Path(clean_url).suffix.lower()
                category = categorize_extension(ext)

                raw_name = clean_filename(unquote(Path(clean_url).name)) or f"file{ext}"
                stem, suffix = Path(raw_name).stem, Path(raw_name).suffix
                unique_name = raw_name
                counter = 1
                while unique_name.lower() in seen_names:
                    unique_name = f"{stem}-{counter}{suffix}"
                    counter += 1
                seen_names.add(unique_name.lower())

                category_folder = batch_folder / category
                category_folder.mkdir(parents=True, exist_ok=True)
                dest_path = category_folder / unique_name

                size = 0
                with open(dest_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1024 * 64):
                        if chunk:
                            f.write(chunk)
                            size += len(chunk)

                entries.append({
                    "url": url,
                    "filename": unique_name,
                    "category": category,
                    "size_bytes": size,
                    "content_type": r.headers.get("content-type", ""),
                    "location": str(dest_path.resolve()),
                    "downloaded_at": datetime.now(timezone.utc).isoformat(),
                })

        except requests.RequestException as e:
            errors.append({"url": url, "error": str(e)})

    metadata = {
        "folder": str(batch_folder.resolve()),
        "total_requested": len(urls),
        "total_success": len(entries),
        "total_failed": len(errors),
        "files": entries,
        "errors": errors,
    }

    with open(batch_folder / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    return metadata


# ============================================================
# BROWSE / DOWNLOAD FETCHED FILES
#
# On a hosted deployment the server's disk is not something you can open in
# Explorer, and it's wiped on every redeploy/restart — so these endpoints let
# the browser list what's there and pull individual files back down.
# ============================================================

@app.get("/api/files", dependencies=[Depends(require_api_key)])
def list_fetched_files():
    batches = []

    if DOWNLOADS_ROOT.exists():
        for batch_dir in sorted(DOWNLOADS_ROOT.iterdir(), reverse=True):
            if not batch_dir.is_dir():
                continue

            metadata_file = batch_dir / "metadata.json"
            if not metadata_file.exists():
                continue

            with open(metadata_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            files = []
            for entry in data.get("files", []):
                try:
                    relative_path = Path(entry["location"]).relative_to(DOWNLOADS_ROOT.resolve())
                except ValueError:
                    continue

                files.append({
                    "filename": entry["filename"],
                    "category": entry["category"],
                    "size_bytes": entry["size_bytes"],
                    "relative_path": str(relative_path).replace("\\", "/"),
                })

            batches.append({
                "folder_name": batch_dir.name,
                "total_success": data.get("total_success", len(files)),
                "files": files,
            })

    return {"batches": batches}


@app.get("/api/download/{relative_path:path}", dependencies=[Depends(require_api_key)])
def download_fetched_file(relative_path: str):
    target = (DOWNLOADS_ROOT / relative_path).resolve()

    if not target.is_relative_to(DOWNLOADS_ROOT.resolve()):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(target, filename=target.name)


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/api/health")
def health():

    return {
        "status": "ok"
    }
