import { describe, expect, it } from 'vitest';
import type { StoredDocument } from '@smarteam/contracts';
import { asOwnWorkspace } from './workspace-access';

const doc = (over: Partial<StoredDocument> & { reason: StoredDocument['access']['reason'] }) =>
  ({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'OTHER.pdf',
    purpose: 'OTHER',
    scope: over.scope ?? 'TEAM',
    contentType: 'application/pdf',
    byteSize: 5000,
    uploadedAt: '2026-09-20T10:00:00.000Z',
    uploadedBy: 'Northwind Admin',
    employee: null,
    team: { id: '00000000-0000-4000-8000-000000000002', name: 'alpha' },
    allowDownload: true,
    access: { view: true, download: true, manage: true, share: true, reason: over.reason },
  }) as StoredDocument;

describe('documents in My Space', () => {
  it('leaves out what someone may do only as HR or an administrator', () => {
    const seen = asOwnWorkspace(doc({ reason: 'ADMINISTRATOR' }), 'shared');
    expect(seen.access).toMatchObject({ manage: false, share: false, reason: 'SHARED' });
    expect(seen.access.download).toBe(true);
  });

  it('calls a company document company-wide rather than "you publish this"', () => {
    const seen = asOwnWorkspace(
      doc({ reason: 'ADMINISTRATOR', scope: 'ORGANIZATION' }),
      'organization',
    );
    expect(seen.access.reason).toBe('ORGANIZATION');
  });

  it('keeps what they hold in their own right: their files and what they lead', () => {
    for (const reason of ['OWNER', 'TEAM_LEAD', 'PROJECT_LEAD'] as const) {
      const seen = asOwnWorkspace(doc({ reason }), 'team');
      expect(seen.access.manage).toBe(true);
    }
  });
});
