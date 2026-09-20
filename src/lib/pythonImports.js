// Best-effort static scan for top-level `import x` / `from x import y`
// statements, so Run can auto-install whatever the script needs instead of
// making the user type package names in separately.
const IMPORT_RE = /^\s*import\s+([a-zA-Z_][\w.]*)/gm;
const FROM_RE = /^\s*from\s+([a-zA-Z_][\w.]*)\s+import/gm;

// Import name -> actual PyPI/Pyodide package name, for the common cases
// where they differ.
export const IMPORT_TO_PACKAGE = {
  bs4: 'beautifulsoup4',
  PIL: 'pillow',
  cv2: 'opencv-python',
  sklearn: 'scikit-learn',
  yaml: 'pyyaml',
  dateutil: 'python-dateutil',
};

export function extractTopLevelImports(code) {
  const names = new Set();
  let m;
  IMPORT_RE.lastIndex = 0;
  FROM_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(code))) names.add(m[1].split('.')[0]);
  while ((m = FROM_RE.exec(code))) names.add(m[1].split('.')[0]);
  return [...names];
}
