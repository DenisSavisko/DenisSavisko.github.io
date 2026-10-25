import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './debugLog';
import App from './App';
import './index.css';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
