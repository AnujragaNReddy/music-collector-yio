import json
import os
import re
import shutil
import requests

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urljoin, urlparse

from bs4 import BeautifulSoup

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel


# ============================================================
# CONFIG
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent

# Main download directory
DOWNLOADS_ROOT = PROJECT_ROOT / "Downloads"

DOWNLOADS_ROOT.mkdir(
    parents=True,
    exist_ok=True
)

# ------------------------------------------------------------
# API KEY
# ------------------------------------------------------------

# For local development this can remain empty.
#
# PowerShell:
#   $env:API_KEY="my-secret"
#
# Linux/macOS:
#   export API_KEY="my-secret"
#
API_KEY = os.environ.get(
    "API_KEY",
    ""
).strip()


def require_api_key(
    x_api_key: str = Header(default="")
):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key"
        )


# ------------------------------------------------------------
# ABSOLUTE PATH SUPPORT
# ------------------------------------------------------------

# By default all files are stored inside Downloads/.
#
# To allow:
#
#   D:\Music
#   E:\Songs
#
# start the backend with:
#
# PowerShell:
#   $env:ALLOW_ABSOLUTE_PATHS="true"
#
ALLOW_ABSOLUTE_PATHS = (
    os.environ
    .get("ALLOW_ABSOLUTE_PATHS", "")
    .strip()
    .lower()
    in ("1", "true", "yes")
)


# ============================================================
# FILE TYPES
# ============================================================

EXTENSION_CATEGORIES = {
    "images": {
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".svg",
        ".bmp",
    },

    "documents": {
        ".doc",
        ".docx",
        ".pdf",
        ".txt",
        ".rtf",
    },

    "spreadsheets": {
        ".xls",
        ".xlsx",
        ".csv",
    },

    "audio": {
        ".mp3",
        ".wav",
        ".m4a",
        ".aac",
        ".flac",
        ".ogg",
        ".opus",
        ".wma",
    },

    "video": {
        ".mp4",
        ".mov",
        ".mkv",
        ".webm",
        ".avi",
    },
}


AUDIO_EXTS = EXTENSION_CATEGORIES["audio"]


def categorize_extension(ext: str) -> str:

    ext = ext.lower()

    for category, extensions in EXTENSION_CATEGORIES.items():

        if ext in extensions:
            return category

    return "other"


# ============================================================
# HTTP HEADERS
# ============================================================

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 "
        "(Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 "
        "(KHTML, like Gecko) "
        "Chrome/140.0 Safari/537.36"
    ),

    "Accept": "*/*",

    "Accept-Language": (
        "en-US,en;q=0.9"
    ),
}


# ============================================================
# FILE NAME HELPERS
# ============================================================

def clean_filename(name: str) -> str:
    """
    Make a filename safe for Windows/Linux.
    """

    if not name:
        return ""

    name = unquote(name)

    # Windows invalid filename characters
    name = re.sub(
        r'[<>:"/\\|?*]',
        "",
        name
    )

    # Remove control characters
    name = re.sub(
        r"[\x00-\x1f]",
        "",
        name
    )

    # Normalize whitespace
    name = re.sub(
        r"\s+",
        " ",
        name
    )

    # Avoid Windows reserved names
    reserved = {
        "CON",
        "PRN",
        "AUX",
        "NUL",
        "COM1",
        "COM2",
        "COM3",
        "COM4",
        "COM5",
        "COM6",
        "COM7",
        "COM8",
        "COM9",
        "LPT1",
        "LPT2",
        "LPT3",
        "LPT4",
        "LPT5",
        "LPT6",
        "LPT7",
        "LPT8",
        "LPT9",
    }

    if name.upper() in reserved:
        name = f"_{name}"

    # Windows does not like trailing dot/space
    name = name.rstrip(". ")

    return name.strip()


def unique_destination(
    folder: Path,
    filename: str
) -> Path:

    dest = folder / filename

    stem = Path(filename).stem
    suffix = Path(filename).suffix

    counter = 1

    while dest.exists():

        dest = (
            folder
            / f"{stem}-{counter}{suffix}"
        )

        counter += 1

    return dest


# ============================================================
# DESTINATION PATH
# ============================================================

def resolve_destination_folder(
    path_str: Optional[str],
    default_prefix: str = "fetch"
) -> Path:

    """
    Resolve a user-supplied destination.

    Examples:

        None
            Downloads/fetch-20260920-120000

        Music
            Downloads/Music

        Music/Telugu
            Downloads/Music/Telugu

        D:\\Music
            D:\\Music

    Absolute paths require:
        ALLOW_ABSOLUTE_PATHS=true
    """

    if not path_str:

        folder = (
            DOWNLOADS_ROOT
            / datetime.now().strftime(
                f"{default_prefix}-%Y%m%d-%H%M%S"
            )
        )

        folder.mkdir(
            parents=True,
            exist_ok=True
        )

        return folder

    candidate = Path(path_str)

    # --------------------------------------------------------
    # Absolute path
    # --------------------------------------------------------

    if candidate.is_absolute():

        if not ALLOW_ABSOLUTE_PATHS:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Absolute destination paths are "
                    "disabled. Set "
                    "ALLOW_ABSOLUTE_PATHS=true "
                    "when running the backend locally."
                )
            )

        candidate.mkdir(
            parents=True,
            exist_ok=True
        )

        return candidate

    # --------------------------------------------------------
    # Relative path
    # --------------------------------------------------------

    safe_parts = [
        clean_filename(part)
        for part in candidate.parts
        if part not in ("", ".", "..")
    ]

    safe_parts = [
        part
        for part in safe_parts
        if part
    ]

    if safe_parts:

        folder = DOWNLOADS_ROOT.joinpath(
            *safe_parts
        )

    else:

        folder = (
            DOWNLOADS_ROOT
            / datetime.now().strftime(
                f"{default_prefix}-%Y%m%d-%H%M%S"
            )
        )

    folder.mkdir(
        parents=True,
        exist_ok=True
    )

    return folder


def resolve_existing_folder(
    path_str: Optional[str]
) -> Path:

    if not path_str:
        return DOWNLOADS_ROOT

    candidate = Path(path_str)

    # Absolute
    if candidate.is_absolute():

        if not ALLOW_ABSOLUTE_PATHS:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Absolute paths are disabled. "
                    "Set ALLOW_ABSOLUTE_PATHS=true."
                )
            )

        if not candidate.is_dir():

            raise HTTPException(
                status_code=404,
                detail="Folder not found"
            )

        return candidate

    # Relative
    safe_parts = [
        clean_filename(part)
        for part in candidate.parts
        if part not in ("", ".", "..")
    ]

    target = (
        DOWNLOADS_ROOT.joinpath(
            *safe_parts
        )
        if safe_parts
        else DOWNLOADS_ROOT
    )

    if not target.is_dir():

        raise HTTPException(
            status_code=404,
            detail="Folder not found"
        )

    return target


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="Music Collector File Fetch API",
    version="2.0.0"
)


app.add_middleware(
    CORSMiddleware,

    # Development
    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)


# ============================================================
# MUSIC SCRAPER HELPERS
# ============================================================

def is_audio_url(url: str) -> bool:

    try:

        parsed = urlparse(url)

        path = unquote(
            parsed.path
        ).lower()

        return any(
            path.endswith(extension)
            for extension in AUDIO_EXTS
        )

    except Exception:

        return False


def extract_song_name(
    url: str,
    fallback: str = "Unknown Song"
) -> str:

    try:

        parsed = urlparse(url)

        filename = Path(
            unquote(parsed.path)
        ).name

        if not filename:

            return fallback

        filename = Path(
            filename
        ).stem

        # Remove common quality labels
        filename = re.sub(
            r"\b("
            r"320\s*kbps|"
            r"320k|"
            r"hq|"
            r"high\s*quality|"
            r"128\s*kbps|"
            r"128k"
            r")\b",
            "",
            filename,
            flags=re.IGNORECASE
        )

        filename = re.sub(
            r"[_\-]+",
            " ",
            filename
        )

        filename = re.sub(
            r"\s+",
            " ",
            filename
        )

        return (
            clean_filename(filename)
            or fallback
        )

    except Exception:

        return fallback


def detect_audio_quality(
    url: str
) -> str:

    """
    Detect a quality label from the URL.

    IMPORTANT:
    This does not inspect the actual MP3 bitrate.

    HQ means the URL/path contains an HQ-style
    marker such as /HQ/ or -HQ.
    """

    decoded = unquote(
        url
    ).lower()

    hq_markers = [
        "320kbps",
        "320 kbps",
        "320k",
        "/hq/",
        "-hq/",
        " - hq/",
        "high-quality",
        "high_quality",
    ]

    for marker in hq_markers:

        if marker in decoded:
            return "HQ"

    return "NORMAL"


def scrape_audio_links(
    page_url: str
) -> list[dict]:

    """
    Scrape a webpage and find audio URLs.

    Supported:
        .mp3
        .wav
        .m4a
        .aac
        .flac
        .ogg
        .opus
        .wma
    """

    if not page_url.startswith(
        ("http://", "https://")
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "URL must start with "
                "http:// or https://"
            )
        )

    try:

        response = requests.get(
            page_url,
            headers=HEADERS,
            timeout=30
        )

        response.raise_for_status()

    except requests.RequestException as e:

        raise HTTPException(
            status_code=502,
            detail=(
                f"Unable to fetch webpage: {e}"
            )
        )

    soup = BeautifulSoup(
        response.text,
        "html.parser"
    )

    discovered = []

    seen_urls = set()

    # ========================================================
    # <a href="">
    # ========================================================

    for tag in soup.find_all(
        "a",
        href=True
    ):

        href = (
            tag.get(
                "href",
                ""
            )
            .strip()
        )

        if not href:
            continue

        absolute_url = urljoin(
            page_url,
            href
        )

        if not is_audio_url(
            absolute_url
        ):
            continue

        if absolute_url in seen_urls:
            continue

        seen_urls.add(
            absolute_url
        )

        anchor_title = tag.get_text(
            " ",
            strip=True
        )

        if not anchor_title:

            anchor_title = (
                extract_song_name(
                    absolute_url
                )
            )

        # Websites commonly use:
        #
        # Download
        # Play
        # MP3
        #
        # as anchor text.
        #
        # In that case use filename.

        generic_names = {
            "download",
            "play",
            "listen",
            "click here",
            "mp3",
            "download mp3",
        }

        if (
            anchor_title.lower()
            in generic_names
        ):

            anchor_title = (
                extract_song_name(
                    absolute_url
                )
            )

        discovered.append({

            "title": clean_filename(
                anchor_title
            ),

            "url": absolute_url,

            "quality": (
                detect_audio_quality(
                    absolute_url
                )
            ),

            "source_page": page_url,
        })

    # ========================================================
    # <audio src="">
    # <source src="">
    # ========================================================

    for tag in soup.find_all(
        [
            "audio",
            "source"
        ]
    ):

        src = (
            tag.get("src")
            or tag.get("data-src")
            or ""
        ).strip()

        if not src:
            continue

        absolute_url = urljoin(
            page_url,
            src
        )

        if not is_audio_url(
            absolute_url
        ):
            continue

        if absolute_url in seen_urls:
            continue

        seen_urls.add(
            absolute_url
        )

        discovered.append({

            "title": (
                extract_song_name(
                    absolute_url
                )
            ),

            "url": absolute_url,

            "quality": (
                detect_audio_quality(
                    absolute_url
                )
            ),

            "source_page": page_url,
        })

    return discovered


def normalize_song_title(
    title: str
) -> str:

    title = title.lower()

    title = re.sub(
        r"\b("
        r"320\s*kbps|"
        r"320k|"
        r"hq|"
        r"high\s*quality|"
        r"128\s*kbps|"
        r"128k"
        r")\b",
        "",
        title,
        flags=re.IGNORECASE
    )

    title = re.sub(
        r"[_\-]+",
        " ",
        title
    )

    title = re.sub(
        r"\s+",
        " ",
        title
    )

    return title.strip()


def select_best_audio_links(
    songs: list[dict],
    quality: str = "HQ"
) -> list[dict]:

    quality = (
        quality
        .upper()
        .strip()
    )

    if quality not in {
        "HQ",
        "NORMAL",
        "ALL"
    }:

        raise HTTPException(
            status_code=400,
            detail=(
                "quality must be "
                "'HQ', 'NORMAL' or 'ALL'"
            )
        )

    # ALL means don't remove alternate versions.
    if quality == "ALL":

        return songs

    grouped = {}

    for song in songs:

        key = normalize_song_title(
            song["title"]
        )

        existing = grouped.get(
            key
        )

        if existing is None:

            grouped[key] = song
            continue

        # Prefer HQ
        if (
            quality == "HQ"
            and song["quality"] == "HQ"
            and existing["quality"] != "HQ"
        ):

            grouped[key] = song

        # Prefer Normal
        elif (
            quality == "NORMAL"
            and song["quality"] == "NORMAL"
            and existing["quality"] != "NORMAL"
        ):

            grouped[key] = song

    return list(
        grouped.values()
    )


# ============================================================
# API: SCRAPE MUSIC ONLY
# ============================================================

class ScrapeMusicRequest(BaseModel):

    url: str

    quality: str = "HQ"

    language: Optional[str] = None


@app.post(
    "/api/scrape-music",
    dependencies=[
        Depends(require_api_key)
    ]
)
def scrape_music(
    request: ScrapeMusicRequest
):

    discovered = scrape_audio_links(
        request.url
    )

    if not discovered:

        raise HTTPException(
            status_code=404,
            detail=(
                "No audio files were found "
                "on the supplied webpage."
            )
        )

    songs = select_best_audio_links(
        discovered,
        request.quality
    )

    # Try to derive page title
    album = None

    try:

        response = requests.get(
            request.url,
            headers=HEADERS,
            timeout=20
        )

        if response.ok:

            soup = BeautifulSoup(
                response.text,
                "html.parser"
            )

            if soup.title:

                album = (
                    soup.title
                    .get_text(
                        " ",
                        strip=True
                    )
                )

    except Exception:
        pass

    if not album:

        parsed = urlparse(
            request.url
        )

        album = Path(
            parsed.path
        ).stem

    album = (
        clean_filename(album)
        or "Music"
    )

    return {

        "success": True,

        "source_page": request.url,

        "album": album,

        "language": request.language,

        "quality": request.quality,

        "total_discovered": len(
            discovered
        ),

        "total_songs": len(
            songs
        ),

        "songs": songs,
    }


# ============================================================
# API: SCRAPE + DOWNLOAD MUSIC
# ============================================================

class ScrapeAndDownloadRequest(BaseModel):

    # Webpage to scrape
    url: str

    # Destination
    #
    # Example:
    #   "Music/Telugu"
    #
    # Or:
    #   "D:\\Music"
    #
    destination: Optional[str] = None

    # HQ / NORMAL / ALL
    quality: str = "HQ"

    # Language is metadata
    language: Optional[str] = None

    # Download everything
    download_all: bool = True

    # If download_all=false
    # these indexes are downloaded.
    selected_indexes: Optional[
        list[int]
    ] = None


@app.post(
    "/api/scrape-and-download",
    dependencies=[
        Depends(require_api_key)
    ]
)
def scrape_and_download_music(
    request: ScrapeAndDownloadRequest
):

    # ========================================================
    # 1. SCRAPE
    # ========================================================

    discovered = scrape_audio_links(
        request.url
    )

    if not discovered:

        raise HTTPException(
            status_code=404,
            detail=(
                "No audio files were found "
                "on the supplied webpage."
            )
        )

    # ========================================================
    # 2. SELECT QUALITY
    # ========================================================

    songs = select_best_audio_links(
        discovered,
        request.quality
    )

    # ========================================================
    # 3. SELECT SONGS
    # ========================================================

    if (
        not request.download_all
        and request.selected_indexes
        is not None
    ):

        selected = []

        for index in (
            request.selected_indexes
        ):

            if (
                0 <= index < len(songs)
            ):

                selected.append(
                    songs[index]
                )

        songs = selected

    if not songs:

        raise HTTPException(
            status_code=400,
            detail=(
                "No songs selected "
                "for download."
            )
        )

    # ========================================================
    # 4. GET ALBUM/PAGE NAME
    # ========================================================

    album_name = None

    try:

        response = requests.get(
            request.url,
            headers=HEADERS,
            timeout=20
        )

        if response.ok:

            soup = BeautifulSoup(
                response.text,
                "html.parser"
            )

            if soup.title:

                album_name = (
                    soup.title
                    .get_text(
                        " ",
                        strip=True
                    )
                )

    except Exception:
        pass

    if not album_name:

        parsed = urlparse(
            request.url
        )

        album_name = Path(
            parsed.path
        ).stem

    album_name = (
        clean_filename(
            album_name
        )
        or "Music"
    )

    # ========================================================
    # 5. DESTINATION
    # ========================================================

    if request.destination:

        batch_folder = (
            resolve_destination_folder(
                request.destination,
                default_prefix="music"
            )
        )

    else:

        batch_folder = (
            resolve_destination_folder(
                f"Music/{album_name}",
                default_prefix="music"
            )
        )

    # ========================================================
    # 6. AUDIO FOLDER
    # ========================================================

    audio_folder = (
        batch_folder / "audio"
    )

    audio_folder.mkdir(
        parents=True,
        exist_ok=True
    )

    # ========================================================
    # 7. DOWNLOAD
    # ========================================================

    entries = []

    errors = []

    used_names = set()

    for index, song in enumerate(
        songs
    ):

        song_url = song["url"]

        try:

            if not song_url.startswith(
                (
                    "http://",
                    "https://"
                )
            ):

                raise ValueError(
                    "Invalid audio URL"
                )

            # ------------------------------------------------
            # Download
            # ------------------------------------------------

            with requests.get(
                song_url,
                headers=HEADERS,
                stream=True,
                timeout=120
            ) as response:

                response.raise_for_status()

                # ------------------------------------------------
                # Filename
                # ------------------------------------------------

                raw_name = unquote(
                    Path(
                        urlparse(
                            song_url
                        ).path
                    ).name
                )

                if not raw_name:

                    raw_name = (
                        f"{song['title']}.mp3"
                    )

                raw_name = (
                    clean_filename(
                        raw_name
                    )
                )

                # Make sure extension exists
                if not Path(
                    raw_name
                ).suffix:

                    raw_name += ".mp3"

                stem = Path(
                    raw_name
                ).stem

                suffix = Path(
                    raw_name
                ).suffix

                filename = raw_name

                counter = 1

                while (
                    filename.lower()
                    in used_names
                    or (
                        audio_folder
                        / filename
                    ).exists()
                ):

                    filename = (
                        f"{stem}-"
                        f"{counter}"
                        f"{suffix}"
                    )

                    counter += 1

                used_names.add(
                    filename.lower()
                )

                destination_path = (
                    audio_folder
                    / filename
                )

                # ------------------------------------------------
                # Write file
                # ------------------------------------------------

                size = 0

                with open(
                    destination_path,
                    "wb"
                ) as file:

                    for chunk in (
                        response.iter_content(
                            chunk_size=1024 * 64
                        )
                    ):

                        if not chunk:
                            continue

                        file.write(chunk)

                        size += len(chunk)

                # ------------------------------------------------
                # Metadata entry
                # ------------------------------------------------

                relative_path = (
                    destination_path
                    .relative_to(
                        batch_folder
                    )
                )

                entries.append({

                    "index": index,

                    "title": song[
                        "title"
                    ],

                    "filename": filename,

                    "quality": song[
                        "quality"
                    ],

                    "language": (
                        request.language
                    ),

                    # Page being scraped
                    "source_page": (
                        request.url
                    ),

                    # Actual audio URL
                    "url": song_url,

                    # Full local path
                    "location": str(
                        destination_path
                        .resolve()
                    ),

                    # Relative path
                    "relative_path": str(
                        relative_path
                    ).replace(
                        "\\",
                        "/"
                    ),

                    "size_bytes": size,

                    "content_type": (
                        response.headers.get(
                            "content-type",
                            ""
                        )
                    ),

                    "downloaded_at": (
                        datetime.now(
                            timezone.utc
                        ).isoformat()
                    ),

                    "status": "downloaded",
                })

        except (
            requests.RequestException,
            OSError,
            ValueError
        ) as e:

            errors.append({

                "index": index,

                "title": song.get(
                    "title",
                    "Unknown Song"
                ),

                "url": song_url,

                "source_page": (
                    request.url
                ),

                "error": str(e),

                "status": "failed",
            })

    # ========================================================
    # 8. METADATA
    # ========================================================

    metadata = {

        "type": "music_collection",

        "source": {

            "webpage": (
                request.url
            ),

            "language": (
                request.language
            ),

            "requested_quality": (
                request.quality
            ),
        },

        "destination": {

            "folder": str(
                batch_folder.resolve()
            ),

            "audio_folder": str(
                audio_folder.resolve()
            ),
        },

        "created_at": (
            datetime.now(
                timezone.utc
            ).isoformat()
        ),

        "total_discovered": (
            len(discovered)
        ),

        "total_requested": (
            len(songs)
        ),

        "total_downloaded": (
            len(entries)
        ),

        "total_failed": (
            len(errors)
        ),

        "files": entries,

        "errors": errors,
    }

    metadata_path = (
        batch_folder
        / "metadata.json"
    )

    with open(
        metadata_path,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            metadata,
            file,
            indent=2,
            ensure_ascii=False
        )

    # ========================================================
    # 9. RESPONSE
    # ========================================================

    return {

        "success": True,

        "source_page": (
            request.url
        ),

        "album": album_name,

        "destination": str(
            batch_folder.resolve()
        ),

        "audio_folder": str(
            audio_folder.resolve()
        ),

        "metadata_file": str(
            metadata_path.resolve()
        ),

        "total_discovered": (
            len(discovered)
        ),

        "total_downloaded": (
            len(entries)
        ),

        "total_failed": (
            len(errors)
        ),

        "songs": entries,

        "errors": errors,
    }


# ============================================================
# FETCH FILES
# ============================================================

class FetchRequest(BaseModel):

    urls: list[str]

    folder_name: Optional[
        str
    ] = None


@app.post(
    "/api/fetch",
    dependencies=[
        Depends(require_api_key)
    ]
)
def fetch_files(
    request: FetchRequest
):

    urls = [
        url.strip()
        for url in request.urls
        if url.strip()
    ]

    if not urls:

        raise HTTPException(
            status_code=400,
            detail="No URLs provided"
        )

    batch_folder = (
        resolve_destination_folder(
            request.folder_name
        )
    )

    entries = []

    errors = []

    seen_names = set()

    for url in urls:

        if not url.startswith(
            (
                "http://",
                "https://"
            )
        ):

            errors.append({

                "url": url,

                "error": "Invalid URL"
            })

            continue

        try:

            with requests.get(
                url,
                headers=HEADERS,
                stream=True,
                timeout=60
            ) as response:

                response.raise_for_status()

                clean_url = (
                    url.split("?")[0]
                )

                ext = (
                    Path(
                        urlparse(
                            clean_url
                        ).path
                    )
                    .suffix
                    .lower()
                )

                category = (
                    categorize_extension(
                        ext
                    )
                )

                raw_name = clean_filename(
                    unquote(
                        Path(
                            urlparse(
                                clean_url
                            ).path
                        ).name
                    )
                )

                if not raw_name:

                    raw_name = (
                        f"file{ext}"
                    )

                stem = Path(
                    raw_name
                ).stem

                suffix = Path(
                    raw_name
                ).suffix

                unique_name = raw_name

                counter = 1

                while (
                    unique_name.lower()
                    in seen_names
                ):

                    unique_name = (
                        f"{stem}-"
                        f"{counter}"
                        f"{suffix}"
                    )

                    counter += 1

                seen_names.add(
                    unique_name.lower()
                )

                category_folder = (
                    batch_folder
                    / category
                )

                category_folder.mkdir(
                    parents=True,
                    exist_ok=True
                )

                dest_path = (
                    category_folder
                    / unique_name
                )

                size = 0

                with open(
                    dest_path,
                    "wb"
                ) as file:

                    for chunk in (
                        response.iter_content(
                            chunk_size=1024 * 64
                        )
                    ):

                        if chunk:

                            file.write(
                                chunk
                            )

                            size += len(
                                chunk
                            )

                entries.append({

                    "url": url,

                    "filename": unique_name,

                    "category": category,

                    "size_bytes": size,

                    "content_type": (
                        response.headers.get(
                            "content-type",
                            ""
                        )
                    ),

                    "location": str(
                        dest_path.resolve()
                    ),

                    "downloaded_at": (
                        datetime.now(
                            timezone.utc
                        ).isoformat()
                    ),
                })

        except requests.RequestException as e:

            errors.append({

                "url": url,

                "error": str(e)
            })

    is_browsable = (
        batch_folder
        .resolve()
        .is_relative_to(
            DOWNLOADS_ROOT.resolve()
        )
    )

    metadata = {

        "folder": str(
            batch_folder.resolve()
        ),

        "browsable_in_files_page": (
            is_browsable
        ),

        "total_requested": len(
            urls
        ),

        "total_success": len(
            entries
        ),

        "total_failed": len(
            errors
        ),

        "files": entries,

        "errors": errors,
    }

    with open(
        batch_folder
        / "metadata.json",
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            metadata,
            file,
            indent=2,
            ensure_ascii=False
        )

    return metadata


# ============================================================
# COLLECTOR
# ============================================================

class CollectRequest(BaseModel):

    source: Optional[
        str
    ] = None


@app.post(
    "/api/collect",
    dependencies=[
        Depends(require_api_key)
    ]
)
def run_collector(
    request: CollectRequest
):

    try:

        from mutagen import File as read_tags

    except ImportError:

        raise HTTPException(
            status_code=500,
            detail=(
                "mutagen is not installed. "
                "Run: pip install mutagen"
            )
        )

    source_folder = (
        resolve_existing_folder(
            request.source
        )
    )

    collection_folder = (
        source_folder
        / "Collection"
    )

    collection_folder.mkdir(
        parents=True,
        exist_ok=True
    )

    audio_files = [

        path

        for path
        in source_folder.rglob("*")

        if (
            path.is_file()
            and path.suffix.lower()
            in AUDIO_EXTS
            and collection_folder.resolve()
            not in path.resolve().parents
        )
    ]

    songs = []

    for src in audio_files:

        info = {

            "title": src.stem,

            "artist": "Unknown Artist",

            "album": "Unknown Album",

            "duration_seconds": None
        }

        try:

            audio = read_tags(
                src,
                easy=True
            )

            if audio is not None:

                if audio.get("title"):

                    info["title"] = (
                        audio["title"][0]
                    )

                if audio.get("artist"):

                    info["artist"] = (
                        audio["artist"][0]
                    )

                if audio.get("album"):

                    info["album"] = (
                        audio["album"][0]
                    )

                if (
                    audio.info
                    and getattr(
                        audio.info,
                        "length",
                        None
                    )
                ):

                    info[
                        "duration_seconds"
                    ] = round(
                        audio.info.length,
                        1
                    )

        except Exception:

            pass

        dest_name = clean_filename(
            (
                f"{info['artist']} - "
                f"{info['title']}"
                f"{src.suffix}"
            )
        )

        if not dest_name:

            dest_name = src.name

        dest_path = unique_destination(
            collection_folder,
            dest_name
        )

        shutil.copyfile(
            src,
            dest_path
        )

        songs.append({

            "title": info[
                "title"
            ],

            "artist": info[
                "artist"
            ],

            "album": info[
                "album"
            ],

            "duration_seconds": (
                info[
                    "duration_seconds"
                ]
            ),

            "original_file": str(
                src.relative_to(
                    source_folder
                )
            ).replace(
                "\\",
                "/"
            ),

            "location": str(
                dest_path.resolve()
            ),
        })

    metadata_path = (
        collection_folder
        / "metadata.json"
    )

    with open(
        metadata_path,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            songs,
            file,
            indent=2,
            ensure_ascii=False
        )

    return {

        "source": str(
            source_folder.resolve()
        ),

        "collection_folder": str(
            collection_folder.resolve()
        ),

        "total_songs": len(
            songs
        ),

        "songs": songs,
    }


# ============================================================
# COPY / MOVE
# ============================================================

class OrganizeRequest(BaseModel):

    paths: list[str]

    destination: str

    action: str = "copy"


@app.post(
    "/api/organize",
    dependencies=[
        Depends(require_api_key)
    ]
)
def organize_files(
    request: OrganizeRequest
):

    if request.action not in (
        "copy",
        "move"
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "action must be "
                "'copy' or 'move'"
            )
        )

    if not request.paths:

        raise HTTPException(
            status_code=400,
            detail="No files selected"
        )

    destination_folder = (
        resolve_destination_folder(
            request.destination,
            default_prefix="organized"
        )
    )

    results = []

    for rel_path in request.paths:

        # Relative paths inside Downloads
        source = (
            DOWNLOADS_ROOT
            / rel_path
        ).resolve()

        # Security check
        if (
            not source.is_relative_to(
                DOWNLOADS_ROOT.resolve()
            )
            or not source.is_file()
        ):

            results.append({

                "path": rel_path,

                "success": False,

                "error": (
                    "Invalid or missing file"
                ),
            })

            continue

        dest_path = unique_destination(
            destination_folder,
            source.name
        )

        try:

            if request.action == "move":

                shutil.move(
                    str(source),
                    str(dest_path)
                )

            else:

                shutil.copy2(
                    str(source),
                    str(dest_path)
                )

            results.append({

                "path": rel_path,

                "success": True,

                "destination": str(
                    dest_path.resolve()
                ),
            })

        except OSError as e:

            results.append({

                "path": rel_path,

                "success": False,

                "error": str(e),
            })

    return {

        "destination": str(
            destination_folder.resolve()
        ),

        "action": request.action,

        "results": results,
    }


# ============================================================
# LIST FILES
# ============================================================

@app.get(
    "/api/files",
    dependencies=[
        Depends(require_api_key)
    ]
)
def list_files():

    files = []

    if DOWNLOADS_ROOT.exists():

        for path in sorted(
            DOWNLOADS_ROOT.rglob("*")
        ):

            if not path.is_file():
                continue

            relative_path = (
                path.relative_to(
                    DOWNLOADS_ROOT
                )
            )

            files.append({

                "relative_path": str(
                    relative_path
                ).replace(
                    "\\",
                    "/"
                ),

                "size_bytes": (
                    path.stat().st_size
                ),
            })

    return {
        "files": files
    }


# ============================================================
# DOWNLOAD FILE TO BROWSER
# ============================================================

@app.get(
    "/api/download/{relative_path:path}",
    dependencies=[
        Depends(require_api_key)
    ]
)
def download_file(
    relative_path: str
):

    target = (
        DOWNLOADS_ROOT
        / relative_path
    ).resolve()

    if not target.is_relative_to(
        DOWNLOADS_ROOT.resolve()
    ):

        raise HTTPException(
            status_code=400,
            detail="Invalid path"
        )

    if not target.is_file():

        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    return FileResponse(
        target,
        filename=target.name
    )


# ============================================================
# HEALTH
# ============================================================

@app.get("/api/health")
def health():

    return {

        "status": "ok",

        "service": (
            "Music Collector "
            "File Fetch API"
        ),

        "downloads_root": str(
            DOWNLOADS_ROOT.resolve()
        ),

        "absolute_paths_enabled": (
            ALLOW_ABSOLUTE_PATHS
        ),
    }