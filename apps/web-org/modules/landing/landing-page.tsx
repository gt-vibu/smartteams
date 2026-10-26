'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Brand } from '@smarteam/ui';
import { LandingFilm } from './landing-film';
import './landing-page.css';

const APP_HREF = '/tenant';
const navItems = [
  ['Platform', '#platform', 0],
  ['People', '#people', 1],
  ['Workflows', '#workflows', 2],
  ['Get started', '#closing', 3],
] as const;

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <main className="landing-page" id="top">
      <div className="landing-progress" aria-hidden="true"><span /></div>
      <a className="landing-skip" href="#platform">Skip to content</a>

      <header className="landing-header">
        <Link className="landing-brand" href="/" aria-label="Smarteam home"><Brand compact /></Link>
        <nav className="landing-nav" aria-label="Product sections">
          {navItems.map(([label, href, index]) => <a href={href} key={label} data-film-nav={index}>{label}</a>)}
        </nav>
        <div className="landing-header-actions">
          <Link className="landing-signin" href={APP_HREF}>Sign in</Link>
          <Link className="landing-header-cta" href={APP_HREF}>Open workspace <ArrowUpRight aria-hidden="true" size={15} /></Link>
          <button type="button" className="landing-menu-trigger" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="landing-mobile-menu" onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </header>

      {menuOpen && <button className="landing-menu-scrim" type="button" aria-label="Close navigation" onClick={closeMenu} />}
      <nav id="landing-mobile-menu" className={`landing-mobile-menu${menuOpen ? ' is-open' : ''}`} aria-label="Mobile navigation" aria-hidden={!menuOpen} inert={!menuOpen}>
        {navItems.map(([label, href, index]) => <a href={href} key={label} data-film-nav={index} onClick={closeMenu}>{label}<ArrowRight aria-hidden="true" size={16} /></a>)}
        <Link href={APP_HREF} onClick={closeMenu}>Sign in to Smarteam <ArrowUpRight aria-hidden="true" size={16} /></Link>
      </nav>

      <LandingFilm />

      <footer className="landing-footer">
        <div className="landing-footer-main">
          <Link href="/" aria-label="Smarteam home"><Brand compact /></Link>
          <p>People, time and pay.<br /><span>One clearer workday.</span></p>
          <Link className="landing-footer-cta" href={APP_HREF}>Enter your workspace <ArrowUpRight aria-hidden="true" size={15} /></Link>
        </div>
        <div className="landing-footer-bottom"><span>© {new Date().getFullYear()} Smarteam</span><span>Designed for the people behind the work.</span><Link href="/terms">Terms &amp; Conditions</Link><a href="#top">Back to start ↑</a></div>
      </footer>
    </main>
  );
}
