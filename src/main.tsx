import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { isViewHash } from './io/share';
import ViewPage from './ViewPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isViewHash(window.location.hash) ? <ViewPage /> : <App />}
  </StrictMode>,
);

// Switching between a view link and the editor in the same tab: start fresh.
window.addEventListener('hashchange', () => window.location.reload());
