'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, type CSSProperties } from 'react';
import { ArrowDown, ArrowUpRight } from 'lucide-react';

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

const desktopScreens = productScreens.filter((screen) => ['overview', 'employees', 'payroll'].includes(screen.kind));

function ProductScreenImage({ screen, priority = false }: { screen: (typeof productScreens)[number]; priority?: boolean }) {
  return (
    <div className={`landing-product-shot landing-product-shot--${screen.kind}`}>
      <Image
        src={screen.src}
        alt={screen.alt}
        width={screen.width}
        height={screen.height}
        priority={priority}
        loading="eager"
        sizes="(max-width: 760px) 92vw, (max-width: 1200px) 56vw, 760px"
      />
      {screen.kind !== 'workforce' && (
        <span className="landing-product-workspace-label" aria-hidden="true">Smarteam</span>
      )}
      {screen.kind === 'overview' && (
        <>
          <span className="landing-product-overview-subtitle-label" aria-hidden="true">Your organization at a glance.</span>
          <span className="landing-product-organization-label" aria-hidden="true">Your organization</span>
        </>
      )}
    </div>
  );
}

// A restrained pinned sequence: a readable hold with enough scroll travel for
// the image and copy to move together at every chapter boundary.
const SCENE_SCROLL_SPAN = 1.35;
const PINNED_SCENE_COUNT = 3;

function SceneCopy({ scene, index, mobile = false }: { scene: (typeof scenes)[number]; index: number; mobile?: boolean }) {
  const Heading = index === 0 ? 'h1' : 'h2';
  const nextScene = scene.href.startsWith('#') ? index + 1 : undefined;

  return (
    <div className={`landing-film-copy-content${mobile ? ' is-mobile' : ''}`} data-tone={scene.tone}>
      <p className="landing-film-eyebrow"><span>{scene.eyebrow}</span><span>0{index + 1} / 04</span></p>
      <Heading>{scene.title.map((line, lineIndex) => <span className={`landing-film-title-line${lineIndex === 1 ? ' is-accent' : ''}`} data-title-line key={line}>{line}</span>)}</Heading>
      <p className="landing-film-body">{scene.body}</p>
      <div className="landing-film-points" aria-label="Included capabilities">
        {scene.points.map((point, pointIndex) => <span key={point}><i>0{pointIndex + 1}</i>{point}</span>)}
      </div>
      <Link className={scene.cta ? 'landing-film-cta' : 'landing-film-link'} href={scene.href} data-film-nav={!mobile ? nextScene : undefined}>
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

    const stage = film.querySelector<HTMLElement>('.landing-film-stage');
    const textScenes = Array.from(film.querySelectorAll<HTMLElement>('[data-film-copy]'));
    const screens = Array.from(film.querySelectorAll<HTMLElement>('[data-film-screen]'));
    const mobileScenes = Array.from(film.querySelectorAll<HTMLElement>('[data-mobile-scene]'));
    const closingScene = document.querySelector<HTMLElement>('.landing-closing');
    const anchors = Array.from(document.querySelectorAll<HTMLElement>('[data-film-nav]'));
    const screensByScene = scenes.map((_, index) => screens.filter((screen) => (screen.dataset.scenes ?? '').split(',').map(Number).includes(index)));
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let lastActive = -1;

    const scrollToScene = (sceneIndex: number, behavior: ScrollBehavior) => {
      if (window.matchMedia('(max-width: 820px)').matches) {
        mobileScenes[sceneIndex]?.scrollIntoView({ behavior, block: 'start' });
        return;
      }
      if (sceneIndex >= PINNED_SCENE_COUNT && closingScene) {
        const target = closingScene.getBoundingClientRect().top + window.scrollY - (document.querySelector('.landing-header')?.getBoundingClientRect().height ?? 78);
        window.scrollTo({ top: target, behavior });
        return;
      }
      const start = film.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: start + sceneIndex * window.innerHeight * SCENE_SCROLL_SPAN, behavior });
    };

    const navigateToScene = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.currentTarget as HTMLAnchorElement;
      const sceneIndex = Number(anchor.dataset.filmNav);
      if (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= scenes.length) return;
      event.preventDefault();
      const href = anchor.getAttribute('href');
      if (href?.startsWith('#')) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${href}`);
      scrollToScene(sceneIndex, motionPreference.matches ? 'auto' : 'smooth');
    };

    // Desktop chapters are positioned by scroll distance; their mobile IDs are
    // hidden on desktop. Resolve direct links through the same navigation path.
    const navigateToHash = () => {
      const sceneIndex = scenes.findIndex((scene) => `#${scene.id}` === window.location.hash);
      if (sceneIndex >= 0) scrollToScene(sceneIndex, 'auto');
    };

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const reduceMotion = motionPreference.matches;
        if (window.matchMedia('(max-width: 820px)').matches) {
          const headerHeight = document.querySelector('.landing-header')?.getBoundingClientRect().height ?? 64;
          let active = 0;
          let nearestDistance = Number.POSITIVE_INFINITY;
          mobileScenes.forEach((scene, index) => {
            const distance = Math.abs(scene.getBoundingClientRect().top - headerHeight - 24);
            if (distance < nearestDistance) {
              active = index;
              nearestDistance = distance;
            }
          });
          const storyStart = film.getBoundingClientRect().top + window.scrollY;
          const storyEnd = storyStart + film.offsetHeight - window.innerHeight;
          const progress = Math.min(100, Math.max(0, ((window.scrollY - storyStart) / Math.max(1, storyEnd - storyStart)) * 100));
          document.documentElement.style.setProperty('--landing-scroll-progress', `${progress}%`);
          anchors.forEach((anchor) => {
            const isActive = Number(anchor.dataset.filmNav) === active;
            anchor.classList.toggle('is-active', isActive);
            if (isActive) anchor.setAttribute('aria-current', 'location');
            else anchor.removeAttribute('aria-current');
          });
          return;
        }

        const filmStart = film.getBoundingClientRect().top + window.scrollY;
        const position = Math.min(PINNED_SCENE_COUNT - 1, Math.max(0, (window.scrollY - filmStart) / Math.max(1, window.innerHeight * SCENE_SCROLL_SPAN)));
        const closingTop = closingScene ? closingScene.getBoundingClientRect().top + window.scrollY : Number.POSITIVE_INFINITY;
        const inClosing = window.scrollY + window.innerHeight * .48 >= closingTop;
        // Keep the pinned scene state inside the pinned sequence. The closing section
        // follows the stage in normal flow; activating it before the stage leaves its
        // containing section causes the last product screen to be clipped at the seam.
        const active = Math.min(PINNED_SCENE_COUNT - 1, Math.floor(position + 0.5));
        const navigationActive = inClosing ? scenes.length - 1 : active;
        const transitionScene = Math.min(PINNED_SCENE_COUNT - 2, Math.floor(position));
        const transitionFraction = Math.min(1, Math.max(0, position - transitionScene));
        const currentScreens = screensByScene[transitionScene] ?? [];
        const nextScreens = screensByScene[transitionScene + 1] ?? [];
        const selectedScreens = screensByScene[active] ?? [];

        textScenes.forEach((element, index) => {
          const isActive = index === active;
          const isOutgoing = index === transitionScene;
          const isIncoming = index === transitionScene + 1;
          const copyExitRaw = Math.min(1, Math.max(0, (transitionFraction - .12) / .24));
          const copyEnterRaw = Math.min(1, Math.max(0, (transitionFraction - .3) / .36));
          const copyExit = copyExitRaw * copyExitRaw * (3 - 2 * copyExitRaw);
          const copyEnter = 1 - Math.pow(1 - copyEnterRaw, 5);
          const opacity = reduceMotion ? Number(isActive) : isOutgoing ? 1 - copyExit : isIncoming ? copyEnter : 0;
          const distance = isIncoming ? 1 - copyEnter : copyExit;
          const direction = isOutgoing ? -1 : 1;
          const offset = reduceMotion ? 0 : direction * distance * 22;
          element.style.opacity = `${opacity}`;
          element.style.visibility = opacity > .01 ? 'visible' : 'hidden';
          element.style.transform = `translate3d(0, ${offset}px, 0)`;
          element.setAttribute('aria-hidden', opacity > .65 ? 'false' : 'true');
          if (opacity > .65) element.removeAttribute('inert');
          else element.setAttribute('inert', '');

          element.querySelectorAll<HTMLElement>('[data-title-line]').forEach((line, lineIndex) => {
            const lineOffset = lineIndex * .055;
            const lineOut = Math.min(1, Math.max(0, (transitionFraction - (.12 + lineOffset)) / .22));
            const lineIn = Math.min(1, Math.max(0, (transitionFraction - (.3 + lineOffset)) / .3));
            const easedOut = lineOut * lineOut * (3 - 2 * lineOut);
            const easedIn = 1 - Math.pow(1 - lineIn, 5);
            const lineOpacity = reduceMotion ? Number(isActive) : isOutgoing ? 1 - easedOut : isIncoming ? easedIn : 0;
            const lineY = reduceMotion ? 0 : isOutgoing ? -20 * easedOut : isIncoming ? (1 - easedIn) * 20 : 0;
            line.style.opacity = `${lineOpacity}`;
            line.style.transform = `translate3d(0, ${lineY}px, 0)`;
          });
        });

        screens.forEach((element) => {
          const isCurrent = currentScreens.includes(element);
          const isIncoming = nextScreens.includes(element) && !isCurrent;
          const incomingProgress = Math.min(1, Math.max(0, (transitionFraction - .34) / .36));
          const easeIn = incomingProgress * incomingProgress * (3 - 2 * incomingProgress);
          // Keep an opaque screen beneath the incoming layer: fading both into
          // the pale frame would wash out the product during the handoff.
          const opacity = reduceMotion ? Number(selectedScreens.includes(element)) : isCurrent ? Number(incomingProgress < 1) : isIncoming ? easeIn : 0;
          const imageY = reduceMotion ? 0 : isIncoming ? (1 - easeIn) * 10 : 0;
          element.style.opacity = `${opacity}`;
          element.style.visibility = opacity > .01 ? 'visible' : 'hidden';
          element.style.zIndex = isIncoming ? '4' : '3';
          element.style.transform = `translate3d(0, ${imageY}px, 0)`;
          element.setAttribute('aria-hidden', selectedScreens.includes(element) ? 'false' : 'true');
        });

        const progress = inClosing ? 1 : position / (PINNED_SCENE_COUNT - 1) * .75;
        stage?.style.setProperty('--film-progress', `${progress * 100}%`);
        document.documentElement.style.setProperty('--landing-scroll-progress', `${progress * 100}%`);
        anchors.forEach((anchor) => {
          const isActive = Number(anchor.dataset.filmNav) === navigationActive;
          anchor.classList.toggle('is-active', isActive);
          if (isActive) anchor.setAttribute('aria-current', 'location');
          else anchor.removeAttribute('aria-current');
        });

        if (active !== lastActive) {
          stage?.setAttribute('data-active-scene', `${active}`);
          lastActive = active;
        }
      });
    };

    anchors.forEach((anchor) => anchor.addEventListener('click', navigateToScene));
    navigateToHash();
    update();
    window.addEventListener('hashchange', navigateToHash);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    motionPreference.addEventListener('change', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', navigateToHash);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      motionPreference.removeEventListener('change', update);
      anchors.forEach((anchor) => anchor.removeEventListener('click', navigateToScene));
      document.documentElement.style.removeProperty('--landing-scroll-progress');
    };
  }, []);

  return (
    <>
    <section className="landing-film" id="platform" ref={filmRef} aria-label="Smarteam product story" style={{ '--film-step-height': `${SCENE_SCROLL_SPAN * 100}svh`, '--film-steps-height': `${(PINNED_SCENE_COUNT - 1) * SCENE_SCROLL_SPAN * 100}svh` } as CSSProperties}>
      <div className="landing-film-stage" data-active-scene="0">
        <div className="landing-film-atmosphere" aria-hidden="true"><div className="landing-film-grid" /><div className="landing-film-light" /><div className="landing-film-orbit landing-film-orbit-a" /><div className="landing-film-orbit landing-film-orbit-b" /></div>

        <div className="landing-film-visuals" role="group" aria-label="Smarteam product screens">
          <div className="landing-film-frame">
            <div className="landing-screen-chrome"><span className="landing-screen-lights"><i /><i /><i /></span><span>SMARTTEAM / PEOPLE OPERATIONS</span><span className="landing-screen-live"><i /> PRODUCT VIEW</span></div>
            <div className="landing-film-image-stack">
              {desktopScreens.map((screen, index) => (
                <figure className={`landing-film-screen landing-film-screen--${screen.kind}`} data-film-screen data-screen-kind={screen.kind} data-scenes={screen.scenes.join(',')} key={screen.src} aria-hidden={index !== 0}>
                  <ProductScreenImage screen={screen} priority={index === 0} />
                </figure>
              ))}
            </div>
            <div className="landing-film-frame-caption"><span>A connected workday, in focus</span><span>Smarteam · Your workspace</span></div>
          </div>
        </div>

        <div className="landing-film-copy" aria-live="polite">
          {scenes.slice(0, PINNED_SCENE_COUNT).map((scene, index) => <article className="landing-film-copy-scene" data-film-copy key={scene.id} aria-hidden={index !== 0} inert={index !== 0}>
            <SceneCopy scene={scene} index={index} />
          </article>)}
        </div>

        <div className="landing-film-controls" aria-label="Story progress">
          <div className="landing-film-progress-track"><span /></div>
          <div className="landing-film-dots">
            {scenes.map((scene, index) => <a key={scene.id} href={`#${scene.id}`} data-film-nav={index} aria-label={`Go to scene ${index + 1}: ${scene.eyebrow}`} className={index === 0 ? 'is-active' : undefined}><span /></a>)}
          </div>
          <span className="landing-film-scroll-hint"><ArrowDown aria-hidden="true" size={13} /> SCROLL TO EXPLORE</span>
        </div>
      </div>

      <div className="landing-film-steps" aria-hidden="true">
        {scenes.slice(1, PINNED_SCENE_COUNT).map((scene) => <div className="landing-film-step" key={scene.id} />)}
      </div>

      <div className="landing-mobile-story">
        {scenes.map((scene, index) => {
          const sceneScreens = productScreens.filter((item) => item.scenes.some((sceneIndex: number) => sceneIndex === index))
            .sort((a, b) => Number(a.kind !== 'workforce') - Number(b.kind !== 'workforce'));
          return <article className="landing-mobile-scene" data-mobile-scene={index} id={index > 0 && index < PINNED_SCENE_COUNT ? scene.id : undefined} key={scene.id}>
            <SceneCopy scene={scene} index={index} mobile />
            {sceneScreens.map((screen) => <figure className={`landing-mobile-screen landing-mobile-screen--${screen.kind}`} key={screen.kind}>
              <div className="landing-screen-chrome"><span className="landing-screen-lights"><i /><i /><i /></span><span>SMARTTEAM / {screen.label.toUpperCase()}</span><span className="landing-screen-live"><i /> PRODUCT VIEW</span></div>
              <ProductScreenImage screen={screen} />
              <figcaption>{screen.label}<span>Smarteam · Your workspace</span></figcaption>
            </figure>)}
          </article>;
        })}
      </div>
    </section>
    <section className="landing-closing" id="closing" aria-labelledby="landing-closing-heading">
      <div className="landing-closing-inner">
        <p className="landing-closing-kicker">SMARTEAM · PEOPLE OPERATIONS</p>
        <h2 id="landing-closing-heading">Give good work<br /><em>room to happen.</em></h2>
        <p>One connected workspace for the people and routines that move your organization forward.</p>
        <Link className="landing-film-cta" href="/tenant">Sign in to Smarteam <ArrowUpRight aria-hidden="true" size={16} /></Link>
      </div>
    </section>
    </>
  );
}
