import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Automatically update the Service Worker and reload when a new deployment takes control.
// Also check for updates periodically (every 60 minutes) and whenever the app/tab returns to the foreground.
const SW_UPDATE_INTERVAL_MS = 60 * 60 * 1000;
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(() => {
      void registration.update();
    }, SW_UPDATE_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void registration.update();
      }
    });
  },
});

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
      GOOGLE_PROTECTED_DATA_CLIENT_ID?: string;
      APP_TITLE?: string;
      APP_LOGO_URL?: string;
      APP_FAVICON_URL?: string;
    };
  }
}

const protectedDataClientId =
  window.ENV?.GOOGLE_PROTECTED_DATA_CLIENT_ID ||
  import.meta.env.VITE_GOOGLE_PROTECTED_DATA_CLIENT_ID ||
  'mock-protected-data';

const rootElement = (
  <StrictMode>
    <GoogleOAuthProvider clientId={protectedDataClientId}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>
)

createRoot(document.getElementById('root')!).render(rootElement)
