'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type UserRole = 'admin' | 'user';

interface AuthContextType {
  role: UserRole;
  isAdmin: boolean;
  setRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType>({
  role: 'admin',
  isAdmin: true,
  setRole: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<UserRole>('admin');

  useEffect(() => {
    const saved = localStorage.getItem('user_role') as UserRole | null;
    if (saved === 'admin' || saved === 'user') {
      setRoleState(saved);
    }
  }, []);

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
    localStorage.setItem('user_role', newRole);
  };

  return (
    <AuthContext.Provider value={{ role, isAdmin: role === 'admin', setRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
