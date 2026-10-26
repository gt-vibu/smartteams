import type { CompactSection } from './overview-compact';

const TOP_TAB_KEY = 'overviewTab';
const SUB_TAB_KEY = 'overviewSection';

/** Build the mobile Home tab URL without relying on the mobile fallback for nested sections. */
export function compactSectionUrl(
  section: CompactSection,
  search: string,
  pathname: string,
  subFallback: CompactSection = 'Profile',
) {
  const params = new URLSearchParams(search);
  const top = section === 'Calendar' ? section : 'Overview';
  params.set(TOP_TAB_KEY, top);
  if (top === 'Overview' && section !== subFallback) params.set(SUB_TAB_KEY, section);
  else params.delete(SUB_TAB_KEY);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
