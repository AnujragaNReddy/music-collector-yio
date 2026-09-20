import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PyodideProvider } from './store/PyodideContext';
import NavBar from './components/NavBar';
import HomePage from './pages/HomePage';
import FilesPage from './pages/FilesPage';

function Shell() {
  return (
    <div className="app-shell">
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/files" element={<FilesPage />} />
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
