'use client';

import { useAuth } from '@/lib/auth-context';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppSidebar, MobileNav, BottomNav } from '@/components/navigation';

function hasOpenModalLayer() {
  return Boolean(
    document.querySelector(
      [
        '[data-slot="dialog-content"][data-state="open"]',
        '[data-slot="sheet-content"][data-state="open"]',
        '[data-radix-popper-content-wrapper]',
      ].join(',')
    )
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(true);
  }, []);

  useEffect(() => {
    if (checked && !isLoading && !isAuthenticated) {
      window.location.href = '/login';
    }
  }, [checked, isAuthenticated, isLoading]);

  useEffect(() => {
    const releaseStaleInteractionLock = () => {
      if (hasOpenModalLayer()) return;
      if (document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
    };

    releaseStaleInteractionLock();
    const timeout = window.setTimeout(releaseStaleInteractionLock, 350);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

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
