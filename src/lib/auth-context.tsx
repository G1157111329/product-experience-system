'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';

type UserRole = 'admin' | 'user';
type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unavailable';

interface UserInfo {
  id: string;
  account: string;
  name: string;
  role: UserRole;
}

interface AuthContextType {
  user: UserInfo | null;
  role: UserRole;
  isAdmin: boolean;
  authStatus: AuthStatus;
  authError: string | null;
  setRole: (role: UserRole) => void;
  login: (userInfo: UserInfo) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: 'user',
  isAdmin: false,
  authStatus: 'loading',
  authError: null,
  setRole: () => {},
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
  isAuthenticated: false,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [role, setRoleState] = useState<UserRole>('user');
  const [isLoading, setIsLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const userRef = useRef<UserInfo | null>(null);

  const applyUser = useCallback((userInfo: UserInfo) => {
    userRef.current = userInfo;
    setUser(userInfo);
    setRoleState(userInfo.role);
    setAuthStatus('authenticated');
    setAuthError(null);
  }, []);

  const clearUser = useCallback(() => {
    userRef.current = null;
    setUser(null);
    setRoleState('user');
    setAuthStatus('anonymous');
    setAuthError(null);
  }, []);

  const login = useCallback((userInfo: UserInfo) => {
    applyUser(userInfo);
  }, [applyUser]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } catch {
      // Best-effort local cleanup still runs below.
    }
    clearUser();
    window.location.href = '/login';
  }, [clearUser]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/profile', {
        credentials: 'same-origin',
        cache: 'no-store',
      });

      if (res.status === 401 || res.status === 403) {
        clearUser();
        return;
      }

      if (!res.ok) {
        throw new Error(`profile_request_failed:${res.status}`);
      }

      const data = await res.json();
      if (data.code === 0) {
        const updated = {
          id: data.data.id,
          account: data.data.account,
          name: data.data.name,
          role: data.data.role,
        } as UserInfo;
        applyUser(updated);
      } else {
        clearUser();
      }
    } catch {
      if (userRef.current) {
        setAuthStatus('authenticated');
      } else {
        setAuthStatus('unavailable');
      }
      setAuthError('登录状态校验暂时不可用，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  }, [applyUser, clearUser]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      void refreshUser();
    }, 10 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [refreshUser, user]);

  const setRole = useCallback((newRole: UserRole) => {
    setRoleState(newRole);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      role,
      isAdmin: role === 'admin',
      authStatus,
      authError,
      setRole,
      login,
      logout,
      refreshUser,
      isAuthenticated: authStatus === 'authenticated' && !!user,
      isLoading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
