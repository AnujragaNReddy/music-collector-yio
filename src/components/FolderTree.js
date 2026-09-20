import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FileText, Download } from 'lucide-react';
import { formatSize } from '../lib/format';
import './FolderTree.css';

function buildTree(files) {
  const root = { name: '', path: '', type: 'dir', children: new Map() };

  for (const file of files) {
    const parts = file.relative_path.split('/');
    let node = root;
    let pathSoFar = '';

    parts.forEach((part, i) => {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
      const isFile = i === parts.length - 1;

      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          path: pathSoFar,
          type: isFile ? 'file' : 'dir',
          size: isFile ? file.size_bytes : undefined,
          children: new Map(),
        });
      }
      node = node.children.get(part);
    });
  }

  return root;
}

function sortedChildren(node) {
  return [...node.children.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function collectFilePaths(node, acc = []) {
  if (node.type === 'file') {
    acc.push(node.path);
    return acc;
  }
  for (const child of node.children.values()) collectFilePaths(child, acc);
  return acc;
}

function TreeItem({ node, depth, selected, onToggleSelect, onToggleMany, onDownload }) {
  const [open, setOpen] = useState(true);
  const indent = { paddingLeft: 10 + depth * 18 };

  if (node.type === 'file') {
    const isSelected = selected.has(node.path);
    return (
      <div className={`tree-row tree-file${isSelected ? ' tree-row-selected' : ''}`} style={indent}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(node.path)}
        />
        <FileText size={14} className="tree-icon" />
        <span className="tree-name">{node.name}</span>
        <span className="tree-size">{formatSize(node.size)}</span>
        <button className="tree-download" onClick={() => onDownload(node.path, node.name)} title="Download">
          <Download size={13} />
        </button>
      </div>
    );
  }

  const children = sortedChildren(node);
  const filePaths = collectFilePaths(node);
  const selectedCount = filePaths.filter((p) => selected.has(p)).length;
  const allSelected = filePaths.length > 0 && selectedCount === filePaths.length;

  return (
    <div className="tree-dir">
      <div className="tree-row tree-folder" style={indent}>
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = selectedCount > 0 && !allSelected;
          }}
          onChange={() => onToggleMany(filePaths, !allSelected)}
        />
        <span className="tree-folder-label" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={14} className="tree-icon tree-icon-folder" />
          <span className="tree-name">{node.name}</span>
          <span className="tree-count">
            {selectedCount > 0 ? `${selectedCount}/${filePaths.length}` : filePaths.length}
          </span>
        </span>
      </div>
      {open && children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selected={selected}
          onToggleSelect={onToggleSelect}
          onToggleMany={onToggleMany}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
}

export default function FolderTree({ files, selected, onToggleSelect, onToggleMany, onDownload }) {
  const root = useMemo(() => buildTree(files), [files]);
  const children = sortedChildren(root);

  if (children.length === 0) {
    return <p className="tree-empty">Nothing here yet — use Fetch or Execute Collector Script above.</p>;
  }

  return (
    <div className="folder-tree">
      {children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={0}
          selected={selected}
          onToggleSelect={onToggleSelect}
          onToggleMany={onToggleMany}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
}
