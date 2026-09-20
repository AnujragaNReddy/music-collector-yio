import { Link, useLocation } from 'react-router-dom';
import { Code2, FolderOpen } from 'lucide-react';
import { usePyodide } from '../store/PyodideContext';
import './NavBar.css';

export default function NavBar() {
  const { pathname } = useLocation();
  const { status } = usePyodide();

  return (
    <header className="nav-bar">
      <div className="nav-brand">
        <Code2 size={20} />
        <span>Music Collector</span>
      </div>
      <nav className="nav-links">
        <Link to="/" className={pathname === '/' ? 'active' : ''}>Home</Link>
        <Link to="/files" className={pathname === '/files' ? 'active' : ''}>
          <FolderOpen size={15} /> Files
        </Link>
      </nav>
      <div className={`runtime-status runtime-${status}`}>
        <span className="runtime-dot" />
        {status === 'loading' && 'Loading Python runtime...'}
        {status === 'ready' && 'Python ready'}
        {status === 'error' && 'Runtime failed to load'}
      </div>
    </header>
  );
}
