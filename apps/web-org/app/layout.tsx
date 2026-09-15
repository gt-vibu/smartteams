import type { Metadata, Viewport } from 'next';
import './globals.css';
import './responsive.css';

export const metadata: Metadata = {
  description: 'Smarteam organization workspace',
  title: 'Smarteam | Organization workspace',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

/**
 * Phone behaviour for the whole app.
 *
 * `viewportFit: 'cover'` is what makes `env(safe-area-inset-*)` report real values on a notched
 * phone — without it iOS reports zero, and the bottom bar sits under the home indicator however
 * carefully it pads itself. The theme colour tints the browser's own chrome to match the app bar,
 * which is most of what makes a web app read as an installed one.
 *
 * `interactiveWidget: 'resizes-content'` makes the on-screen keyboard shrink the layout instead of
 * being drawn over it. Android Chrome otherwise overlays it, and every dialog here is a sheet
 * pinned to the bottom edge on a phone — so a dialog that focused its first field opened the
 * keyboard directly on top of itself. With this the sheet, and `dvh`, sit above the keyboard.
 *
 * Zoom is left enabled on purpose. Disabling it would stop the focus-zoom that `responsive.css`
 * already prevents properly, at the cost of anyone who needs to enlarge the page to read it.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1d4a36' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
