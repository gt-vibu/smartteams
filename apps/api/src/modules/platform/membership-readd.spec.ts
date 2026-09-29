import { ConflictError } from '../../common/errors/domain-error';
import { MembershipService } from './membership.service';
import type { DomainContext } from '../../common/context/domain-context';

const ORG = '11111111-1111-4111-8111-111111111111';
const TEAM = '55555555-5555-4555-8555-555555555555';
const PROJECT = '66666666-6666-4666-8666-666666666666';
const MEMBER = '77777777-7777-4777-8777-777777777777';
const EMPLOYEE = '88888888-8888-4888-8888-888888888888';

const context = (permissions: string[]): DomainContext => ({
  organizationId: ORG,
  accessMode: 'NATIVE',
  actor: { type: 'USER', userId: '33333333-3333-4333-8333-333333333333' },
  correlationId: 'c',
  requestId: 'r',
  permissions: new Set(permissions),
});

/** A tenant where the one employee's last membership is the given row, or none. */
function setup(earlier: { team?: unknown; project?: unknown } = {}) {
  const tx = {
    team: { findFirst: jest.fn().mockResolvedValue({ id: TEAM, status: 'ACTIVE' }) },
    project: {
      findFirst: jest.fn().mockResolvedValue({ id: PROJECT, name: 'Atlas', status: 'ACTIVE' }),
    },
    employee: {
      findFirst: jest.fn().mockResolvedValue({
        id: EMPLOYEE,
        firstName: 'Alex',
        lastName: 'J',
        status: 'ACTIVE',
      }),
    },
    teamMember: {
      findFirst: jest.fn().mockResolvedValue(earlier.team ?? null),
      create: jest.fn().mockResolvedValue({ id: 'new-team-member' }),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: MEMBER, ...args.data }),
      ),
    },
    projectMember: {
      findFirst: jest.fn().mockResolvedValue(earlier.project ?? null),
      create: jest.fn().mockResolvedValue({ id: 'new-project-member' }),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: MEMBER, ...args.data }),
      ),
    },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { tx, service: new MembershipService(database as never, audit) };
}

describe('adding a former member back', () => {
  it('reopens a team membership that ended the same day', async () => {
    const { tx, service } = setup({
      team: { id: MEMBER, joinedAt: new Date('2026-09-20'), leftAt: new Date('2026-09-28') },
    });
    const result = await service.addTeamMember(context(['teams.write']), TEAM, {
      employeeId: EMPLOYEE,
      joinedAt: '2026-09-28',
    });
    expect(tx.teamMember.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: MEMBER, leftAt: null });
  });

  it('starts a new team stint when there is no touching membership', async () => {
    const { tx, service } = setup();
    await service.addTeamMember(context(['teams.write']), TEAM, {
      employeeId: EMPLOYEE,
      joinedAt: '2026-09-28',
    });
    expect(tx.teamMember.create).toHaveBeenCalled();
  });

  it('reopens an ended project assignment instead of calling the person "already on" it', async () => {
    const { tx, service } = setup({
      project: { id: MEMBER, startsOn: new Date('2026-09-20'), endsOn: new Date('2026-09-28') },
    });
    await service.addProjectMember(context(['projects.write']), PROJECT, {
      employeeId: EMPLOYEE,
      startsOn: '2026-09-28',
    });
    expect(tx.projectMember.create).not.toHaveBeenCalled();
    const [call] = tx.projectMember.update.mock.calls as [{ data: { endsOn: unknown } }][];
    expect(call?.[0].data.endsOn).toBeNull();
  });

  it('still refuses someone who is on the project now', async () => {
    const { service } = setup({
      project: { id: MEMBER, startsOn: new Date('2026-09-20'), endsOn: null },
    });
    await expect(
      service.addProjectMember(context(['projects.write']), PROJECT, {
        employeeId: EMPLOYEE,
        startsOn: '2026-09-28',
      }),
    ).rejects.toThrow(ConflictError);
  });
});
