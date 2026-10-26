import { describe, expect, it } from 'vitest';
import { permittedTabs } from './permitted-tabs';

type Tab = 'runs' | 'compensation' | 'statutory';
const tabs = (compensation: boolean) => [
  { id: 'runs' as Tab, allowed: true },
  { id: 'compensation' as Tab, allowed: compensation },
  { id: 'statutory' as Tab, allowed: true },
];

describe('permittedTabs', () => {
  it('offers only the tabs this person may open', () => {
    expect(
      permittedTabs<Tab, { id: Tab; allowed: boolean }>(tabs(false), 'runs').tabs.map(
        (tab) => tab.id,
      ),
    ).toEqual(['runs', 'statutory']);
  });

  it('keeps the tab they asked for when they may open it', () => {
    expect(
      permittedTabs<Tab, { id: Tab; allowed: boolean }>(tabs(true), 'compensation').active,
    ).toBe('compensation');
  });

  it('never lands on a tab they may not open — a link or remembered tab falls back', () => {
    expect(
      permittedTabs<Tab, { id: Tab; allowed: boolean }>(tabs(false), 'compensation').active,
    ).toBe('runs');
  });

  it('shows nothing rather than a refusal when no tab is open to them', () => {
    const none = permittedTabs<Tab, { id: Tab; allowed: boolean }>(
      [{ id: 'runs', allowed: false }],
      'runs',
    );
    expect(none.tabs).toEqual([]);
    expect(none.active).toBeNull();
  });
});
