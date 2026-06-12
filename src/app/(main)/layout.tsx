'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import { AppSidebar, MobileNav, BottomNav } from '@/components/navigation';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(true);
  }, []);

  useEffect(() => {
    if (checked && !isLoading && !isAuthenticated) {
      window.location.href = '/login';
    }
  }, [checked, isAuthenticated, isLoading]);

  if (!checked || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <MobileNav />
      <main className="flex-1 min-w-0 overflow-y-auto pt-14 lg:pt-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
