'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { BrandMark } from '@smarteam/ui';

const scenes = [
  {
    id: 'platform',
    eyebrow: 'SMARTEAM · PEOPLE OPERATIONS',
    title: ['Work, made', 'clearer.'],
    body: 'People, time and pay belong in one view. Smarteam gives every workday a clearer shape, from the first hire to the monthly close.',
    points: ['People', 'Time', 'Pay'],
    link: 'Open your workspace',
    href: '/tenant',
    cta: true,
    tone: 'light',
  },
  {
    id: 'people',
    eyebrow: '01 / PEOPLE & TEAMS',
    title: ['People make', 'the work.'],
    body: 'Keep employee records, teams and ownership connected, so the people behind every decision are easy to find.',
    points: ['Employee records', 'Teams', 'Onboarding'],
    link: 'Explore people',
    href: '#workflows',
    cta: false,
    tone: 'dark',
  },
  {
    id: 'workflows',
    eyebrow: '02 / CONNECTED OPERATIONS',
    title: ['Workdays,', 'in rhythm.'],
    body: 'Attendance, organization and compensation work together. Follow the handoffs from a recorded day to a confident pay run.',
    points: ['Attendance & leave', 'Organization', 'Payroll'],
    link: 'Explore workflows',
    href: '/tenant',
    cta: true,
    tone: 'light',
  },
  {
    id: 'closing',
    eyebrow: 'SMARTEAM · ONE WORKSPACE',
    title: ['Give good work', 'room to happen.'],
    body: 'One connected workspace for the people and routines that move your organization forward.',
    points: ['Clear ownership', 'Connected routines', 'Useful visibility'],
    link: 'Sign in to Smarteam',
    href: '/tenant',
    cta: true,
    tone: 'dark',
  },
] as const;

const productScreens = [
  { src: '/landing/smarteam-overview.webp', alt: 'Smarteam organization overview with employee growth, attendance, holidays, quick actions and pending approvals', label: 'Organization overview', scenes: [0], kind: 'overview', width: 1536, height: 1024 },
  { src: '/landing/smarteam-employees.webp', alt: 'Smarteam employee management with employee records, departments, account access and status', label: 'Employee management', scenes: [1], kind: 'employees', width: 1536, height: 1024 },
  { src: '/landing/smarteam-workforce.webp', alt: 'Smarteam workforce represented as connected employee profiles, schedules and organization workflows', label: 'People behind the work', scenes: [1], kind: 'workforce', width: 1240, height: 1240 },
  { src: '/landing/smarteam-departments.webp', alt: 'Smarteam department workspace with department ownership, employee assignments and job series', label: 'Department workspace', scenes: [2], kind: 'departments', width: 1586, height: 1024 },
  { src: '/landing/smarteam-payroll.webp', alt: 'Smarteam payroll compensation with salary components, employee compensation and employer cost', label: 'Payroll compensation', scenes: [2], kind: 'payroll', width: 1672, height: 941 },
] as const;

function ProductScreenImage({ screen, priority = false }: { screen: (typeof productScreens)[number]; priority?: boolean }) {
  return (
    <div className={`landing-product-shot landing-product-shot--${screen.kind}`}>
      <Image
        src={screen.src}
        alt={screen.alt}
        width={screen.width}
        height={screen.height}
        priority={priority}
        sizes="(max-width: 760px) 92vw, (max-width: 1200px) 56vw, 760px"
      />
      {screen.kind !== 'workforce' && <span className="landing-product-workspace-label" aria-hidden="true">Smarteam</span>}
      {screen.kind === 'overview' && <>
        <span className="landing-product-overview-subtitle-label" aria-hidden="true">Your organization at a glance.</span>
        <span className="landing-product-organization-label" aria-hidden="true">Your organization</span>
      </>}
    </div>
  );
}

function SceneCopy({ scene, index }: { scene: (typeof scenes)[number]; index: number }) {
  const Heading = index === 0 ? 'h1' : 'h2';
  return (
    <div className="landing-film-copy-content" data-tone={scene.tone}>
      <p className="landing-film-eyebrow"><span>{scene.eyebrow}</span><span>0{index + 1} / 04</span></p>
      <Heading>{scene.title.map((line, lineIndex) => <span className={`landing-film-title-line${lineIndex === 1 ? ' is-accent' : ''}`} key={line}>{line}</span>)}</Heading>
      <p className="landing-film-body">{scene.body}</p>
      <div className="landing-film-points" aria-label="Included capabilities">
        {scene.points.map((point, pointIndex) => <span key={point}><i>0{pointIndex + 1}</i>{point}</span>)}
      </div>
      <Link className={scene.cta ? 'landing-film-cta' : 'landing-film-link'} href={scene.href}>
        {scene.link} <ArrowUpRight aria-hidden="true" size={16} />
      </Link>
    </div>
  );
}

export function LandingFilm() {
  const filmRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const film = filmRef.current;
    if (!film) return;

    const chapters = Array.from(film.querySelectorAll<HTMLElement>('[data-mobile-scene]'));
    const desktopSteps = Array.from(film.querySelectorAll<HTMLElement>('[data-desktop-step]'));
    const desktopStage = film.querySelector<HTMLElement>('.landing-desktop-stage');
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('.landing-nav a, .landing-mobile-menu a, [data-film-nav]'));
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktopViewport = window.matchMedia('(min-width: 821px)');
    let frame = 0;

    desktopStage?.classList.add('is-ready');

    const setActiveScene = (index: number, progress?: number) => {
      if (!desktopStage) return;
      const boundedIndex = Math.min(scenes.length - 1, Math.max(0, index));
      desktopStage.dataset.activeScene = String(boundedIndex);
      if (progress !== undefined) desktopStage.style.setProperty('--desktop-story-progress', `${Math.min(100, Math.max(0, progress))}%`);
      film.querySelectorAll<HTMLElement>('.landing-desktop-copy-scene, .landing-desktop-screen-set').forEach((element) => {
        const active = Number(element.dataset.sceneIndex) === boundedIndex;
        element.classList.toggle('is-active', active);
        if (element.classList.contains('landing-desktop-screen-set')) element.setAttribute('aria-hidden', String(!active));
      });
      film.querySelectorAll<HTMLAnchorElement>('[data-film-nav]').forEach((anchor) => {
        const active = Number(anchor.dataset.filmNav) === boundedIndex;
        anchor.classList.toggle('is-active', active);
        if (active) anchor.setAttribute('aria-current', 'location');
        else anchor.removeAttribute('aria-current');
      });
    };

    const updateProgress = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const start = film.getBoundingClientRect().top + window.scrollY;
        const end = start + film.offsetHeight - window.innerHeight;
        const progress = Math.min(100, Math.max(0, ((window.scrollY - start) / Math.max(1, end - start)) * 100));
        document.documentElement.style.setProperty('--landing-scroll-progress', `${progress}%`);

        if (desktopViewport.matches && desktopSteps.length) {
          const headerHeight = Number.parseFloat(getComputedStyle(film).getPropertyValue('--landing-header-height')) || 78;
          const stepHeight = Math.max(1, window.innerHeight - headerHeight);
          const chapterProgress = Math.min(scenes.length, Math.max(0, (window.scrollY - start) / stepHeight));
          const index = Math.min(scenes.length - 1, Math.floor(chapterProgress));
          setActiveScene(index, (chapterProgress / scenes.length) * 100);
        }
      });
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -7% 0px' });
    chapters.forEach((chapter) => revealObserver.observe(chapter));

    const navigationObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        anchors.forEach((anchor) => {
          const active = anchor.hash === `#${scenes[Number((entry.target as HTMLElement).dataset.mobileScene)]?.id}`;
          anchor.classList.toggle('is-active', active);
          if (active) anchor.setAttribute('aria-current', 'location');
          else anchor.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-25% 0px -60% 0px' });
    chapters.forEach((chapter) => navigationObserver.observe(chapter));

    const onStoryNavigation = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!anchor) return;
      const index = scenes.findIndex((scene) => `#${scene.id}` === anchor.hash);
      const scene = scenes[index];
      if (!scene) return;
      event.preventDefault();
      const target = desktopViewport.matches ? desktopSteps[index] : chapters[index];
      target?.scrollIntoView({ behavior: motionPreference.matches ? 'auto' : 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${scene.id}`);
      if (desktopViewport.matches) setActiveScene(index, (index / scenes.length) * 100);
    };
    document.addEventListener('click', onStoryNavigation);

    const syncHash = () => {
      const index = scenes.findIndex((scene) => `#${scene.id}` === window.location.hash);
      if (index < 0) return;
      const target = desktopViewport.matches ? desktopSteps[index] : chapters[index];
      target?.scrollIntoView({ behavior: 'auto', block: 'start' });
      if (desktopViewport.matches) setActiveScene(index, (index / scenes.length) * 100);
    };
    window.addEventListener('hashchange', syncHash);

    const tiltTargets = Array.from(film.querySelectorAll<HTMLElement>('.landing-mobile-screen'));
    const resetTilt = (target: HTMLElement) => {
      target.style.setProperty('--scene-tilt-x', '0deg');
      target.style.setProperty('--scene-tilt-y', '0deg');
    };
    const onPointerMove = (event: PointerEvent) => {
      if (motionPreference.matches || event.pointerType === 'touch') return;
      const target = event.currentTarget as HTMLElement;
      const bounds = target.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      target.style.setProperty('--scene-tilt-x', `${y * -3}deg`);
      target.style.setProperty('--scene-tilt-y', `${x * 4}deg`);
    };
    const tiltListeners = tiltTargets.map((target) => {
      const onPointerLeave = () => resetTilt(target);
      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerleave', onPointerLeave);
      return { target, onPointerLeave };
    });

    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress, { passive: true });
    updateProgress();
    if (window.location.hash) requestAnimationFrame(syncHash);
    return () => {
      cancelAnimationFrame(frame);
      revealObserver.disconnect();
      navigationObserver.disconnect();
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
      window.removeEventListener('hashchange', syncHash);
      document.removeEventListener('click', onStoryNavigation);
      tiltListeners.forEach(({ target, onPointerLeave }) => {
        target.removeEventListener('pointermove', onPointerMove);
        target.removeEventListener('pointerleave', onPointerLeave);
        resetTilt(target);
      });
      document.documentElement.style.removeProperty('--landing-scroll-progress');
    };
  }, []);

  return (
    <section className="landing-film" ref={filmRef} aria-label="Smarteam product story">
      <div className="landing-desktop-story">
        <div className="landing-desktop-stage" data-active-scene="0">
          <div className="landing-desktop-atmosphere" aria-hidden="true">
            <span className="landing-desktop-grid" />
            <span className="landing-desktop-orbit landing-desktop-orbit--outer" />
            <span className="landing-desktop-orbit landing-desktop-orbit--inner" />
            <span className="landing-desktop-orbit-core" />
          </div>
          <div className="landing-desktop-copy">
            {scenes.map((scene, index) => (
              <div className="landing-desktop-copy-scene" data-scene-index={index} key={scene.id}>
                <SceneCopy index={index} scene={scene} />
              </div>
            ))}
          </div>
          <div className="landing-desktop-visuals" aria-label="Smarteam product screens">
            {scenes.map((scene, index) => {
              const sceneScreens = productScreens
                .filter((screen) => screen.scenes.some((sceneIndex) => sceneIndex === index))
                .sort((a, b) => Number(a.kind !== 'workforce') - Number(b.kind !== 'workforce'));
              return (
                <div
                  aria-hidden={index !== 0}
                  className="landing-desktop-screen-set"
                  data-scene-index={index}
                  key={scene.id}
                >
                  {sceneScreens.map((screen) => (
                    <figure
                      className={`landing-mobile-screen landing-desktop-screen landing-mobile-screen--${screen.kind} landing-desktop-screen--${screen.kind}`}
                      key={screen.kind}
                    >
                      <div className="landing-screen-chrome">
                        <span className="landing-screen-lights"><i /><i /><i /></span>
                        <span>SMARTEAM / {screen.label.toUpperCase()}</span>
                        <span className="landing-screen-live"><i /> PRODUCT VIEW</span>
                      </div>
                      <ProductScreenImage screen={screen} priority={index === 0} />
                      <figcaption>{screen.label}<span>Smarteam · Your workspace</span></figcaption>
                    </figure>
                  ))}
                  {sceneScreens.length === 0 && (
                    <div className="landing-desktop-closing-orbit" aria-hidden="true">
                      <span className="landing-hub-backplate" />
                      <svg className="landing-hub-connectors" viewBox="0 0 640 520" fill="none" aria-hidden="true">
                        <path d="M218 105C263 128 279 192 319 246" />
                        <path d="M442 168C400 181 378 214 337 250" />
                        <path d="M275 410C292 359 305 319 322 275" />
                        <circle cx="218" cy="105" r="4" />
                        <circle cx="442" cy="168" r="4" />
                        <circle cx="275" cy="410" r="4" />
                      </svg>
                      <div className="landing-hub-card landing-hub-card--people">
                        <div className="landing-hub-card-heading"><span className="landing-hub-card-icon">P</span><span><small>PEOPLE</small><strong>Teams, connected</strong></span><i>06</i></div>
                        <div className="landing-hub-people"><i>AR</i><i>BS</i><i>KJ</i><i>NM</i><span>+2</span></div>
                      </div>
                      <div className="landing-hub-card landing-hub-card--time">
                        <div className="landing-hub-card-heading"><span className="landing-hub-card-icon">T</span><span><small>TIME</small><strong>Workday in rhythm</strong></span><i>94%</i></div>
                        <div className="landing-hub-meter"><span /></div>
                      </div>
                      <div className="landing-hub-card landing-hub-card--pay">
                        <div className="landing-hub-card-heading"><span className="landing-hub-card-icon">$</span><span><small>PAY</small><strong>Payroll, in sync</strong></span><i className="landing-hub-ready">READY</i></div>
                        <div className="landing-hub-payline"><span /><span /><span /></div>
                      </div>
                      <span className="landing-desktop-orbit-center"><BrandMark className="landing-desktop-orbit-logo" /><i className="landing-hub-core-light" /></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="landing-desktop-controls">
            <div className="landing-desktop-progress" aria-hidden="true"><span /></div>
            <nav className="landing-desktop-dots" aria-label="Product story chapters">
              {scenes.map((scene, index) => (
                <a
                  aria-label={`Go to ${scene.eyebrow.toLowerCase()}`}
                  className={index === 0 ? 'is-active' : ''}
                  data-film-nav={index}
                  href={`#${scene.id}`}
                  key={scene.id}
                >
                  <span />
                </a>
              ))}
            </nav>
            <span className="landing-desktop-scroll-cue"><i /> SCROLL TO EXPLORE</span>
          </div>
        </div>
        <div className="landing-desktop-steps" aria-hidden="true">
          {scenes.map((scene, index) => (
            <div
              className="landing-desktop-step"
              data-desktop-step
              data-scene-index={index}
              id={scene.id}
              key={scene.id}
            />
          ))}
        </div>
      </div>

      <div className="landing-mobile-story">
        {scenes.map((scene, index) => {
          const sceneScreens = productScreens.filter((screen) => screen.scenes.some((sceneIndex) => sceneIndex === index))
            .sort((a, b) => Number(a.kind !== 'workforce') - Number(b.kind !== 'workforce'));
          return (
            <article className="landing-mobile-scene" data-landing-scene data-mobile-scene={index} key={scene.id}>
              <SceneCopy scene={scene} index={index} />
              {sceneScreens.length > 0 && <div className="landing-scene-visuals" aria-label={`${scene.eyebrow} product views`}>
                {sceneScreens.map((screen, screenIndex) => (
                  <figure className={`landing-mobile-screen landing-mobile-screen--${screen.kind}`} key={screen.kind}>
                    <div className="landing-screen-chrome"><span className="landing-screen-lights"><i /><i /><i /></span><span>SMARTTEAM / {screen.label.toUpperCase()}</span><span className="landing-screen-live"><i /> PRODUCT VIEW</span></div>
                    <ProductScreenImage screen={screen} priority={index === 0 && screenIndex === 0} />
                    <figcaption>{screen.label}<span>Smarteam · Your workspace</span></figcaption>
                  </figure>
                ))}
              </div>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
