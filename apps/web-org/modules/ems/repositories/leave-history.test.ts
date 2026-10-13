import { describe, it, expect, vi } from 'vitest';
import { leaveRepository } from './leave.repository';

const request = vi.hoisted(() => vi.fn<(path: string, options: unknown) => Promise<unknown>>());
vi.mock('../lib/api-client', () => ({ apiRequest: request }));
const id = '11111111-1111-4111-8111-111111111111';
const leave = {
  id,
  organizationId: id,
  employeeId: id,
  leaveTypeId: id,
  startDate: '2026-11-16',
  endDate: '2026-11-16',
  requestedDays: 1,
  status: 'PENDING',
};

describe('employee leave history', () => {
  it('includes older requests beyond the first page and retains employee scope', async () => {
    request
      .mockResolvedValueOnce({ requests: [leave], nextCursor: 'older' })
      .mockResolvedValueOnce({ requests: [{ ...leave, status: 'APPROVED' }] });
    expect(await leaveRepository.listRequests(id, { employeeId: id })).toHaveLength(2);
    expect(request.mock.calls.at(-1)?.[0]).toContain(`employeeId=${id}`);
    expect(request.mock.calls.at(-1)?.[0]).toContain('cursor=older');
  });
  it('reports non-advancing pagination instead of looping forever', async () => {
    request.mockResolvedValue({ requests: [leave], nextCursor: 'repeat' });
    await expect(leaveRepository.listRequests(id, { employeeId: id })).rejects.toThrow(
      'paging did not advance',
    );
  });
});
