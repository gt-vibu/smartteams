import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  description: 'Smarteam platform administration',
  title: 'Smarteam | Integration desk',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
