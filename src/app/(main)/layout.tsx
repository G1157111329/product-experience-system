'use client';

import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import { AppSidebar, MobileNav, BottomNav } from '@/components/navigation';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(true);
  }, []);

  useEffect(() => {
    if (checked && !isAuthenticated) {
      window.location.href = '/login';
    }
  }, [checked, isAuthenticated]);

  if (!checked) {
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
    <div className="flex min-h-screen">
      <AppSidebar />
      <MobileNav />
      <main className="flex-1 min-w-0">
        <div className="pb-20 lg:pb-0">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
