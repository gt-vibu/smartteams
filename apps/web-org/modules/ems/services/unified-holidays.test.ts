import { describe, it, expect } from 'vitest';
import type { Holiday, EmployeeHolidaySelection } from '@smarteam/contracts';

describe('Unified Enterprise Holiday Calendar Logic', () => {
  const mandatoryHolidays: Holiday[] = [
    {
      id: 'h-1',
      holidayDate: '2026-10-02',
      name: 'Mahatma Gandhi Jayanti',
      isOptional: false,
      isActive: true,
    },
    {
      id: 'h-2',
      holidayDate: '2026-11-01',
      name: 'Kannada Rajyotsava',
      isOptional: false,
      isActive: true,
    },
  ];

  const optionalHolidays: Holiday[] = [
    {
      id: 'h-3',
      holidayDate: '2026-09-14',
      name: 'Ganesh Chaturthi',
      isOptional: true,
      isActive: true,
    },
    {
      id: 'h-4',
      holidayDate: '2026-09-24',
      name: 'Onam',
      isOptional: true,
      isActive: true,
    },
  ];

  const selections: EmployeeHolidaySelection[] = [
    {
      id: 'sel-1',
      employeeId: 'emp-1',
      holidayId: 'h-3',
      year: 2026,
      status: 'CONFIRMED',
      selectedAt: '2026-09-01T00:00:00.000Z',
    },
  ];

  it('unifies mandatory and optional holidays in chronological order', () => {
    const selectedIds = new Set(selections.map((s) => s.holidayId));

    const unified = [
      ...mandatoryHolidays.map((h) => ({
        ...h,
        typeLabel: 'Public Holiday',
        statusLabel: 'Required',
        isSelected: false,
      })),
      ...optionalHolidays.map((h) => ({
        ...h,
        typeLabel: 'Optional Holiday',
        statusLabel: selectedIds.has(h.id) ? 'Selected' : 'Available',
        isSelected: selectedIds.has(h.id),
      })),
    ].sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));

    expect(unified.length).toBe(4);
    // Chronological order check: 2026-09-14, 2026-09-24, 2026-10-02, 2026-11-01
    expect(unified[0]?.name).toBe('Ganesh Chaturthi');
    expect(unified[0]?.typeLabel).toBe('Optional Holiday');
    expect(unified[0]?.statusLabel).toBe('Selected');
    expect(unified[0]?.isSelected).toBe(true);

    expect(unified[1]?.name).toBe('Onam');
    expect(unified[1]?.typeLabel).toBe('Optional Holiday');
    expect(unified[1]?.statusLabel).toBe('Available');
    expect(unified[1]?.isSelected).toBe(false);

    expect(unified[2]?.name).toBe('Mahatma Gandhi Jayanti');
    expect(unified[2]?.typeLabel).toBe('Public Holiday');
    expect(unified[2]?.statusLabel).toBe('Required');

    expect(unified[3]?.name).toBe('Kannada Rajyotsava');
    expect(unified[3]?.typeLabel).toBe('Public Holiday');
    expect(unified[3]?.statusLabel).toBe('Required');
  });

  it('filters by holiday type accurately', () => {
    const publicOnly = mandatoryHolidays.filter((h) => !h.isOptional);
    expect(publicOnly.length).toBe(2);

    const optionalOnly = optionalHolidays.filter((h) => h.isOptional);
    expect(optionalOnly.length).toBe(2);
  });
});
