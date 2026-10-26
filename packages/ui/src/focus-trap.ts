import * as React from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute('aria-hidden') !== 'true',
  );
}

export function useFocusTrap(
  open: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  onEscape: () => void,
) {
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  // Kept in a ref so a new handler on every render does not re-run the trap. Re-running it moved
  // focus back to the first control (the close button) whenever the page re-rendered, so text
  // typed into the panel ended up on the close button and the next space or enter shut it.
  const onEscapeRef = React.useRef(onEscape);
  React.useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  React.useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    if (!container) return;

    const focusableElements = getFocusableElements(container);
    (focusableElements[0] ?? container).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const elements = getFocusableElements(container);
      if (elements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = elements[0]!;
      const last = elements[elements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [containerRef, open]);
}
