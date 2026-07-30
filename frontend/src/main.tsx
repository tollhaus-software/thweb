import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.tsx'

// Global error logger to display runtime errors on the page
window.addEventListener('error', (event) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 20px; color: #ff3333; background: #fee; border: 1px solid #fcc; border-radius: 4px; font-family: monospace; margin: 20px;">
        <h3>🔴 Runtime Error</h3>
        <p><strong>Message:</strong> ${event.message}</p>
        <p><strong>Source:</strong> ${event.filename}:${event.lineno}:${event.colno}</p>
        <pre style="white-space: pre-wrap; margin-top: 10px;">${event.error?.stack || ''}</pre>
      </div>
    `;
  }
});

declare global {
  interface Window {
    ENV?: {
      GOOGLE_CLIENT_ID?: string;
    };
  }
}

const clientId = window.ENV?.GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID || 'mock';

const rootElement = (
  <StrictMode>
    {clientId && clientId !== 'mock' ? (
      <GoogleOAuthProvider clientId={clientId}>
        <App />
      </GoogleOAuthProvider>
    ) : (
      <App />
    )}
  </StrictMode>
)

createRoot(document.getElementById('root')!).render(rootElement)
