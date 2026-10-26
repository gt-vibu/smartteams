'use client';

import { useEffect, useRef } from 'react';

/** Keep native scrollbar gutters reserved, but only paint the thumb while the user scrolls. */
export function useAutoHideScrollbar<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const reveal = () => {
      element.classList.add('is-scrolling');
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => element.classList.remove('is-scrolling'), 850);
    };
    element.addEventListener('scroll', reveal, { passive: true });
    return () => {
      element.removeEventListener('scroll', reveal);
      if (hideTimer) clearTimeout(hideTimer);
      element.classList.remove('is-scrolling');
    };
  }, []);

  return ref;
}
