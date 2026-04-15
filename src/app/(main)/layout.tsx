import { AppSidebar, MobileNav, BottomNav } from '@/components/navigation';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <MobileNav />
      <main className="flex-1 min-w-0">
        <div className="lg:p-0 p-14 pb-20 lg:pb-0">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
