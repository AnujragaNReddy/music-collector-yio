import { useEffect, useRef, useState } from 'react';
import { Trash2, Copy, Check } from 'lucide-react';
import './OutputConsole.css';

export default function OutputConsole({ output, onClear }) {
  const bottomRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [output]);

  async function handleCopy() {
    const text = output.map((line) => line.text).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard permission denied or unavailable — nothing to fall back to */
    }
  }

  return (
    <div className="output-console">
      <div className="output-console-head">
        <span>Output</span>
        <div className="output-console-actions">
          <button className="output-action" onClick={handleCopy} disabled={output.length === 0} title="Copy output">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="output-action" onClick={onClear} disabled={output.length === 0} title="Clear output">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="output-console-body">
        {output.length === 0 && <p className="output-empty">Run your code to see output here.</p>}
        {output.map((line, i) => (
          <pre key={i} className={`output-line output-${line.type}`}>{line.text}</pre>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
