import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PyodideProvider } from './store/PyodideContext';
import NavBar from './components/NavBar';
import HomePage from './pages/HomePage';
import PythonEditorPage from './pages/PythonEditorPage';

function Shell() {
  return (
    <div className="app-shell">
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor" element={<PythonEditorPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <PyodideProvider>
        <Shell />
      </PyodideProvider>
    </BrowserRouter>
  );
}
