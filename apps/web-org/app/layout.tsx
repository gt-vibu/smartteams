import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  description: 'Smarteam organization workspace',
  title: 'Smarteam | Organization workspace',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
