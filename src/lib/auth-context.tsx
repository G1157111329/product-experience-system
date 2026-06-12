'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

type UserRole = 'admin' | 'user';

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

  const login = useCallback((userInfo: UserInfo) => {
    setUser(userInfo);
    setRoleState(userInfo.role);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort local cleanup still runs below.
    }
    setUser(null);
    setRoleState('user');
    window.location.href = '/login';
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/profile');
      const data = await res.json();
      if (data.code === 0) {
        const updated = {
          id: data.data.id,
          account: data.data.account,
          name: data.data.name,
          role: data.data.role,
        } as UserInfo;
        setUser(updated);
        setRoleState(data.data.role);
      } else {
        setUser(null);
        setRoleState('user');
      }
    } catch {
      setUser(null);
      setRoleState('user');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const setRole = useCallback((newRole: UserRole) => {
    setRoleState(newRole);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      role,
      isAdmin: role === 'admin',
      setRole,
      login,
      logout,
      refreshUser,
      isAuthenticated: !!user,
      isLoading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
