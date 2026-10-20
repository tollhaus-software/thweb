import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { reauthManager } from '../utils/reauthManager';

interface User {
  email: string;
  roles: string[];
  permissions: string[];
  effective_permissions: string[];
  family_id?: string;
}

export interface AuthError {
  message: string;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  authError: AuthError | null;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  loading: boolean;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const isKioskMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.location.port === '1443' ||
    new URLSearchParams(window.location.search).get('kiosk') === 'true' ||
    Boolean((window as unknown as { __KIOSK_MODE__?: boolean }).__KIOSK_MODE__)
  );
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const kiosk = isKioskMode();
  const [user, setUser] = useState<User | null>(() => {
    if (kiosk) {
      return {
        email: 'kiosk@tablet',
        roles: ['kiosk'],
        permissions: ['dashboard.read'],
        effective_permissions: ['dashboard.read'],
      };
    }
    return null;
  });
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    if (kiosk) return null;
    return typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  });
  const [loading, setLoading] = useState(!kiosk);

  const userRef = useRef<User | null>(user);
  const tokenRef = useRef<string | null>(token);

  useEffect(() => {
    userRef.current = user;
    tokenRef.current = token;
  }, [user, token]);

  const login = (newToken: string) => {
    if (kiosk) return;
    setToken(newToken);
    localStorage.setItem('token', newToken);
  };

  const logout = () => {
    if (kiosk) {
      window.location.reload();
      return;
    }
    reauthManager.handleCancel();
    setToken(null);
    setUser(null);
    setAuthError(null);
    localStorage.removeItem('token');
    window.location.href = '/oauth2/sign_out';
  };

  const refreshUser = useCallback(async () => {
    if (kiosk) {
      setLoading(false);
      return;
    }

    const headers: Record<string, string> = {
      'X-Skip-Reauth': 'true',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch('/api/me', { headers });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setAuthError(null);
      } else if (res.status === 401 || (res.status === 403 && (res.headers.get('content-type') || '').includes('text/html'))) {
        // If user was already authenticated, do NOT unmount Dashboard! Keep state and trigger re-auth.
        if (userRef.current) {
          reauthManager.promptReauth();
        } else {
          setUser(null);
          setAuthError({
            message: 'Session expired',
          });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setUser(null);
        setAuthError({
          message: errData.error || 'User not allowed',
          email: errData.email || undefined,
        });
      }
    } catch (err: unknown) {
      if (!userRef.current) {
        const errorMsg = err instanceof Error ? err.message : 'Unauthorized';
        setUser(null);
        setAuthError({ message: errorMsg });
      }
    } finally {
      setLoading(false);
    }
  }, [kiosk, token]);

  useEffect(() => {
    reauthManager.configure({
      getIsAuthenticated: () => Boolean(userRef.current),
      getAuthToken: () => tokenRef.current,
      refreshUser,
    });
  }, [refreshUser]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const hasPermission = (perm: string): boolean => {
    if (!user || !user.effective_permissions) return false;
    if (user.effective_permissions.includes('*') || user.effective_permissions.includes(perm)) {
      return true;
    }
    if (perm === 'families.all.restrictedread' && user.effective_permissions.includes('families.all.read')) {
      return true;
    }
    if (perm === 'fees.self.read' && user.effective_permissions.includes('fees.all.read')) {
      return true;
    }
    if (perm === 'memberships.all.read' && user.effective_permissions.includes('memberships.all.write')) {
      return true;
    }
    if (
      perm === 'memberships.self.read' &&
      (user.effective_permissions.includes('memberships.all.read') || user.effective_permissions.includes('memberships.all.write'))
    ) {
      return true;
    }
    return false;
  };

  return (
    <AuthContext.Provider value={{ user, authError, token, login, logout, refreshUser, loading, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
