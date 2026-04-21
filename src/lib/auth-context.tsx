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
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [role, setRoleState] = useState<UserRole>('user');

  useEffect(() => {
    const saved = localStorage.getItem('current_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as UserInfo;
        setUser(parsed);
        setRoleState(parsed.role);
      } catch {
        localStorage.removeItem('current_user');
      }
    }
  }, []);

  const login = useCallback((userInfo: UserInfo) => {
    setUser(userInfo);
    setRoleState(userInfo.role);
    localStorage.setItem('current_user', JSON.stringify(userInfo));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setRoleState('user');
    localStorage.removeItem('current_user');
    window.location.href = '/login';
  }, []);

  const refreshUser = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/auth/profile?user_id=${user.id}`);
      const data = await res.json();
      if (data.code === 0) {
        const updated = { ...user, name: data.data.name, role: data.data.role };
        setUser(updated);
        setRoleState(data.data.role);
        localStorage.setItem('current_user', JSON.stringify(updated));
      }
    } catch {
      // silently fail
    }
  }, [user]);

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
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
