import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '产品体验管理平台',
    template: '%s | 产品体验管理平台',
  },
  description: '覆盖体验计划、现场走查、报告输出、数据分析全流程的产品体验管理系统',
  keywords: ['产品体验', '体验管理', '走查', '质量'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className="antialiased bg-background text-foreground" suppressHydrationWarning>
        <AuthProvider>
          {isDev && <Inspector />}
          {children}
          <Toaster position="top-center" />
        </AuthProvider>
      </body>
    </html>
  );
}
