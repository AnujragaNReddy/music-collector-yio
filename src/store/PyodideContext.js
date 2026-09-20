import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getPyodide } from '../lib/pyodideLoader';
import { extractTopLevelImports, IMPORT_TO_PACKAGE } from '../lib/pythonImports';

const PyodideContext = createContext(null);

export function PyodideProvider({ children }) {
  const pyodideRef = useRef(null);
  const stdlibRef = useRef(new Set());
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState('');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState([]); // [{ type: 'stdout' | 'stderr' | 'info', text }]
  const [installedPackages, setInstalledPackages] = useState([]);
  const [installing, setInstalling] = useState(false);
  const [files, setFiles] = useState([]);
  const homeDirRef = useRef('/home/pyodide');

  useEffect(() => {
    let cancelled = false;
    getPyodide()
      .then((pyodide) => {
        if (cancelled) return;
        pyodideRef.current = pyodide;
        try {
          homeDirRef.current = pyodide.FS.cwd();
        } catch {
          /* fall back to the default guessed above */
        }
        try {
          const names = pyodide.runPython('import sys; list(sys.stdlib_module_names)').toJs();
          stdlibRef.current = new Set(names);
        } catch {
          /* if this fails we just attempt to install a few extra harmless
             built-ins — not worth failing startup over */
        }
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message || 'Failed to load the Python runtime.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const appendOutput = useCallback((type, text) => {
    if (!text) return;
    setOutput((prev) => [...prev, { type, text }]);
  }, []);

  const refreshFiles = useCallback(() => {
    const pyodide = pyodideRef.current;
    if (!pyodide) return;
    try {
      const dir = homeDirRef.current;
      const names = pyodide.FS.readdir(dir).filter((n) => n !== '.' && n !== '..');
      const list = names
        .map((name) => {
          try {
            const stat = pyodide.FS.stat(`${dir}/${name}`);
            if (!pyodide.FS.isFile(stat.mode)) return null;
            return { name, size: stat.size };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      setFiles(list);
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    if (status === 'ready') refreshFiles();
  }, [status, refreshFiles]);

  // Two-tier install: Pyodide's own curated WASM builds first (faster, and
  // covers packages with native code like numpy that plain pip can't build
  // for the browser), falling back to micropip for the long tail of
  // pure-Python PyPI packages.
  const ensurePackage = useCallback(async (pkg) => {
    const pyodide = pyodideRef.current;
    if (!pyodide) return false;
    try {
      await pyodide.loadPackage(pkg);
      setInstalledPackages((prev) => (prev.includes(pkg) ? prev : [...prev, pkg]));
      return true;
    } catch {
      try {
        await pyodide.loadPackage('micropip');
        const micropip = pyodide.pyimport('micropip');
        await micropip.install(pkg);
        setInstalledPackages((prev) => (prev.includes(pkg) ? prev : [...prev, pkg]));
        return true;
      } catch (err) {
        appendOutput('stderr', `Could not install "${pkg}": ${err?.message || err}`);
        return false;
      }
    }
  }, [appendOutput]);

  const runCode = useCallback(async (code) => {
    const pyodide = pyodideRef.current;
    if (!pyodide || running) return;
    setRunning(true);
    setOutput([]);

    // Auto-install whatever the script imports that isn't already available,
    // so clicking Run is enough — no separate manual install step needed.
    const candidates = extractTopLevelImports(code)
      .filter((name) => !stdlibRef.current.has(name))
      .map((name) => IMPORT_TO_PACKAGE[name] || name)
      .filter((pkg) => !installedPackages.includes(pkg));

    for (const pkg of [...new Set(candidates)]) {
      appendOutput('info', `Checking dependency "${pkg}"...`);
      await ensurePackage(pkg);
    }

    pyodide.setStdout({ batched: (msg) => appendOutput('stdout', msg) });
    pyodide.setStderr({ batched: (msg) => appendOutput('stderr', msg) });
    try {
      await pyodide.runPythonAsync(code);
    } catch (err) {
      appendOutput('stderr', err?.message || String(err));
    } finally {
      setRunning(false);
      refreshFiles();
    }
  }, [running, installedPackages, ensurePackage, appendOutput, refreshFiles]);

  const installPackage = useCallback(async (name) => {
    const cleanName = name.trim();
    if (!cleanName || installing) return { success: false, message: 'Nothing to install.' };
    setInstalling(true);
    appendOutput('info', `Installing "${cleanName}"...`);
    const success = await ensurePackage(cleanName);
    if (success) appendOutput('info', `Installed "${cleanName}".`);
    setInstalling(false);
    return { success };
  }, [installing, ensurePackage, appendOutput]);

  const writeFile = useCallback((name, data) => {
    const pyodide = pyodideRef.current;
    if (!pyodide) return;
    pyodide.FS.writeFile(`${homeDirRef.current}/${name}`, data);
    refreshFiles();
  }, [refreshFiles]);

  const readFile = useCallback((name) => {
    const pyodide = pyodideRef.current;
    if (!pyodide) return null;
    return pyodide.FS.readFile(`${homeDirRef.current}/${name}`);
  }, []);

  const deleteFile = useCallback((name) => {
    const pyodide = pyodideRef.current;
    if (!pyodide) return;
    pyodide.FS.unlink(`${homeDirRef.current}/${name}`);
    refreshFiles();
  }, [refreshFiles]);

  const clearOutput = useCallback(() => setOutput([]), []);

  const value = {
    status,
    loadError,
    running,
    output,
    clearOutput,
    runCode,
    installPackage,
    installing,
    installedPackages,
    files,
    refreshFiles,
    writeFile,
    readFile,
    deleteFile,
    homeDir: homeDirRef.current,
  };

  return <PyodideContext.Provider value={value}>{children}</PyodideContext.Provider>;
}

export function usePyodide() {
  const ctx = useContext(PyodideContext);
  if (!ctx) throw new Error('usePyodide must be used within PyodideProvider');
  return ctx;
}
