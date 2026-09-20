import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import './CodeEditor.css';

export default function CodeEditor({ value, onChange, locked = false }) {
  return (
    <div className={`code-editor${locked ? ' code-editor-locked' : ''}`}>
      <CodeMirror
        value={value}
        height="100%"
        theme="dark"
        extensions={[python()]}
        onChange={onChange}
        readOnly={locked}
        editable={!locked}
        basicSetup={{ lineNumbers: true, tabSize: 4 }}
      />
    </div>
  );
}
