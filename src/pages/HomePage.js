import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Settings,
  Sparkles,
  Loader2,
  Copy,
  Move,
  X,
  Search,
  Music,
  Check,
  CheckSquare,
  Square,
  AlertTriangle,
} from "lucide-react";

import ConfigModal from "../components/ConfigModal";
import FolderTree from "../components/FolderTree";
import { formatSize } from "../lib/format";
import "./HomePage.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

const API_KEY = process.env.REACT_APP_API_KEY || "";

const AUTH_HEADERS = API_KEY ? { "X-API-Key": API_KEY } : {};

const CONFIG_STORAGE_KEY = "music-collector-config";

const DEFAULT_CONFIG = {
  sourceUrls: "",
  destinationDir: "",
  moveDestination: "",
};

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);

    return raw
      ? {
          ...DEFAULT_CONFIG,
          ...JSON.parse(raw),
        }
      : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function parseErrorDetail(response) {
  const detail = await response.json().catch(() => null);

  return detail?.detail || `Request failed (${response.status})`;
}

export default function HomePage() {
  // ==========================================================
  // EXISTING CONFIG
  // ==========================================================

  const [config, setConfig] = useState(loadConfig);

  const [configOpen, setConfigOpen] = useState(false);

  // ==========================================================
  // EXISTING FILES
  // ==========================================================

  const [files, setFiles] = useState([]);

  const [filesError, setFilesError] = useState("");

  const [loadingFiles, setLoadingFiles] = useState(false);

  const [selected, setSelected] = useState(new Set());

  // ==========================================================
  // EXISTING ACTION STATES
  // ==========================================================

  const [fetching, setFetching] = useState(false);

  const [collecting, setCollecting] = useState(false);

  const [organizing, setOrganizing] = useState(false);

  // Inline destination for copy/move — seeded from Config, but editable
  // per-operation so you don't have to reopen the modal to redirect a batch.
  const [organizeDestination, setOrganizeDestination] = useState(
    () => loadConfig().moveDestination || "",
  );

  const [confirmMove, setConfirmMove] = useState(false);

  const [organizeResults, setOrganizeResults] = useState(null);

  // ==========================================================
  // MUSIC SCRAPER STATE
  // ==========================================================

  const [musicUrl, setMusicUrl] = useState("");

  const [musicLanguage, setMusicLanguage] = useState("Telugu");

  const [musicQuality, setMusicQuality] = useState("HQ");

  const [musicDestination, setMusicDestination] = useState("");

  const [scraping, setScraping] = useState(false);

  const [downloadingMusic, setDownloadingMusic] = useState(false);

  const [musicSongs, setMusicSongs] = useState([]);

  const [selectedSongs, setSelectedSongs] = useState(new Set());

  const [musicAlbum, setMusicAlbum] = useState("");

  const [musicResult, setMusicResult] = useState(null);

  // ==========================================================
  // MESSAGE
  // ==========================================================

  const [message, setMessage] = useState(null);

  // ==========================================================
  // LOAD FILES
  // ==========================================================

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    setFilesError("");

    try {
      const response = await fetch(`${API_BASE}/api/files`, {
        headers: AUTH_HEADERS,
      });

      if (!response.ok) {
        throw new Error(await parseErrorDetail(response));
      }

      const data = await response.json();

      setFiles(data.files || []);
    } catch (err) {
      setFilesError(
        err.message === "Failed to fetch"
          ? `Could not reach the backend at ${API_BASE}.`
          : err.message,
      );
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Don't leave a primed "Confirm move" button sitting there after the
  // selection or destination has changed under it.
  useEffect(() => {
    setConfirmMove(false);
  }, [selected, organizeDestination]);

  // ==========================================================
  // SAVE CONFIG
  // ==========================================================

  function saveConfig(next) {
    setConfig(next);
    setOrganizeDestination(next.moveDestination || "");

    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore localStorage errors
    }
  }

  // ==========================================================
  // EXISTING DIRECT FETCH
  // ==========================================================

  async function handleFetch() {
    const urls = config.sourceUrls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      setMessage({
        tone: "error",
        text: "No source URLs configured — open Config and add some first.",
      });

      return;
    }

    setFetching(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/fetch`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          ...AUTH_HEADERS,
        },

        body: JSON.stringify({
          urls,

          folder_name: config.destinationDir.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorDetail(response));
      }

      const data = await response.json();

      setMessage({
        tone: "ok",

        text: `Fetched ${data.total_success} of ${data.total_requested} file(s) into ${data.folder}${
          data.total_failed ? ` (${data.total_failed} failed)` : ""
        }.`,
      });

      loadFiles();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err.message,
      });
    } finally {
      setFetching(false);
    }
  }

  // ==========================================================
  // SCRAPE MUSIC
  // ==========================================================

  async function handleScrapeMusic() {
    if (!musicUrl.trim()) {
      setMessage({
        tone: "error",
        text: "Enter a webpage URL first.",
      });

      return;
    }

    setScraping(true);
    setMessage(null);

    setMusicSongs([]);
    setSelectedSongs(new Set());
    setMusicResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/scrape-music`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          ...AUTH_HEADERS,
        },

        body: JSON.stringify({
          url: musicUrl.trim(),

          quality: musicQuality,

          language: musicLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorDetail(response));
      }

      const data = await response.json();

      setMusicAlbum(data.album || "");

      setMusicSongs(data.songs || []);

      // Select all by default
      setSelectedSongs(new Set((data.songs || []).map((_, index) => index)));

      setMusicResult(data);

      setMessage({
        tone: "ok",

        text: `Found ${data.total_songs} song(s).`,
      });
    } catch (err) {
      setMessage({
        tone: "error",
        text: err.message,
      });
    } finally {
      setScraping(false);
    }
  }

  // ==========================================================
  // TOGGLE SONG
  // ==========================================================

  function toggleSong(index) {
    setSelectedSongs((previous) => {
      const next = new Set(previous);

      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return next;
    });
  }

  // ==========================================================
  // SELECT ALL SONGS
  // ==========================================================

  function selectAllSongs() {
    setSelectedSongs(new Set(musicSongs.map((_, index) => index)));
  }

  // ==========================================================
  // CLEAR SONGS
  // ==========================================================

  function clearSongs() {
    setSelectedSongs(new Set());
  }

  // ==========================================================
  // DOWNLOAD SELECTED SONGS
  // ==========================================================

  async function handleDownloadMusic() {
    if (selectedSongs.size === 0) {
      setMessage({
        tone: "error",
        text: "Select at least one song.",
      });

      return;
    }

    if (!musicUrl.trim()) {
      setMessage({
        tone: "error",
        text: "Music webpage URL is missing.",
      });

      return;
    }

    setDownloadingMusic(true);
    setMessage(null);

    try {
      const selectedIndexes = [...selectedSongs].sort((a, b) => a - b);

      const response = await fetch(`${API_BASE}/api/scrape-and-download`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          ...AUTH_HEADERS,
        },

        body: JSON.stringify({
          url: musicUrl.trim(),

          destination: musicDestination.trim() || undefined,

          quality: musicQuality,

          language: musicLanguage,

          download_all: selectedIndexes.length === musicSongs.length,

          selected_indexes: selectedIndexes,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorDetail(response));
      }

      const data = await response.json();

      setMessage({
        tone: "ok",

        text: `Downloaded ${data.total_downloaded} of ${data.total_requested || selectedIndexes.length} song(s) into ${data.destination}${
          data.total_failed ? ` (${data.total_failed} failed)` : ""
        }.`,
      });

      loadFiles();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err.message,
      });
    } finally {
      setDownloadingMusic(false);
    }
  }

  // ==========================================================
  // EXISTING COLLECTOR
  // ==========================================================

  async function handleCollect() {
    setCollecting(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/collect`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          ...AUTH_HEADERS,
        },

        body: JSON.stringify({
          source: config.destinationDir.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorDetail(response));
      }

      const data = await response.json();

      setMessage({
        tone: "ok",

        text: `Collector organized ${data.total_songs} song(s) into ${data.collection_folder}.`,
      });

      loadFiles();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err.message,
      });
    } finally {
      setCollecting(false);
    }
  }

  // ==========================================================
  // COPY / MOVE
  // ==========================================================

  // Move takes files out of their current folder, so it asks once before
  // going ahead. Copy is harmless and runs straight away.
  function requestOrganize(action) {
    if (action === "move" && !confirmMove) {
      setConfirmMove(true);
      return;
    }
    handleOrganize(action);
  }

  async function handleOrganize(action) {
    if (selected.size === 0) {
      return;
    }

    const destination = organizeDestination.trim();

    if (!destination) {
      setMessage({
        tone: "error",

        text: "Enter a destination folder for the selected files.",
      });

      return;
    }

    setOrganizing(true);
    setMessage(null);
    setOrganizeResults(null);
    setConfirmMove(false);

    try {
      const response = await fetch(`${API_BASE}/api/organize`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          ...AUTH_HEADERS,
        },

        body: JSON.stringify({
          paths: [...selected],

          destination,

          action,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorDetail(response));
      }

      const data = await response.json();

      const failures = data.results.filter((r) => !r.success);

      const ok = data.results.length - failures.length;

      setMessage({
        tone: failures.length ? "error" : "ok",

        text: `${action === "move" ? "Moved" : "Copied"} ${ok} of ${data.results.length} file(s) to ${data.destination}.`,
      });

      setOrganizeResults(failures.length ? failures : null);

      setSelected(new Set());

      loadFiles();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err.message,
      });
    } finally {
      setOrganizing(false);
    }
  }

  // ==========================================================
  // FILE SELECTION
  // ==========================================================

  function toggleSelect(path) {
    setSelected((previous) => {
      const next = new Set(previous);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }

  // Folder-level checkbox: select or clear every file beneath it at once.
  function toggleMany(paths, shouldSelect) {
    setSelected((previous) => {
      const next = new Set(previous);

      for (const path of paths) {
        if (shouldSelect) {
          next.add(path);
        } else {
          next.delete(path);
        }
      }

      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((previous) =>
      previous.size === files.length
        ? new Set()
        : new Set(files.map((f) => f.relative_path)),
    );
  }

  // ==========================================================
  // DOWNLOAD FILE TO BROWSER
  // ==========================================================

  async function handleDownload(relativePath, filename) {
    try {
      const response = await fetch(`${API_BASE}/api/download/${relativePath}`, {
        headers: AUTH_HEADERS,
      });

      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }

      const blob = await response.blob();

      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");

      a.href = url;

      a.download = filename;

      a.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage({
        tone: "error",
        text: err.message,
      });
    }
  }

  // ==========================================================
  // TOTAL FILE SIZE
  // ==========================================================

  const totalSize = files.reduce((sum, f) => sum + (f.size_bytes || 0), 0);

  const selectedSize = files.reduce(
    (sum, f) => (selected.has(f.relative_path) ? sum + (f.size_bytes || 0) : sum),
    0,
  );

  const allSelected = files.length > 0 && selected.size === files.length;

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="dashboard-page">
      {/* ====================================================
          MUSIC SCRAPER
      ==================================================== */}

      <section className="music-scraper-card">
        <div className="music-scraper-header">
          <div>
            <div className="music-title-row">
              <div className="music-icon">
                <Music size={18} />
              </div>

              <div>
                <h2>Music Web Scraper</h2>

                <p>
                  Scan a music webpage, select songs and download them to your
                  collection.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="music-scraper-form">
          {/* WEBSITE */}

          <label className="music-field music-field-url">
            <span>Website URL</span>

            <input
              type="url"
              value={musicUrl}
              onChange={(e) => setMusicUrl(e.target.value)}
              placeholder="https://example.com/album-page"
            />
          </label>

          {/* LANGUAGE */}

          <label className="music-field">
            <span>Language</span>

            <select
              value={musicLanguage}
              onChange={(e) => setMusicLanguage(e.target.value)}
            >
              <option>Telugu</option>

              <option>Tamil</option>

              <option>Hindi</option>

              <option>Kannada</option>

              <option>Malayalam</option>

              <option>English</option>

              <option>Other</option>
            </select>
          </label>

          {/* QUALITY */}

          <label className="music-field">
            <span>Quality</span>

            <select
              value={musicQuality}
              onChange={(e) => setMusicQuality(e.target.value)}
            >
              <option value="HQ">HQ</option>

              <option value="NORMAL">Normal</option>

              <option value="ALL">All versions</option>
            </select>
          </label>

          {/* DESTINATION */}

          <label className="music-field music-field-destination">
            <span>Destination</span>

            <input
              type="text"
              value={musicDestination}
              onChange={(e) => setMusicDestination(e.target.value)}
              placeholder="Music/Telugu"
            />
          </label>

          {/* SCAN */}

          <button
            className="music-scan-btn"
            onClick={handleScrapeMusic}
            disabled={scraping}
          >
            {scraping ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Search size={16} />
            )}

            {scraping ? "Scanning..." : "Scan Songs"}
          </button>
        </div>

        {/* ==================================================
            SONG RESULTS
        ================================================== */}

        {musicSongs.length > 0 && (
          <div className="music-results">
            <div className="music-results-header">
              <div>
                <h3>{musicAlbum || "Songs"}</h3>

                <span>
                  {musicSongs.length} song(s) found · {selectedSongs.size}{" "}
                  selected
                </span>
              </div>

              <div className="music-result-actions">
                <button onClick={selectAllSongs}>
                  <Check size={13} />
                  Select all
                </button>

                <button onClick={clearSongs}>Clear</button>
              </div>
            </div>

            <div className="music-song-list">
              {musicSongs.map((song, index) => {
                const checked = selectedSongs.has(index);

                return (
                  <label
                    key={`${song.url}-${index}`}
                    className={`music-song-row ${checked ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSong(index)}
                    />

                    <div className="music-song-index">
                      {String(index + 1).padStart(2, "0")}
                    </div>

                    <div className="music-song-info">
                      <div className="music-song-title">{song.title}</div>

                      <div className="music-song-url">{song.url}</div>
                    </div>

                    <span
                      className={`music-quality-badge ${
                        song.quality === "HQ" ? "hq" : "normal"
                      }`}
                    >
                      {song.quality}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* DOWNLOAD */}

            <div className="music-download-bar">
              <span>{selectedSongs.size} song(s) selected</span>

              <button
                className="music-download-btn"
                onClick={handleDownloadMusic}
                disabled={downloadingMusic || selectedSongs.size === 0}
              >
                {downloadingMusic ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <Download size={16} />
                )}

                {downloadingMusic ? "Downloading..." : "Download Selected"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ====================================================
          EXISTING TOOLBAR
      ==================================================== */}

      <div className="dashboard-toolbar">
        <div className="dashboard-toolbar-left">
          <button
            className="dash-btn dash-btn-primary"
            onClick={handleFetch}
            disabled={fetching}
          >
            {fetching ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Download size={16} />
            )}

            {fetching ? "Fetching..." : "Fetch"}
          </button>

          <button
            className="dash-btn"
            onClick={handleCollect}
            disabled={collecting}
          >
            {collecting ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Sparkles size={16} />
            )}

            {collecting ? "Running..." : "Execute Collector Script"}
          </button>
        </div>

        <button
          className="dash-btn dash-btn-config"
          onClick={() => setConfigOpen(true)}
        >
          <Settings size={16} />
          Config
        </button>
      </div>

      {/* ====================================================
          CONFIG SUMMARY
      ==================================================== */}

      <p className="dashboard-config-summary">
        {config.sourceUrls.trim().split("\n").filter(Boolean).length} direct
        source URL(s) · Destination:{" "}
        <code>{config.destinationDir.trim() || "Downloads/ (auto-named)"}</code>{" "}
        · Move/copy to:{" "}
        <code>{config.moveDestination.trim() || "not set"}</code>
      </p>

      {/* ====================================================
          MESSAGE
      ==================================================== */}

      {message && (
        <div className={`dashboard-message dashboard-message-${message.tone}`}>
          {message.text}
        </div>
      )}

      {/* ====================================================
          DOWNLOADS
      ==================================================== */}

      <div className="dashboard-section-head">
        <h3>Downloads folder</h3>

        <span className="dashboard-section-meta">
          {files.length} file(s)
          {" · "}
          {formatSize(totalSize)}
        </span>

        {files.length > 0 && (
          <button className="dashboard-select-all" onClick={toggleSelectAll}>
            {allSelected ? <Square size={13} /> : <CheckSquare size={13} />}
            {allSelected ? "Clear all" : "Select all"}
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="selection-bar">
          <div className="selection-bar-count">
            <CheckSquare size={15} />
            <strong>{selected.size}</strong> selected
            <span>{formatSize(selectedSize)}</span>
          </div>

          <label className="selection-bar-destination">
            <span>Destination</span>
            <input
              type="text"
              value={organizeDestination}
              onChange={(e) => setOrganizeDestination(e.target.value)}
              placeholder="Archive, or Music/Sorted"
            />
          </label>

          <div className="selection-bar-actions">
            <button
              className="selection-btn selection-btn-copy"
              onClick={() => requestOrganize("copy")}
              disabled={organizing}
            >
              {organizing ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Copy size={14} />
              )}
              Copy
            </button>

            <button
              className={`selection-btn selection-btn-move${confirmMove ? " selection-btn-confirm" : ""}`}
              onClick={() => requestOrganize("move")}
              disabled={organizing}
              title={
                confirmMove
                  ? "Click again to confirm — files leave their current folder"
                  : "Move selected files"
              }
            >
              {confirmMove ? <AlertTriangle size={14} /> : <Move size={14} />}
              {confirmMove ? "Confirm move" : "Move"}
            </button>

            <button
              className="selection-btn selection-btn-clear"
              onClick={() => setSelected(new Set())}
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {organizeResults && (
        <div className="dashboard-message dashboard-message-error">
          <strong>Some files could not be transferred:</strong>
          <ul className="organize-failure-list">
            {organizeResults.map((r) => (
              <li key={r.path}>
                {r.path} — {r.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {filesError && (
        <p className="dashboard-message dashboard-message-error">
          {filesError}
        </p>
      )}

      {!filesError && (
        <FolderTree
          files={files}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleMany={toggleMany}
          onDownload={handleDownload}
        />
      )}

      {loadingFiles && <p className="dashboard-loading-hint">Refreshing…</p>}

      {/* CONFIG */}

      <ConfigModal
        open={configOpen}
        config={config}
        onClose={() => setConfigOpen(false)}
        onSave={saveConfig}
      />
    </div>
  );
}
