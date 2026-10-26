import { beforeEach, describe, expect, it, vi } from 'vitest';
import { employeeReadRepository } from './employee-read.repository';

const request = vi.hoisted(() => vi.fn());
vi.mock('../lib/api-client', () => ({ apiRequest: request }));

describe('employee read query filters', () => {
  beforeEach(() => {
    request.mockReset().mockResolvedValue({ items: [] });
  });

  it('omits an unset cursor from employee and directory requests', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    await employeeReadRepository.page(organizationId, { cursor: undefined });
    await employeeReadRepository.directoryPage(organizationId, { cursor: undefined });

    for (const [url] of request.mock.calls) {
      expect(url).not.toContain('cursor=undefined');
      expect(url).not.toContain('cursor=null');
      expect(url).toContain('limit=50');
    }
  });
});
