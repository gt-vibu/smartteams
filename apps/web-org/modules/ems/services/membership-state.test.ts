import { describe, expect, it } from 'vitest';
import type { Project, ProjectMember, Team, TeamMember } from '@smarteam/contracts';
import {
  projectMembershipsFor,
  teamMembershipsFor,
  totalActiveAllocation,
} from './membership-state';

const EMPLOYEE = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

function team(members: TeamMember[]): Team {
  return {
    id: TEAM_ID,
    organizationId: '99999999-9999-4999-8999-999999999999',
    name: 'Platform Core',
    branchId: null,
    teamLeadEmployeeId: null,
    members,
  };
}

function teamMember(overrides: Partial<TeamMember>): TeamMember {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    teamId: TEAM_ID,
    employeeId: EMPLOYEE,
    joinedAt: '2026-01-01',
    leftAt: null,
    ...overrides,
  };
}

function project(members: ProjectMember[]): Project {
  return {
    id: PROJECT_ID,
    organizationId: '99999999-9999-4999-8999-999999999999',
    name: 'Smarteam EMS',
    code: 'SMAR-EMS',
    status: 'ACTIVE',
    members,
  };
}

function projectMember(overrides: Partial<ProjectMember>): ProjectMember {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    projectId: PROJECT_ID,
    employeeId: EMPLOYEE,
    projectRole: null,
    allocationPercentage: null,
    startsOn: '2026-01-01',
    endsOn: null,
    ...overrides,
  };
}

/** Reads the single membership under test; fails loudly rather than yielding `undefined`. */
function only<T>(values: T[]): T {
  expect(values).toHaveLength(1);
  const value = values.at(0);
  if (!value) throw new Error('expected exactly one membership');
  return value;
}

/**
 * The whole point of this module is that "left the team" and "never joined" are different
 * facts. A regression that collapses them shows a departed member as though they had never
 * been there, which is exactly the kind of quiet data loss the drawer must not introduce.
 */
describe('team membership state', () => {
  it('reports an open member row as ACTIVE and exposes the id needed to end it', () => {
    const membership = only(teamMembershipsFor([team([teamMember({})])], EMPLOYEE));

    expect(membership.state).toBe('ACTIVE');
    expect(membership.memberId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('reports a closed member row as ENDED, not as a non-member', () => {
    const membership = only(
      teamMembershipsFor([team([teamMember({ leftAt: '2026-06-30' })])], EMPLOYEE),
    );

    expect(membership.state).toBe('ENDED');
    expect(membership.endedOn).toBe('2026-06-30');
    // Nothing to close, so no member id is offered.
    expect(membership.memberId).toBeNull();
  });

  it('prefers the open row when the employee rejoined after leaving', () => {
    const membership = only(
      teamMembershipsFor(
        [
          team([
            teamMember({ joinedAt: '2024-01-01', leftAt: '2025-01-01' }),
            teamMember({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', joinedAt: '2026-01-01' }),
          ]),
        ],
        EMPLOYEE,
      ),
    );

    expect(membership.state).toBe('ACTIVE');
    expect(membership.memberId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('ignores other employees on the same team', () => {
    const membership = only(
      teamMembershipsFor([team([teamMember({ employeeId: OTHER })])], EMPLOYEE),
    );

    expect(membership.state).toBe('NOT_A_MEMBER');
  });
});

describe('project membership state', () => {
  it('carries the allocation of the active row only', () => {
    const membership = only(
      projectMembershipsFor(
        [project([projectMember({ projectRole: 'Contributor', allocationPercentage: 60 })])],
        EMPLOYEE,
      ),
    );

    expect(membership.state).toBe('ACTIVE');
    expect(membership.allocationPercentage).toBe(60);
  });

  it('does not report an allocation for an ended assignment', () => {
    const membership = only(
      projectMembershipsFor(
        [
          project([
            projectMember({
              allocationPercentage: 60,
              startsOn: '2025-01-01',
              endsOn: '2026-05-31',
            }),
          ]),
        ],
        EMPLOYEE,
      ),
    );

    expect(membership.state).toBe('ENDED');
    expect(membership.allocationPercentage).toBeNull();
    expect(membership.endedOn).toBe('2026-05-31');
  });

  it('sums only active allocations', () => {
    const memberships = projectMembershipsFor(
      [
        project([
          projectMember({ allocationPercentage: 40 }),
          projectMember({
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            allocationPercentage: 90,
            startsOn: '2024-01-01',
            endsOn: '2025-12-31',
          }),
        ]),
      ],
      EMPLOYEE,
    );

    expect(totalActiveAllocation(memberships)).toBe(40);
  });

  it('treats a missing allocation as unknown rather than zero', () => {
    const membership = only(
      projectMembershipsFor([project([projectMember({ allocationPercentage: null })])], EMPLOYEE),
    );

    expect(membership.allocationPercentage).toBeNull();
  });
});
