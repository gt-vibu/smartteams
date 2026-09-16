/**
 * The shared table's data rules.
 *
 * Search, filtering, sorting, pagination and column ordering were previously buried inside a
 * seven-hundred-line component and reachable only by rendering it, so none of them were covered.
 * They now live as functions in `@smarteam/ui`, and these are the cases that would show a screen
 * the wrong thing rather than crash it: a filter that strands the view on an empty page, a blank
 * cell sorting as though it were a value, and pinned columns coming back out of order.
 *
 * The tests live here because this is the workspace with a TypeScript test runner; the package
 * itself has no test infrastructure to add them to.
 */
import { describe, expect, it } from 'vitest';
import {
  applyColumnFilters,
  clampPage,
  displayValue,
  hasActiveFilters,
  nextPinState,
  nextSortState,
  orderColumns,
  pageCount,
  paginate,
  resolveFilterOptions,
  searchRows,
  sortRows,
  type TableColumn,
} from '@smarteam/ui';

type Row = { id: string; name: string; team: string; score: number; note?: string | null };

const rows: Row[] = [
  { id: '1', name: 'Ada', team: 'Payroll', score: 30 },
  { id: '2', name: 'Grace', team: 'Attendance', score: 20 },
  { id: '3', name: 'Alan', team: 'Payroll', score: 10 },
  { id: '4', name: 'Edsger', team: 'Leave', score: 40 },
];

const columns: TableColumn<Row>[] = [
  { id: 'name', accessorKey: 'name', sortable: true },
  { id: 'team', accessorKey: 'team', filterable: true, pinnable: true },
  { id: 'score', accessorKey: 'score', sortable: true },
];

const names = (result: Row[]) => result.map((row) => row.name);

describe('displayValue', () => {
  it('renders the primitives a cell can hold', () => {
    expect(displayValue('x')).toBe('x');
    expect(displayValue(7)).toBe('7');
    expect(displayValue(true)).toBe('true');
    expect(displayValue(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01-02T00:00:00.000Z');
  });

  it('renders nothing for values with no sensible text form', () => {
    // Never "[object Object]" or "null" in a cell, a filter option, or a search comparison.
    expect(displayValue(null)).toBe('');
    expect(displayValue(undefined)).toBe('');
    expect(displayValue({ a: 1 })).toBe('');
  });
});

describe('searchRows', () => {
  it('returns everything for an empty query', () => {
    expect(searchRows(rows, columns, '   ')).toHaveLength(4);
  });

  it('searches every column when no fields are named', () => {
    expect(names(searchRows(rows, columns, 'payroll'))).toEqual(['Ada', 'Alan']);
  });

  it('searches only the named fields when they are given', () => {
    // 'Payroll' is a team, not a name, so a name-scoped search must not match it.
    expect(names(searchRows(rows, columns, 'payroll', ['name']))).toEqual([]);
    expect(names(searchRows(rows, columns, 'gra', ['name']))).toEqual(['Grace']);
  });

  it('is case insensitive', () => {
    expect(names(searchRows(rows, columns, 'ADA'))).toEqual(['Ada']);
  });
});

describe('applyColumnFilters', () => {
  it('filters by exact rendered value', () => {
    expect(names(applyColumnFilters(rows, columns, { team: 'Payroll' }))).toEqual(['Ada', 'Alan']);
  });

  it('treats ALL and empty as no filter', () => {
    expect(applyColumnFilters(rows, columns, { team: 'ALL' })).toHaveLength(4);
    expect(applyColumnFilters(rows, columns, { team: '' })).toHaveLength(4);
  });

  it('ignores an unknown column rather than emptying the table', () => {
    expect(applyColumnFilters(rows, columns, { nope: 'x' })).toHaveLength(4);
  });

  it('lets a column filter function override equality', () => {
    const custom: TableColumn<Row>[] = [
      { id: 'score', accessorKey: 'score', filterFn: (row, value) => row.score >= Number(value) },
    ];
    expect(names(applyColumnFilters(rows, custom, { score: '30' }))).toEqual(['Ada', 'Edsger']);
  });

  it('combines filters', () => {
    expect(names(applyColumnFilters(rows, columns, { team: 'Payroll', name: 'Ada' }))).toEqual([
      'Ada',
    ]);
  });
});

describe('sortRows', () => {
  it('preserves the incoming order when nothing is sorted', () => {
    expect(names(sortRows(rows, columns, null))).toEqual(['Ada', 'Grace', 'Alan', 'Edsger']);
  });

  it('sorts numbers numerically in both directions', () => {
    expect(
      sortRows(rows, columns, { columnId: 'score', direction: 'asc' }).map((r) => r.score),
    ).toEqual([10, 20, 30, 40]);
    expect(
      sortRows(rows, columns, { columnId: 'score', direction: 'desc' }).map((r) => r.score),
    ).toEqual([40, 30, 20, 10]);
  });

  it('sorts text naturally rather than by code unit', () => {
    const natural: Row[] = [
      { id: 'a', name: 'Item 10', team: 't', score: 0 },
      { id: 'b', name: 'Item 9', team: 't', score: 0 },
    ];
    expect(names(sortRows(natural, columns, { columnId: 'name', direction: 'asc' }))).toEqual([
      'Item 9',
      'Item 10',
    ]);
  });

  it('sorts empty values last in both directions', () => {
    const withBlank: Row[] = [
      { id: 'a', name: 'A', team: 't', score: 1, note: 'z' },
      { id: 'b', name: 'B', team: 't', score: 2, note: null },
      { id: 'c', name: 'C', team: 't', score: 3, note: 'a' },
    ];
    const noteColumn: TableColumn<Row>[] = [{ id: 'note', accessorKey: 'note' }];
    expect(names(sortRows(withBlank, noteColumn, { columnId: 'note', direction: 'asc' }))).toEqual([
      'C',
      'A',
      'B',
    ]);
    expect(names(sortRows(withBlank, noteColumn, { columnId: 'note', direction: 'desc' }))).toEqual(
      ['A', 'C', 'B'],
    );
  });

  it('leaves the order alone for an unknown sort column', () => {
    expect(names(sortRows(rows, columns, { columnId: 'missing', direction: 'asc' }))).toEqual([
      'Ada',
      'Grace',
      'Alan',
      'Edsger',
    ]);
  });

  it('does not mutate its input', () => {
    const original = [...rows];
    sortRows(rows, columns, { columnId: 'score', direction: 'asc' });
    expect(rows).toEqual(original);
  });
});

describe('pagination', () => {
  it('always reports at least one page, even with no rows', () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(21, 10)).toBe(3);
  });

  it('clamps a page into range', () => {
    // The regression this guards: filter while on page 3, and the table renders nothing because
    // the page index outlives the result set.
    expect(clampPage(99, 3)).toBe(3);
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(2, 3)).toBe(2);
  });

  it('slices the requested page', () => {
    expect(names(paginate(rows, 1, 2))).toEqual(['Ada', 'Grace']);
    expect(names(paginate(rows, 2, 2))).toEqual(['Alan', 'Edsger']);
    expect(paginate(rows, 3, 2)).toEqual([]);
  });
});

describe('columns', () => {
  const visible = { name: true, team: true, score: true };

  it('keeps declared order when nothing is pinned', () => {
    expect(orderColumns(columns, visible, {}).map((c) => c.id)).toEqual(['name', 'team', 'score']);
  });

  it('puts left-pinned first and right-pinned last', () => {
    expect(
      orderColumns(columns, visible, { team: 'left', name: 'right' }).map((c) => c.id),
    ).toEqual(['team', 'score', 'name']);
  });

  it('drops hidden columns', () => {
    expect(
      orderColumns(columns, { name: true, team: false, score: true }, {}).map((c) => c.id),
    ).toEqual(['name', 'score']);
  });

  it('cycles a pin through left, right and unpinned', () => {
    let pins = nextPinState({}, 'team');
    expect(pins.team).toBe('left');
    pins = nextPinState(pins, 'team');
    expect(pins.team).toBe('right');
    pins = nextPinState(pins, 'team');
    expect(pins.team).toBe(false);
  });

  it('cycles a sort through ascending, descending and none', () => {
    let sort = nextSortState(null, 'score');
    expect(sort).toEqual({ columnId: 'score', direction: 'asc' });
    sort = nextSortState(sort, 'score');
    expect(sort).toEqual({ columnId: 'score', direction: 'desc' });
    sort = nextSortState(sort, 'score');
    expect(sort).toBeNull();
  });

  it('starts ascending again when a different column is sorted', () => {
    expect(nextSortState({ columnId: 'score', direction: 'desc' }, 'name')).toEqual({
      columnId: 'name',
      direction: 'asc',
    });
  });
});

describe('resolveFilterOptions', () => {
  it('derives the distinct values of a filterable column, sorted', () => {
    const options = resolveFilterOptions(rows, columns).team ?? [];
    expect(options.map((o) => o.value)).toEqual(['Attendance', 'Leave', 'Payroll']);
  });

  it('prefers explicit options over derived ones', () => {
    const explicit: TableColumn<Row>[] = [
      {
        id: 'team',
        accessorKey: 'team',
        filterable: true,
        filterOptions: [{ label: 'Only payroll', value: 'Payroll' }],
      },
    ];
    expect(resolveFilterOptions(rows, explicit).team).toEqual([
      { label: 'Only payroll', value: 'Payroll' },
    ]);
  });

  it('gives no options for columns that are not filterable', () => {
    expect(resolveFilterOptions(rows, columns).name).toBeUndefined();
  });
});

describe('hasActiveFilters', () => {
  it('is true for a search query or a real column filter', () => {
    expect(hasActiveFilters('ada', {})).toBe(true);
    expect(hasActiveFilters('', { team: 'Payroll' })).toBe(true);
  });

  it('is false for whitespace, ALL, or nothing', () => {
    expect(hasActiveFilters('   ', {})).toBe(false);
    expect(hasActiveFilters('', { team: 'ALL' })).toBe(false);
    expect(hasActiveFilters('', {})).toBe(false);
  });
});
