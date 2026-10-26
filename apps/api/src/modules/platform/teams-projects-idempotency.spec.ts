import { ConflictError } from '../../common/errors/domain-error';
import type { DomainContext } from '../../common/context/domain-context';
import { findProjectRetry } from './teams-projects-idempotency';
import { TeamsProjectsService } from './teams-projects.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const BRANCH = '33333333-3333-4333-8333-333333333333';
const TEAM = {
  id: REQUEST,
  organizationId: ORG,
  name: 'Platform',
  description: null,
  branchId: BRANCH,
  teamLeadEmployeeId: null,
  members: [],
};

function setup() {
  const tx = {
    branch: { findFirst: jest.fn().mockResolvedValue({ id: BRANCH }) },
    team: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(TEAM),
    },
  };
  const database = {
    run: jest.fn((_context: unknown, action: (transaction: unknown) => unknown) =>
      Promise.resolve(action(tx)),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new TeamsProjectsService(database as never, audit);
  const context: DomainContext = {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: '44444444-4444-4444-8444-444444444444' },
    correlationId: 'correlation',
    requestId: 'request',
    permissions: new Set(['teams.write']),
  };
  return { tx, service, context, audit };
}

describe('team creation retry safety', () => {
  it('returns the original team for a retry with the same request id and payload', async () => {
    const { tx, service, context, audit } = setup();
    const input = { id: REQUEST, name: 'Platform', branchId: BRANCH };
    await service.createTeam(context, input);
    tx.team.findFirst.mockResolvedValueOnce(TEAM);

    await expect(service.createTeam(context, input)).resolves.toEqual(TEAM);
    expect(tx.team.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('rejects reusing a request id with different details', async () => {
    const { tx, service, context } = setup();
    tx.team.findFirst.mockResolvedValue(TEAM);

    await expect(
      service.createTeam(context, { id: REQUEST, name: 'Different', branchId: BRANCH }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(tx.team.create).not.toHaveBeenCalled();
  });
});

describe('project creation retry safety', () => {
  const project = {
    id: REQUEST,
    organizationId: ORG,
    code: 'PRJ-001',
    name: 'Migration',
    description: null,
    branchId: BRANCH,
    projectLeadEmployeeId: null,
    startDate: null,
    endDate: null,
    members: [],
  };
  const tx = { project: { findFirst: jest.fn() } };

  it('recognizes the same generated-code project request', async () => {
    tx.project.findFirst.mockResolvedValue(project);
    await expect(
      findProjectRetry(tx as never, ORG, { id: REQUEST, name: 'Migration', branchId: BRANCH }),
    ).resolves.toEqual(project);
  });

  it('rejects a project request id reused for a different project', async () => {
    tx.project.findFirst.mockResolvedValue(project);
    await expect(
      findProjectRetry(tx as never, ORG, { id: REQUEST, name: 'Different', branchId: BRANCH }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
