import { useState } from 'react';
import { Play, Loader2, PackagePlus, Lock, Unlock } from 'lucide-react';
import { usePyodide } from '../store/PyodideContext';
import CodeEditor from '../components/CodeEditor';
import OutputConsole from '../components/OutputConsole';
import './HomePage.css';

const STARTER_CODE = `# MUSIC COLLECTOR
# Organizes audio files you've uploaded on the Files tab: reads each file's
# real ID3/tag metadata with mutagen, copies it into a tidy "collection"
# folder, and writes a metadata.json describing every song plus where it
# ended up. "mutagen" is auto-installed the first time you hit Run.

import json
import shutil
from pathlib import Path
from mutagen import File as read_tags

SOURCE_DIR = Path(".")
COLLECTION_DIR = Path("collection")
AUDIO_EXTS = {".mp3", ".flac", ".wav", ".m4a", ".ogg", ".aac"}

COLLECTION_DIR.mkdir(exist_ok=True)

def safe_name(text, fallback):
    text = (text or fallback).strip()
    return "".join(c for c in text if c not in '<>:"/\\\\|?*') or fallback

def read_metadata(path):
    info = {"title": path.stem, "artist": "Unknown Artist", "album": "Unknown Album", "duration_seconds": None}
    try:
        audio = read_tags(path, easy=True)
        if audio is None:
            return info
        if audio.get("title"):
            info["title"] = audio["title"][0]
        if audio.get("artist"):
            info["artist"] = audio["artist"][0]
        if audio.get("album"):
            info["album"] = audio["album"][0]
        if audio.info and getattr(audio.info, "length", None):
            info["duration_seconds"] = round(audio.info.length, 1)
    except Exception as err:
        print(f"  (could not read tags: {err})")
    return info

songs = []
audio_files = [f for f in SOURCE_DIR.iterdir() if f.is_file() and f.suffix.lower() in AUDIO_EXTS]

if not audio_files:
    print("No audio files found. Upload some on the Files tab first, then hit Run again.")
else:
    print(f"Found {len(audio_files)} audio file(s). Organizing...")

for src in audio_files:
    meta = read_metadata(src)
    dest_name = safe_name(f"{meta['artist']} - {meta['title']}{src.suffix}", src.name)
    dest_path = COLLECTION_DIR / dest_name
    shutil.copyfile(src, dest_path)

    songs.append({
        "title": meta["title"],
        "artist": meta["artist"],
        "album": meta["album"],
        "duration_seconds": meta["duration_seconds"],
        "original_file": src.name,
        "location": str(dest_path),
    })
    print(f"  -> {meta['artist']} - {meta['title']}  ({dest_path})")

metadata_path = COLLECTION_DIR / "metadata.json"
with open(metadata_path, "w", encoding="utf-8") as f:
    json.dump(songs, f, indent=2, ensure_ascii=False)

print(f"\\nDone. {len(songs)} song(s) organized into '{COLLECTION_DIR}/'.")
print(f"Metadata written to {metadata_path}")
print("Open the Files tab to browse or download the collection folder contents.")
`;

export default function HomePage() {
  const { status, loadError, running, output, clearOutput, runCode, installPackage, installing, installedPackages } = usePyodide();
  const [code, setCode] = useState(STARTER_CODE);
  const [pkgName, setPkgName] = useState('');
  const [locked, setLocked] = useState(true);

  const ready = status === 'ready';

  function handleRun() {
    if (!ready || running) return;
    runCode(code);
  }

  function handleInstall(e) {
    e.preventDefault();
    if (!pkgName.trim()) return;
    installPackage(pkgName.trim());
    setPkgName('');
  }

  return (
    <div className="home-page">
      {status === 'error' && (
        <div className="runtime-error-banner">Could not load the Python runtime: {loadError}</div>
      )}

      <div className="home-toolbar">
        <button className="run-btn" onClick={handleRun} disabled={!ready || running}>
          {running ? <Loader2 size={16} className="spin" /> : <Play size={16} fill="currentColor" />}
          {running ? 'Running...' : 'Run'}
        </button>

        <button
          className="lock-btn"
          onClick={() => setLocked((v) => !v)}
          title={locked ? 'Unlock editor to make changes' : 'Lock editor'}
        >
          {locked ? <Lock size={16} /> : <Unlock size={16} />}
          {locked ? 'Locked' : 'Editable'}
        </button>

        <form className="install-form" onSubmit={handleInstall}>
          <PackagePlus size={16} />
          <input
            placeholder="Install a library (e.g. numpy, mutagen)"
            value={pkgName}
            onChange={(e) => setPkgName(e.target.value)}
            disabled={!ready || installing}
          />
          <button type="submit" disabled={!ready || installing || !pkgName.trim()}>
            {installing ? 'Installing...' : 'Install'}
          </button>
        </form>

        {!ready && status === 'loading' && (
          <span className="toolbar-hint">First load takes a few seconds — downloading the Python runtime...</span>
        )}
      </div>

      {installedPackages.length > 0 && (
        <div className="installed-list">
          Installed: {installedPackages.map((p) => <span key={p} className="pkg-chip">{p}</span>)}
        </div>
      )}

      <div className="home-panes">
        <CodeEditor value={code} onChange={setCode} locked={locked} />
        <OutputConsole output={output} onClear={clearOutput} />
      </div>
    </div>
  );
}
