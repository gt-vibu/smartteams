import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  description: 'Smarteam organization workspace',
  title: 'Smarteam | Organization workspace',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
