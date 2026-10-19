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
