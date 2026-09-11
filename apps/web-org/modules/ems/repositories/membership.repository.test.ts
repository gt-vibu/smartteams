import { afterEach, describe, expect, it, vi } from 'vitest';
import { membershipRepository, workforceRepository } from './workforce.repository';

const ORG = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';
const TEAM = '55555555-5555-4555-8555-555555555555';
const MEMBER_ROW = '99999999-9999-4999-8999-999999999999';
const PROJECT = '66666666-6666-4666-8666-666666666666';

function mockFetch(status: number, body: unknown) {
  const spy = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { getSetCookie: () => [] },
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'smarteam_session_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('membershipRepository', () => {
  it('posts a team member to the tenant-scoped route', async () => {
    const spy = mockFetch(201, { id: 'm1' });
    await membershipRepository.addTeamMember(ORG, TEAM, {
      employeeId: EMPLOYEE,
      joinedAt: '2026-09-01',
    });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/v1/organizations/${ORG}/teams/${TEAM}/members`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      employeeId: EMPLOYEE,
      joinedAt: '2026-09-01',
    });
  });

  it('sends the CSRF header on membership mutations', async () => {
    document.cookie = 'smarteam_session_csrf=csrf-value';
    const spy = mockFetch(201, {});
    await membershipRepository.addTeamMember(ORG, TEAM, {
      employeeId: EMPLOYEE,
      joinedAt: '2026-09-01',
    });

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-value');
  });

  it('posts a project member including the allocation percentage the API accepts', async () => {
    const spy = mockFetch(201, {});
    await membershipRepository.addProjectMember(ORG, PROJECT, {
      employeeId: EMPLOYEE,
      allocationPercentage: 40,
      startsOn: '2026-09-01',
    });

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ allocationPercentage: 40 });
  });

  it('surfaces a 403 rather than reporting the assignment as saved', async () => {
    mockFetch(403, { detail: 'Forbidden' });
    await expect(
      membershipRepository.addTeamMember(ORG, TEAM, {
        employeeId: EMPLOYEE,
        joinedAt: '2026-09-01',
      }),
    ).rejects.toThrow();
  });

  it('ends a team membership by date rather than deleting it', async () => {
    const spy = mockFetch(201, {});
    await membershipRepository.endTeamMember(ORG, TEAM, MEMBER_ROW, '2026-06-30');

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/teams/${TEAM}/members/${MEMBER_ROW}/end`);
    // A soft close preserves history; a DELETE would discard it.
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ leftAt: '2026-06-30' });
  });

  it('ends a project allocation by date', async () => {
    const spy = mockFetch(201, {});
    await membershipRepository.endProjectMember(ORG, PROJECT, MEMBER_ROW, '2026-06-30');

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/projects/${PROJECT}/members/${MEMBER_ROW}/end`);
    expect(JSON.parse(init.body as string)).toEqual({ endsOn: '2026-06-30' });
  });

  it('surfaces the conflict when a membership has already ended', async () => {
    mockFetch(409, { detail: 'Team membership has already ended' });
    await expect(
      membershipRepository.endTeamMember(ORG, TEAM, MEMBER_ROW, '2026-06-30'),
    ).rejects.toThrow();
  });

  it('exposes exactly the four membership operations the API supports', () => {
    // No hard delete: the API has no such route, and adding one locally would lose history.
    expect(Object.keys(membershipRepository).sort()).toEqual([
      'addProjectMember',
      'addTeamMember',
      'endProjectMember',
      'endTeamMember',
    ]);
  });
});

describe('team and project reads carry their members', () => {
  it('parses members embedded in the team list', async () => {
    mockFetch(200, [
      {
        id: TEAM,
        organizationId: ORG,
        name: 'Platform',
        members: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            teamId: TEAM,
            employeeId: EMPLOYEE,
            joinedAt: '2026-01-01',
          },
        ],
      },
    ]);
    const teams = await workforceRepository.listTeams(ORG);
    expect(teams[0]?.members?.[0]?.employeeId).toBe(EMPLOYEE);
  });

  it('coerces the decimal allocation the API serialises as a string', async () => {
    mockFetch(200, [
      {
        id: PROJECT,
        organizationId: ORG,
        name: 'Apollo',
        members: [
          {
            id: '88888888-8888-4888-8888-888888888888',
            projectId: PROJECT,
            employeeId: EMPLOYEE,
            allocationPercentage: '40.00',
            startsOn: '2026-01-01',
          },
        ],
      },
    ]);
    const projects = await workforceRepository.listProjects(ORG);
    expect(projects[0]?.members?.[0]?.allocationPercentage).toBe(40);
  });
});
