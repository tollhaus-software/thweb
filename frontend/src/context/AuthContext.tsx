import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface User {
  email: string;
  roles: string[];
  permissions: string[];
  effective_permissions: string[];
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const login = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setAuthError(null);
    localStorage.removeItem('token');
    window.location.href = '/oauth2/sign_out';
  };

  const refreshUser = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch('/api/me', { headers });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setAuthError(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setUser(null);
        setAuthError({
          message: errData.error || 'User not allowed',
          email: errData.email || undefined,
        });
      }
    } catch (err: any) {
      setUser(null);
      setAuthError({ message: err.message || 'Unauthorized' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const hasPermission = (perm: string): boolean => {
    if (!user || !user.effective_permissions) return false;
    return user.effective_permissions.includes('*') || user.effective_permissions.includes(perm);
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
