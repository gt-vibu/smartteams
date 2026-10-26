/**
 * The tabs a screen offers this person, and which one is showing.
 *
 * A tab whose content the API would refuse is not offered at all. Showing it and then answering
 * "Access Restricted" once opened is the navigate-then-discover experience the product avoids
 * everywhere else, and a remembered tab (from the URL or a previous visit) that has since become
 * unavailable falls back to the first one that is.
 */
export function permittedTabs<T extends string, Tab extends { id: T; allowed: boolean }>(
  tabs: readonly Tab[],
  current: T,
): { tabs: Tab[]; active: T | null } {
  const visible = tabs.filter((tab) => tab.allowed);
  const active = visible.some((tab) => tab.id === current) ? current : (visible[0]?.id ?? null);
  return { tabs: visible, active };
}
