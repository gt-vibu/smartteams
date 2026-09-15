import { describe, it, expect } from 'vitest';
import {
  parseTimesheet,
  DEFAULT_JOB_TYPES,
  formatWorkMinutes,
  entriesByDate,
  type Timesheet,
} from '@smarteam/contracts';

describe('Project-Centric Timesheet & Zoho-style Time Entry Validation', () => {
  it('provides default enterprise job types', () => {
    expect(DEFAULT_JOB_TYPES).toContain('Development');
    expect(DEFAULT_JOB_TYPES).toContain('Testing');
    expect(DEFAULT_JOB_TYPES).toContain('Code Review');
    expect(DEFAULT_JOB_TYPES).toContain('Bug Fixing');
    expect(DEFAULT_JOB_TYPES).toContain('Documentation');
    expect(DEFAULT_JOB_TYPES).toContain('Meeting');
    expect(DEFAULT_JOB_TYPES).toContain('Research');
    expect(DEFAULT_JOB_TYPES).toContain('Deployment');
    expect(DEFAULT_JOB_TYPES).toContain('Support');
    expect(DEFAULT_JOB_TYPES).toContain('UI/UX Design');
  });

  it('correctly parses structured project-centric timesheet entries', () => {
    const rawTimesheet = {
      id: '11111111-1111-4111-8111-111111111111',
      employeeId: '22222222-2222-4222-8222-222222222222',
      periodId: '33333333-3333-4333-8333-333333333333',
      status: 'DRAFT',
      totalMinutes: 480,
      regularMinutes: 480,
      overtimeMinutes: 0,
      entries: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          timesheetId: '11111111-1111-4111-8111-111111111111',
          workDate: '2026-09-08',
          minutes: 480,
          regularMinutes: 480,
          overtimeMinutes: 0,
          description: 'Frontend architectural overhaul',
          projectId: '55555555-5555-4555-8555-555555555555',
          projectName: 'Project Apollo',
          jobName: 'Development',
          workItem: 'APOLLO-102',
          billable: true,
          startTime: '09:00',
          endTime: '17:00',
        },
      ],
    };

    const parsed = parseTimesheet(rawTimesheet);
    expect(parsed).not.toBeNull();
    expect(parsed?.entries?.[0]?.projectName).toBe('Project Apollo');
    expect(parsed?.entries?.[0]?.jobName).toBe('Development');
    expect(parsed?.entries?.[0]?.workItem).toBe('APOLLO-102');
    expect(parsed?.entries?.[0]?.billable).toBe(true);
  });

  it('groups entries by date with total minutes calculation', () => {
    const sheet: Pick<Timesheet, 'entries'> = {
      entries: [
        {
          id: 'd0000000-0000-0000-0000-000000000001',
          workDate: '2026-09-08',
          minutes: 300,
          jobName: 'Development',
          projectName: 'Project Apollo',
        },
        {
          id: 'd0000000-0000-0000-0000-000000000002',
          workDate: '2026-09-08',
          minutes: 180,
          jobName: 'Testing',
          projectName: 'Project Apollo',
        },
        {
          id: 'd0000000-0000-0000-0000-000000000003',
          workDate: '2026-09-07',
          minutes: 420,
          jobName: 'Code Review',
          projectName: 'Internal EMS',
        },
      ],
    };

    const grouped = entriesByDate(sheet);
    expect(grouped.length).toBe(2);
    expect(grouped[0]?.workDate).toBe('2026-09-08');
    expect(grouped[0]?.totalMinutes).toBe(480);
    expect(grouped[0]?.entries.length).toBe(2);

    expect(grouped[1]?.workDate).toBe('2026-09-07');
    expect(grouped[1]?.totalMinutes).toBe(420);
    expect(grouped[1]?.entries.length).toBe(1);
  });

  it('formats work minutes accurately for display', () => {
    expect(formatWorkMinutes(null)).toBe('--');
    expect(formatWorkMinutes(undefined)).toBe('--');
    expect(formatWorkMinutes(0)).toBe('0m');
    expect(formatWorkMinutes(45)).toBe('45m');
    expect(formatWorkMinutes(60)).toBe('1h 0m');
    expect(formatWorkMinutes(510)).toBe('8h 30m');
  });
});
