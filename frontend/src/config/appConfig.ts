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

export interface AppConfig {
  title?: string;
  logoUrl?: string;
  faviconUrl?: string;
}

export function getAppConfig(): AppConfig {
  const env = typeof window !== 'undefined' ? window.ENV : undefined;
  const title = env?.APP_TITLE || (import.meta.env.VITE_APP_TITLE as string | undefined) || undefined;
  const logoUrl = env?.APP_LOGO_URL || (import.meta.env.VITE_APP_LOGO_URL as string | undefined) || undefined;
  const faviconUrl = env?.APP_FAVICON_URL || (import.meta.env.VITE_APP_FAVICON_URL as string | undefined) || undefined;
  return { title, logoUrl, faviconUrl };
}

export function isMockAuthMode(): boolean {
  const env = typeof window !== 'undefined' ? window.ENV : undefined;
  const clientId = env?.GOOGLE_CLIENT_ID || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined);
  if (clientId) {
    return clientId === 'mock';
  }
  // In production builds, if /env-config.js has not populated GOOGLE_CLIENT_ID (e.g. blocked before gateway reload),
  // real OAuth proxy authentication is active rather than developer mock login.
  if (!import.meta.env.DEV) {
    return false;
  }
  return true;
}
