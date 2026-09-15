import { describe, expect, it } from 'vitest';
import type { Branch, Employee, Project, Team } from '@smarteam/contracts';
import { indexEmployees, teamsForEmployee, toProjectView, toTeamView } from './team-directory';

const ORG = '99999999-9999-4999-8999-999999999999';
const ASHA = '33333333-3333-4333-8333-333333333333';
const RAVI = '44444444-4444-4444-8444-444444444444';
const GHOST = '55555555-5555-4555-8555-555555555555';
const BRANCH = '66666666-6666-4666-8666-666666666666';

function employee(id: string, firstName: string, number: string): Employee {
  return {
    id,
    organizationId: ORG,
    employeeNumber: number,
    firstName,
    lastName: 'Rao',
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    version: 1,
  } as unknown as Employee;
}

const EMPLOYEES = [employee(ASHA, 'Asha', 'EMP-001'), employee(RAVI, 'Ravi', 'EMP-002')];
const BRANCHES: Branch[] = [{ id: BRANCH, organizationId: ORG, name: 'HQ Bengaluru', code: 'HQ' }];

function team(members: Team['members']): Team {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: ORG,
    name: 'Platform Core',
    branchId: BRANCH,
    teamLeadEmployeeId: ASHA,
    members,
  };
}

/**
 * The roster joins membership ids to the employee directory. The failure that matters is a name
 * appearing for an id the directory does not contain — that would be an invented person.
 */
describe('team view', () => {
  it('resolves member and lead names from the employee directory', () => {
    const view = toTeamView(
      team([{ id: 'm1', teamId: 't', employeeId: RAVI, joinedAt: '2026-01-01', leftAt: null }]),
      indexEmployees(EMPLOYEES),
      BRANCHES,
    );

    expect(view.branchName).toBe('HQ Bengaluru');
    expect(view.lead?.displayName).toBe('Asha Rao');
    expect(view.activeMembers[0]?.displayName).toBe('Ravi Rao');
    expect(view.activeMembers[0]?.employeeNumber).toBe('EMP-002');
  });

  it('says an unknown employee id is no longer in the directory rather than naming them', () => {
    const view = toTeamView(
      team([{ id: 'm1', teamId: 't', employeeId: GHOST, joinedAt: '2026-01-01', leftAt: null }]),
      indexEmployees(EMPLOYEES),
      BRANCHES,
    );

    expect(view.activeMembers[0]?.displayName).toBe('No longer in the directory');
    expect(view.activeMembers[0]?.employeeNumber).toBe('--');
  });

  it('separates ended memberships from active ones and keeps the leave date', () => {
    const view = toTeamView(
      team([
        { id: 'm1', teamId: 't', employeeId: RAVI, joinedAt: '2024-01-01', leftAt: '2026-06-30' },
        { id: 'm2', teamId: 't', employeeId: ASHA, joinedAt: '2026-01-01', leftAt: null },
      ]),
      indexEmployees(EMPLOYEES),
      BRANCHES,
    );

    expect(view.activeMembers).toHaveLength(1);
    expect(view.pastMembers).toHaveLength(1);
    expect(view.pastMembers[0]?.until).toBe('2026-06-30');
  });

  it('reports no branch rather than a placeholder name when none is set', () => {
    const view = toTeamView({ ...team([]), branchId: null }, indexEmployees(EMPLOYEES), BRANCHES);
    expect(view.branchName).toBeNull();
  });
});

describe('teamsForEmployee', () => {
  const roster = [
    toTeamView(
      team([{ id: 'm1', teamId: 't', employeeId: RAVI, joinedAt: '2026-01-01', leftAt: null }]),
      indexEmployees(EMPLOYEES),
      BRANCHES,
    ),
  ];

  it('counts the lead as a member of their own team', () => {
    expect(teamsForEmployee(roster, ASHA)).toHaveLength(1);
  });

  it('counts an active member', () => {
    expect(teamsForEmployee(roster, RAVI)).toHaveLength(1);
  });

  it('returns nothing without an employee id, rather than every team', () => {
    // A user with no employee record must not appear to belong to the whole organization.
    expect(teamsForEmployee(roster, null)).toHaveLength(0);
  });

  it('does not count an ended membership', () => {
    const ended = [
      toTeamView(
        {
          ...team([
            {
              id: 'm1',
              teamId: 't',
              employeeId: RAVI,
              joinedAt: '2024-01-01',
              leftAt: '2025-01-01',
            },
          ]),
          teamLeadEmployeeId: null,
        },
        indexEmployees(EMPLOYEES),
        BRANCHES,
      ),
    ];
    expect(teamsForEmployee(ended, RAVI)).toHaveLength(0);
  });
});

describe('project view', () => {
  function project(members: Project['members']): Project {
    return {
      id: '22222222-2222-4222-8222-222222222222',
      organizationId: ORG,
      name: 'Smarteam EMS',
      code: 'SMAR-EMS',
      status: 'ACTIVE',
      branchId: BRANCH,
      members,
    };
  }

  it('carries role and allocation for active allocations', () => {
    const view = toProjectView(
      project([
        {
          id: 'p1',
          projectId: 'p',
          employeeId: ASHA,
          projectRole: 'Lead',
          allocationPercentage: 60,
          startsOn: '2026-01-01',
          endsOn: null,
        },
      ]),
      indexEmployees(EMPLOYEES),
      BRANCHES,
    );

    expect(view.activeMembers[0]?.projectRole).toBe('Lead');
    expect(view.activeMembers[0]?.allocationPercentage).toBe(60);
  });

  it('keeps a missing allocation null rather than defaulting it to zero', () => {
    const view = toProjectView(
      project([
        {
          id: 'p1',
          projectId: 'p',
          employeeId: ASHA,
          projectRole: null,
          allocationPercentage: null,
          startsOn: '2026-01-01',
          endsOn: null,
        },
      ]),
      indexEmployees(EMPLOYEES),
      BRANCHES,
    );

    expect(view.activeMembers[0]?.allocationPercentage).toBeNull();
  });
});
