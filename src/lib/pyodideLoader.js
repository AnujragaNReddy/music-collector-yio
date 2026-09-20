// Loads Pyodide (real CPython compiled to WebAssembly) from its official CDN.
// This is what makes "run Python + install libraries" possible without any
// backend at all: the interpreter runs entirely in the visitor's own browser
// tab, so there is no server-side code execution to secure or exploit.
const PYODIDE_VERSION = '0.26.4';
const CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodidePromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const tag = document.createElement('script');
    tag.src = src;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(tag);
  });
}

export function getPyodide() {
  if (!pyodidePromise) {
    pyodidePromise = loadScript(`${CDN_BASE}pyodide.js`).then(() =>
      window.loadPyodide({ indexURL: CDN_BASE })
    );
  }
  return pyodidePromise;
}
