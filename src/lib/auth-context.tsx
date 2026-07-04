'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode, useMemo } from 'react';
import { type AuthRole, type Permission, getRolePermissions, hasPermission } from '@/lib/server/rbac';

type UserRole = AuthRole;
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
  isTaskOwner: boolean;
  isReviewer: boolean;
  isProductManager: boolean;
  isExecutiveViewer: boolean;
  isExecutor: boolean;
  isRectificationOwner: boolean;
  permissions: Set<string>;
  hasPermission: (perm: string) => boolean;
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
  role: 'executor',
  isAdmin: false,
  isTaskOwner: false,
  isReviewer: false,
  isProductManager: false,
  isExecutiveViewer: false,
  isExecutor: false,
  isRectificationOwner: false,
  permissions: new Set(),
  hasPermission: () => false,
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
  const [role, setRoleState] = useState<UserRole>('executor');
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
    setRoleState('executor');
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
    // 分享页（/reports/share/*）是公开只读页面，跳过鉴权请求，避免 401 噪音和误判
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/reports/share/')) {
      setIsLoading(false);
      return;
    }
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

  const { permissions, checkPermission } = useMemo(() => {
    const perms = new Set<string>(getRolePermissions(role));
    return {
      permissions: perms,
      checkPermission: (perm: string) => hasPermission(role, perm as Permission),
    };
  }, [role]);

  return (
    <AuthContext.Provider value={{
      user,
      role,
      isAdmin: role === 'admin',
      isTaskOwner: role === 'task_owner',
      isReviewer: role === 'reviewer',
      isProductManager: role === 'product_manager',
      isExecutiveViewer: role === 'executive_viewer',
      isExecutor: role === 'executor',
      isRectificationOwner: role === 'rectification_owner',
      permissions,
      hasPermission: checkPermission,
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
