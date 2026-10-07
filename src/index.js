import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { AuthProvider, RequireAuth, useAuth } from './useAuth';
import { setTokenProvider } from './pages/HomePage';

// Create React App, not Vite, so the variable is REACT_APP_* and read from
// process.env rather than import.meta.env. Same idea either way: sign-in
// stays off until this is set, mirroring the backend refusing to enforce it
// until AUTH_ISSUER is set, so deploying ahead of the auth service changes
// nothing.
const AUTH_URL = process.env.REACT_APP_AUTH_URL;

/** Hands the live access token to the API layer, which is not a hook. */
function AuthBridge({ children }) {
  const { getToken } = useAuth();
  setTokenProvider(getToken);
  return children;
}

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    {AUTH_URL ? (
      <AuthProvider issuer={AUTH_URL} client="music-collector">
        <AuthBridge>
          <RequireAuth fallback={<p className="auth-loading">Checking your session…</p>}>
            <App />
          </RequireAuth>
        </AuthBridge>
      </AuthProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
