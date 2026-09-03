import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import { MembershipService } from './membership.service';
import type { DomainContext } from '../../common/context/domain-context';

const ORG = '11111111-1111-4111-8111-111111111111';
const TEAM = '55555555-5555-4555-8555-555555555555';
const PROJECT = '66666666-6666-4666-8666-666666666666';
const MEMBER = '77777777-7777-4777-8777-777777777777';
const EMPLOYEE = '88888888-8888-4888-8888-888888888888';

function context(permissions: string[]): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: '33333333-3333-4333-8333-333333333333' },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
  };
}

function setup(
  options: { teamMember?: unknown; projectMember?: unknown; teamCreateError?: Error } = {},
) {
  const tx = {
    team: { findFirst: jest.fn().mockResolvedValue({ id: TEAM, organizationId: ORG }) },
    employee: { findFirst: jest.fn().mockResolvedValue({ id: EMPLOYEE, organizationId: ORG }) },
    teamMember: {
      findFirst: jest.fn().mockResolvedValue(options.teamMember ?? null),
      create: jest.fn(() =>
        options.teamCreateError
          ? Promise.reject(options.teamCreateError)
          : Promise.resolve({ id: MEMBER, teamId: TEAM, employeeId: EMPLOYEE }),
      ),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: MEMBER, ...args.data }),
      ),
    },
    projectMember: {
      findFirst: jest.fn().mockResolvedValue(options.projectMember ?? null),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: MEMBER, ...args.data }),
      ),
    },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { tx, audit, service: new MembershipService(database as never, audit) };
}

const activeTeamMember = {
  id: MEMBER,
  teamId: TEAM,
  organizationId: ORG,
  joinedAt: new Date('2026-01-01'),
  leftAt: null,
};

const activeProjectMember = {
  id: MEMBER,
  projectId: PROJECT,
  organizationId: ORG,
  startsOn: new Date('2026-01-01'),
  endsOn: null,
};

describe('MembershipService.endTeamMembership', () => {
  it('closes an active membership by setting leftAt rather than deleting the row', async () => {
    const { service, tx, audit } = setup({ teamMember: activeTeamMember });
    await service.endTeamMembership(context(['teams.write']), TEAM, MEMBER, {
      leftAt: '2026-06-30',
    });

    // Soft close preserves history for allocation and reporting.
    expect(tx.teamMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { leftAt: new Date('2026-06-30T00:00:00.000Z') } }),
    );
    expect(audit.record).toHaveBeenCalled();
  });

  it('requires teams.write', async () => {
    const { service } = setup({ teamMember: activeTeamMember });
    await expect(
      service.endTeamMembership(context(['teams.read']), TEAM, MEMBER, { leftAt: '2026-06-30' }),
    ).rejects.toThrow(ForbiddenDomainError);
  });

  it('scopes the lookup by organization and team, so another tenant cannot be targeted', async () => {
    const { service, tx } = setup({ teamMember: activeTeamMember });
    await service.endTeamMembership(context(['teams.write']), TEAM, MEMBER, {
      leftAt: '2026-06-30',
    });
    expect(tx.teamMember.findFirst).toHaveBeenCalledWith({
      where: { id: MEMBER, teamId: TEAM, organizationId: ORG },
    });
  });

  it('rejects an unknown member', async () => {
    const { service } = setup({ teamMember: null });
    await expect(
      service.endTeamMembership(context(['teams.write']), TEAM, MEMBER, { leftAt: '2026-06-30' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects closing a membership that already ended', async () => {
    const { service } = setup({
      teamMember: { ...activeTeamMember, leftAt: new Date('2026-05-01') },
    });
    await expect(
      service.endTeamMembership(context(['teams.write']), TEAM, MEMBER, { leftAt: '2026-06-30' }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects an end date before the join date', async () => {
    const { service } = setup({ teamMember: activeTeamMember });
    await expect(
      service.endTeamMembership(context(['teams.write']), TEAM, MEMBER, { leftAt: '2025-12-31' }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('MembershipService.endProjectMembership', () => {
  it('closes an active allocation by setting endsOn', async () => {
    const { service, tx } = setup({ projectMember: activeProjectMember });
    await service.endProjectMembership(context(['projects.write']), PROJECT, MEMBER, {
      endsOn: '2026-06-30',
    });
    expect(tx.projectMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { endsOn: new Date('2026-06-30T00:00:00.000Z') } }),
    );
  });

  it('requires projects.write', async () => {
    const { service } = setup({ projectMember: activeProjectMember });
    await expect(
      service.endProjectMembership(context(['projects.read']), PROJECT, MEMBER, {
        endsOn: '2026-06-30',
      }),
    ).rejects.toThrow(ForbiddenDomainError);
  });

  it('rejects an allocation that already ended', async () => {
    const { service } = setup({
      projectMember: { ...activeProjectMember, endsOn: new Date('2026-05-01') },
    });
    await expect(
      service.endProjectMembership(context(['projects.write']), PROJECT, MEMBER, {
        endsOn: '2026-06-30',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects an end date before the start date', async () => {
    const { service } = setup({ projectMember: activeProjectMember });
    await expect(
      service.endProjectMembership(context(['projects.write']), PROJECT, MEMBER, {
        endsOn: '2025-12-31',
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('MembershipService.addTeamMember', () => {
  it('reports an overlapping rejoin as a conflict rather than an unhandled failure', async () => {
    // Postgres rejects this with `team_members_no_overlap`; a driver error escaping unmapped
    // reaches the client as a 500, which tells the user nothing about what went wrong.
    const { service } = setup({
      teamCreateError: new Error(
        'conflicting key value violates exclusion constraint "team_members_no_overlap"',
      ),
    });

    await expect(
      service.addTeamMember(context(['teams.write']), TEAM, {
        employeeId: EMPLOYEE,
        joinedAt: '2026-09-02',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('lets an unrelated database failure propagate untouched', async () => {
    const failure = new Error('connection terminated unexpectedly');
    const { service } = setup({ teamCreateError: failure });

    await expect(
      service.addTeamMember(context(['teams.write']), TEAM, {
        employeeId: EMPLOYEE,
        joinedAt: '2026-09-02',
      }),
    ).rejects.toThrow(failure);
  });

  it('requires teams.write', async () => {
    const { service } = setup();

    await expect(
      service.addTeamMember(context(['teams.read']), TEAM, {
        employeeId: EMPLOYEE,
        joinedAt: '2026-09-02',
      }),
    ).rejects.toThrow(ForbiddenDomainError);
  });
});
