import json
import os
import re
import shutil
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

# Only ever set this to true in your own local environment. It lets a
# destination be an absolute path (e.g. "D:\Music") that gets written to
# directly instead of being confined under DOWNLOADS_ROOT. Leaving it unset
# (as on the public Render deployment) keeps every write sandboxed inside
# this backend's own Downloads folder.
ALLOW_ABSOLUTE_PATHS = os.environ.get("ALLOW_ABSOLUTE_PATHS", "").strip().lower() in ("1", "true", "yes")

EXTENSION_CATEGORIES = {
    "images": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"},
    "documents": {".doc", ".docx", ".pdf", ".txt", ".rtf"},
    "spreadsheets": {".xls", ".xlsx", ".csv"},
    "audio": {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"},
    "video": {".mp4", ".mov", ".mkv", ".webm", ".avi"},
}

AUDIO_EXTS = EXTENSION_CATEGORIES["audio"]


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


def resolve_destination_folder(path_str: Optional[str], default_prefix: str = "fetch") -> Path:
    """Resolve a user-supplied destination into a real folder.

    - Blank -> a fresh timestamped folder under Downloads/.
    - A plain or nested relative name ("Songs", "Songs/Telugu") -> confined
      under Downloads/, with every segment sanitized.
    - An absolute path ("D:\\Music") -> only honored when this server was
      started with ALLOW_ABSOLUTE_PATHS=true.
    """
    if not path_str:
        folder = DOWNLOADS_ROOT / datetime.now().strftime(f"{default_prefix}-%Y%m%d-%H%M%S")
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    candidate = Path(path_str)

    if candidate.is_absolute():
        if not ALLOW_ABSOLUTE_PATHS:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Absolute destination paths are disabled on this server. "
                    "Set ALLOW_ABSOLUTE_PATHS=true when running the backend "
                    "locally to allow this."
                ),
            )
        candidate.mkdir(parents=True, exist_ok=True)
        return candidate

    safe_parts = [
        clean_filename(part) for part in candidate.parts if part not in ("", ".", "..")
    ]
    safe_parts = [part for part in safe_parts if part]
    folder = DOWNLOADS_ROOT.joinpath(*safe_parts) if safe_parts else (
        DOWNLOADS_ROOT / datetime.now().strftime(f"{default_prefix}-%Y%m%d-%H%M%S")
    )
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def resolve_existing_folder(path_str: Optional[str]) -> Path:
    """Like resolve_destination_folder, but the folder must already exist
    (used to pick what to scan, rather than where to write)."""
    if not path_str:
        return DOWNLOADS_ROOT

    candidate = Path(path_str)

    if candidate.is_absolute():
        if not ALLOW_ABSOLUTE_PATHS:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Absolute paths are disabled on this server. Set "
                    "ALLOW_ABSOLUTE_PATHS=true when running the backend "
                    "locally to allow this."
                ),
            )
        if not candidate.is_dir():
            raise HTTPException(status_code=404, detail="Folder not found")
        return candidate

    safe_parts = [
        clean_filename(part) for part in candidate.parts if part not in ("", ".", "..")
    ]
    target = DOWNLOADS_ROOT.joinpath(*safe_parts) if safe_parts else DOWNLOADS_ROOT
    if not target.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")
    return target


def unique_destination(folder: Path, filename: str) -> Path:
    dest = folder / filename
    stem, suffix = Path(filename).stem, Path(filename).suffix
    counter = 1
    while dest.exists():
        dest = folder / f"{stem}-{counter}{suffix}"
        counter += 1
    return dest


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

    # A plain name ("Songs"), a nested path ("Songs/Telugu"), or — only when
    # this server was started with ALLOW_ABSOLUTE_PATHS=true — an absolute
    # local path ("D:\Music\Collection").
    folder_name: Optional[str] = None


@app.post("/api/fetch", dependencies=[Depends(require_api_key)])
def fetch_files(request: FetchRequest):

    urls = [u.strip() for u in request.urls if u.strip()]

    if not urls:
        raise HTTPException(status_code=400, detail="No URLs provided")

    batch_folder = resolve_destination_folder(request.folder_name)

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

    is_browsable = batch_folder.resolve().is_relative_to(DOWNLOADS_ROOT.resolve())

    metadata = {
        "folder": str(batch_folder.resolve()),
        "browsable_in_files_page": is_browsable,
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
# COLLECTOR SCRIPT
#
# Scans a folder for audio files, reads their real ID3/tag metadata with
# mutagen, copies them into a tidy "Collection" subfolder as "Artist -
# Title", and writes a metadata.json describing every song plus where it
# ended up. This is the server-side version of the tag-reading organizer —
# it runs against the backend's own real Downloads folder (or another real
# folder you point it at), not a browser sandbox.
# ============================================================

class CollectRequest(BaseModel):

    source: Optional[str] = None


@app.post("/api/collect", dependencies=[Depends(require_api_key)])
def run_collector(request: CollectRequest):
    from mutagen import File as read_tags

    source_folder = resolve_existing_folder(request.source)
    collection_folder = source_folder / "Collection"
    collection_folder.mkdir(parents=True, exist_ok=True)

    audio_files = [
        p for p in source_folder.rglob("*")
        if p.is_file()
        and p.suffix.lower() in AUDIO_EXTS
        and collection_folder.resolve() not in p.resolve().parents
    ]

    songs = []

    for src in audio_files:
        info = {"title": src.stem, "artist": "Unknown Artist", "album": "Unknown Album", "duration_seconds": None}

        try:
            audio = read_tags(src, easy=True)
            if audio is not None:
                if audio.get("title"):
                    info["title"] = audio["title"][0]
                if audio.get("artist"):
                    info["artist"] = audio["artist"][0]
                if audio.get("album"):
                    info["album"] = audio["album"][0]
                if audio.info and getattr(audio.info, "length", None):
                    info["duration_seconds"] = round(audio.info.length, 1)
        except Exception:
            pass

        dest_name = clean_filename(f"{info['artist']} - {info['title']}{src.suffix}") or src.name
        dest_path = unique_destination(collection_folder, dest_name)

        shutil.copyfile(src, dest_path)

        songs.append({
            "title": info["title"],
            "artist": info["artist"],
            "album": info["album"],
            "duration_seconds": info["duration_seconds"],
            "original_file": str(src.relative_to(source_folder)).replace("\\", "/"),
            "location": str(dest_path.resolve()),
        })

    metadata_path = collection_folder / "metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(songs, f, indent=2, ensure_ascii=False)

    return {
        "source": str(source_folder.resolve()),
        "collection_folder": str(collection_folder.resolve()),
        "total_songs": len(songs),
        "songs": songs,
    }


# ============================================================
# COPY / MOVE SELECTED FILES
# ============================================================

class OrganizeRequest(BaseModel):

    paths: list[str]
    destination: str
    action: str = "copy"


@app.post("/api/organize", dependencies=[Depends(require_api_key)])
def organize_files(request: OrganizeRequest):

    if request.action not in ("copy", "move"):
        raise HTTPException(status_code=400, detail="action must be 'copy' or 'move'")

    if not request.paths:
        raise HTTPException(status_code=400, detail="No files selected")

    destination_folder = resolve_destination_folder(request.destination, default_prefix="organized")

    results = []

    for rel_path in request.paths:
        source = (DOWNLOADS_ROOT / rel_path).resolve()

        if not source.is_relative_to(DOWNLOADS_ROOT.resolve()) or not source.is_file():
            results.append({"path": rel_path, "success": False, "error": "Invalid or missing file"})
            continue

        dest_path = unique_destination(destination_folder, source.name)

        try:
            if request.action == "move":
                shutil.move(str(source), str(dest_path))
            else:
                shutil.copy2(str(source), str(dest_path))
            results.append({"path": rel_path, "success": True, "destination": str(dest_path.resolve())})
        except OSError as e:
            results.append({"path": rel_path, "success": False, "error": str(e)})

    return {
        "destination": str(destination_folder.resolve()),
        "action": request.action,
        "results": results,
    }


# ============================================================
# BROWSE / DOWNLOAD FILES
#
# On a hosted deployment the server's disk is not something you can open in
# Explorer, and it's wiped on every redeploy/restart — so these endpoints let
# the browser list what's there and pull individual files back down.
# ============================================================

@app.get("/api/files", dependencies=[Depends(require_api_key)])
def list_files():
    # A flat list of every real file under Downloads/, whatever folder
    # structure it's actually in — fetch batches, the collector's Collection
    # folder, anything moved there by /api/organize. The frontend builds the
    # tree view from these paths.
    files = []

    if DOWNLOADS_ROOT.exists():
        for path in sorted(DOWNLOADS_ROOT.rglob("*")):
            if not path.is_file():
                continue

            relative_path = path.relative_to(DOWNLOADS_ROOT)
            files.append({
                "relative_path": str(relative_path).replace("\\", "/"),
                "size_bytes": path.stat().st_size,
            })

    return {"files": files}


@app.get("/api/download/{relative_path:path}", dependencies=[Depends(require_api_key)])
def download_file(relative_path: str):
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
