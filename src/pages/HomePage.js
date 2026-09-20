import { useCallback, useEffect, useState } from 'react';
import { Download, Settings, Sparkles, Loader2, Copy, Move, X } from 'lucide-react';
import ConfigModal from '../components/ConfigModal';
import FolderTree from '../components/FolderTree';
import { formatSize } from '../lib/format';
import './HomePage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';
const API_KEY = process.env.REACT_APP_API_KEY || '';
const AUTH_HEADERS = API_KEY ? { 'X-API-Key': API_KEY } : {};

const CONFIG_STORAGE_KEY = 'music-collector-config';
const DEFAULT_CONFIG = { sourceUrls: '', destinationDir: '', moveDestination: '' };

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function parseErrorDetail(response) {
  const detail = await response.json().catch(() => null);
  return detail?.detail || `Request failed (${response.status})`;
}

export default function HomePage() {
  const [config, setConfig] = useState(loadConfig);
  const [configOpen, setConfigOpen] = useState(false);

  const [files, setFiles] = useState([]);
  const [filesError, setFilesError] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [selected, setSelected] = useState(new Set());

  const [fetching, setFetching] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [message, setMessage] = useState(null); // { tone: 'ok' | 'error', text }

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    setFilesError('');
    try {
      const response = await fetch(`${API_BASE}/api/files`, { headers: AUTH_HEADERS });
      if (!response.ok) throw new Error(await parseErrorDetail(response));
      const data = await response.json();
      setFiles(data.files || []);
    } catch (err) {
      setFilesError(
        err.message === 'Failed to fetch' ? `Could not reach the backend at ${API_BASE}.` : err.message
      );
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  function saveConfig(next) {
    setConfig(next);
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable (private mode, etc.) — config still works for this session
    }
  }

  async function handleFetch() {
    const urls = config.sourceUrls.split('\n').map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) {
      setMessage({ tone: 'error', text: 'No source URLs configured — open Config and add some first.' });
      return;
    }

    setFetching(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
        body: JSON.stringify({ urls, folder_name: config.destinationDir.trim() || undefined }),
      });
      if (!response.ok) throw new Error(await parseErrorDetail(response));
      const data = await response.json();
      setMessage({
        tone: 'ok',
        text: `Fetched ${data.total_success} of ${data.total_requested} file(s) into ${data.folder}${
          data.total_failed ? ` (${data.total_failed} failed)` : ''
        }.`,
      });
      loadFiles();
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setFetching(false);
    }
  }

  async function handleCollect() {
    setCollecting(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
        body: JSON.stringify({ source: config.destinationDir.trim() || undefined }),
      });
      if (!response.ok) throw new Error(await parseErrorDetail(response));
      const data = await response.json();
      setMessage({
        tone: 'ok',
        text: `Collector organized ${data.total_songs} song(s) into ${data.collection_folder}.`,
      });
      loadFiles();
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setCollecting(false);
    }
  }

  async function handleOrganize(action) {
    if (selected.size === 0) return;
    if (!config.moveDestination.trim()) {
      setMessage({ tone: 'error', text: 'No move/copy destination configured — open Config and set one first.' });
      return;
    }

    setOrganizing(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/organize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
        body: JSON.stringify({ paths: [...selected], destination: config.moveDestination.trim(), action }),
      });
      if (!response.ok) throw new Error(await parseErrorDetail(response));
      const data = await response.json();
      const ok = data.results.filter((r) => r.success).length;
      setMessage({
        tone: 'ok',
        text: `${action === 'move' ? 'Moved' : 'Copied'} ${ok} of ${data.results.length} file(s) to ${data.destination}.`,
      });
      setSelected(new Set());
      loadFiles();
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setOrganizing(false);
    }
  }

  function toggleSelect(path) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function handleDownload(relativePath, filename) {
    try {
      const response = await fetch(`${API_BASE}/api/download/${relativePath}`, { headers: AUTH_HEADERS });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    }
  }

  const totalSize = files.reduce((sum, f) => sum + f.size_bytes, 0);

  return (
    <div className="dashboard-page">
      <div className="dashboard-toolbar">
        <div className="dashboard-toolbar-left">
          <button className="dash-btn dash-btn-primary" onClick={handleFetch} disabled={fetching}>
            {fetching ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
            {fetching ? 'Fetching...' : 'Fetch'}
          </button>
          <button className="dash-btn" onClick={handleCollect} disabled={collecting}>
            {collecting ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            {collecting ? 'Running...' : 'Execute Collector Script'}
          </button>
        </div>
        <button className="dash-btn dash-btn-config" onClick={() => setConfigOpen(true)}>
          <Settings size={16} /> Config
        </button>
      </div>

      <p className="dashboard-config-summary">
        {config.sourceUrls.trim().split('\n').filter(Boolean).length} source URL(s) ·{' '}
        Destination: <code>{config.destinationDir.trim() || 'Downloads/ (auto-named)'}</code> ·{' '}
        Move/copy to: <code>{config.moveDestination.trim() || 'not set'}</code>
      </p>

      {message && (
        <div className={`dashboard-message dashboard-message-${message.tone}`}>{message.text}</div>
      )}

      <div className="dashboard-section-head">
        <h3>Downloads folder</h3>
        <span className="dashboard-section-meta">
          {files.length} file(s) · {formatSize(totalSize)}
        </span>

        {selected.size > 0 && (
          <div className="dashboard-selection-actions">
            <span>{selected.size} selected</span>
            <button onClick={() => handleOrganize('copy')} disabled={organizing}>
              <Copy size={13} /> Copy
            </button>
            <button onClick={() => handleOrganize('move')} disabled={organizing}>
              <Move size={13} /> Move
            </button>
            <button onClick={() => setSelected(new Set())} title="Clear selection">
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {filesError && <p className="dashboard-message dashboard-message-error">{filesError}</p>}

      {!filesError && (
        <FolderTree
          files={files}
          selected={selected}
          onToggleSelect={toggleSelect}
          onDownload={handleDownload}
        />
      )}

      {loadingFiles && <p className="dashboard-loading-hint">Refreshing…</p>}

      <ConfigModal
        open={configOpen}
        config={config}
        onClose={() => setConfigOpen(false)}
        onSave={saveConfig}
      />
    </div>
  );
}
