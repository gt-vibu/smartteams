import type React from 'react';

/**
 * One entry in the sidebar or the mobile bar.
 *
 * The icon is a function of its class name rather than a ready-made element, so the left rail and
 * the bottom bar can size it differently without each keeping its own copy of the path data —
 * which is exactly what they were doing before, to the tune of ~380 duplicated lines each.
 */
export type NavItem = {
  id: string;
  label: string;
  icon: (className: string) => React.ReactNode;
};
