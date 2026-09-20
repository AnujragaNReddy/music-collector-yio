import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Download, Trash2, FileText, RefreshCw, FolderDown, Loader2, Server } from 'lucide-react';
import { usePyodide } from '../store/PyodideContext';
import './FilesPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';
const API_KEY = process.env.REACT_APP_API_KEY || '';
const FETCH_API_URL = `${API_BASE}/api/fetch`;
const AUTH_HEADERS = API_KEY ? { 'X-API-Key': API_KEY } : {};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPage() {
  const { status, files, writeFile, readFile, deleteFile, refreshFiles, homeDir } = usePyodide();
  const inputRef = useRef(null);
  const ready = status === 'ready';

  const [urlsText, setUrlsText] = useState('');
  const [folderName, setFolderName] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState(null);
  const [fetchError, setFetchError] = useState('');

  const [batches, setBatches] = useState([]);
  const [batchesError, setBatchesError] = useState('');
  const [loadingBatches, setLoadingBatches] = useState(false);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    setBatchesError('');
    try {
      const response = await fetch(`${API_BASE}/api/files`, { headers: AUTH_HEADERS });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const data = await response.json();
      setBatches(data.batches || []);
    } catch {
      setBatchesError(`Could not reach the backend at ${API_BASE}.`);
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  async function handleUpload(e) {
    const selected = Array.from(e.target.files || []);
    for (const file of selected) {
      const buffer = new Uint8Array(await file.arrayBuffer());
      writeFile(file.name, buffer);
    }
    e.target.value = '';
  }

  async function handleFetchFiles(e) {
    e.preventDefault();
    const urls = urlsText.split('\n').map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) return;

    setFetching(true);
    setFetchError('');
    setFetchResult(null);
    try {
      const response = await fetch(FETCH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
        body: JSON.stringify({ urls, folder_name: folderName.trim() || undefined }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || `Request failed (${response.status})`);
      }
      const data = await response.json();
      setFetchResult(data);
      loadBatches();
    } catch (err) {
      setFetchError(
        err.message === 'Failed to fetch'
          ? `Could not reach the backend at ${FETCH_API_URL}. Is python-backend/server.py running (uvicorn server:app --reload)?`
          : err.message
      );
    } finally {
      setFetching(false);
    }
  }

  function handleDownload(name) {
    const data = readFile(name);
    if (!data) return;
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleServerDownload(relativePath, filename) {
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
      setBatchesError(err.message);
    }
  }

  return (
    <div className="files-page">
      <div className="files-toolbar">
        <button className="upload-btn" onClick={() => inputRef.current?.click()} disabled={!ready}>
          <Upload size={16} /> Upload file
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={handleUpload} />
        <button className="icon-btn" onClick={refreshFiles} disabled={!ready} title="Refresh">
          <RefreshCw size={16} />
        </button>
        <span className="files-path">{homeDir}</span>
      </div>

      <p className="files-desc">
        Files uploaded here are written into the Python sandbox's own filesystem — your code can{' '}
        <code>open("filename.ext")</code> them directly. Anything your script writes shows up here too.
      </p>

      <div className="fetch-panel">
        <h3 className="fetch-panel-title"><FolderDown size={16} /> Fetch files from URLs</h3>
        <p className="fetch-panel-desc">
          Paste direct file URLs (one per line) — images, .csv, .xlsx, .docx, or your own hosted media.
          A local backend (<code>python-backend/server.py</code>) downloads each one to a real folder on
          disk, sorted by type, with a <code>metadata.json</code> summary. Start it with{' '}
          <code>uvicorn server:app --reload</code> from the <code>python-backend</code> folder.
        </p>
        <p className="fetch-panel-desc">
          Destination can be a plain name (<code>Songs</code>), a nested path (<code>Songs/Telugu</code>),
          or — only if that backend was started with <code>ALLOW_ABSOLUTE_PATHS=true</code> — a full local
          path (<code>D:\Music\Collection</code>). Absolute paths only work when you run the backend
          yourself; they're rejected on the public deployment.
        </p>
        <form onSubmit={handleFetchFiles} className="fetch-form">
          <textarea
            className="fetch-urls-input"
            placeholder={'https://example.com/report.pdf\nhttps://example.com/photo.jpg'}
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            rows={4}
            disabled={fetching}
          />
          <div className="fetch-form-row">
            <input
              className="fetch-folder-input"
              placeholder="Destination folder or path (optional)"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              disabled={fetching}
            />
            <button type="submit" className="fetch-btn" disabled={fetching || !urlsText.trim()}>
              {fetching ? <Loader2 size={16} className="spin" /> : <FolderDown size={16} />}
              {fetching ? 'Fetching...' : 'Fetch files'}
            </button>
          </div>
        </form>

        {fetchError && <p className="fetch-error">{fetchError}</p>}

        {fetchResult && (
          <div className="fetch-result">
            <p>
              {fetchResult.total_success} of {fetchResult.total_requested} file(s) downloaded to{' '}
              <code>{fetchResult.folder}</code>
              {fetchResult.total_failed > 0 && ` (${fetchResult.total_failed} failed)`}.
              {fetchResult.browsable_in_files_page === false &&
                ' This path is outside the backend\u2019s Downloads folder, so it won\u2019t show up below — check it directly on disk.'}
            </p>
            {fetchResult.files?.length > 0 && (
              <ul className="fetch-result-list">
                {fetchResult.files.map((f) => (
                  <li key={f.location}>
                    <span className="fetch-result-category">{f.category}</span> {f.filename} ({formatSize(f.size_bytes)})
                  </li>
                ))}
              </ul>
            )}
            {fetchResult.errors?.length > 0 && (
              <ul className="fetch-result-list fetch-result-errors">
                {fetchResult.errors.map((e) => (
                  <li key={e.url}>{e.url} — {e.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="fetch-panel">
        <h3 className="fetch-panel-title"><Server size={16} /> Files on the server</h3>
        <p className="fetch-panel-desc">
          These live on the backend's own disk, not in your browser — download the ones you want to keep.
          {' '}On a hosted deployment this disk is ephemeral and clears on redeploy, so grab anything important.
        </p>

        <button className="icon-btn" onClick={loadBatches} disabled={loadingBatches} title="Refresh">
          {loadingBatches ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
        </button>

        {batchesError && <p className="fetch-error">{batchesError}</p>}

        {!batchesError && batches.length === 0 && (
          <p className="files-empty">No fetched batches yet — use the panel above to pull some files.</p>
        )}

        {batches.map((batch) => (
          <div key={batch.folder_name} className="server-batch">
            <p className="server-batch-name">{batch.folder_name} <span>({batch.total_success} file(s))</span></p>
            <ul className="fetch-result-list">
              {batch.files.map((f) => (
                <li key={f.relative_path}>
                  <span className="fetch-result-category">{f.folder || 'root'}</span>
                  {f.filename} ({formatSize(f.size_bytes)})
                  <button
                    type="button"
                    className="server-file-download"
                    onClick={() => handleServerDownload(f.relative_path, f.filename)}
                  >
                    <Download size={13} /> Download
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h3 className="files-section-title">In-browser sandbox files</h3>

      {!ready && <p className="files-empty">Waiting for the Python runtime to load...</p>}

      {ready && files.length === 0 && (
        <p className="files-empty">No files yet — upload one, or write one from a running script.</p>
      )}

      {ready && files.length > 0 && (
        <div className="files-list">
          {files.map((f) => (
            <div key={f.name} className="file-row">
              <FileText size={18} />
              <span className="file-name">{f.name}</span>
              <span className="file-size">{formatSize(f.size)}</span>
              <button className="icon-btn" onClick={() => handleDownload(f.name)} title="Download">
                <Download size={15} />
              </button>
              <button className="icon-btn" onClick={() => deleteFile(f.name)} title="Delete">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
