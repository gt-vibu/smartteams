import { ConfigService } from '@nestjs/config';
import type { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import type { MailService } from '../../infrastructure/mail/mail.service';
import type { MailMessage } from '../../infrastructure/mail/mail.templates';
import { digestDue, NotificationDigestService } from './notification-digest.service';
it('waits for eight in the organization timezone and does not send again that local day', () => {
  expect(digestDue(new Date('2026-10-08T01:00:00Z'), 'Asia/Kolkata')).toBe(false);
  expect(digestDue(new Date('2026-10-08T03:00:00Z'), 'Asia/Kolkata')).toBe(true);
  expect(
    digestDue(new Date('2026-10-08T05:00:00Z'), 'Asia/Kolkata', new Date('2026-10-08T03:00:00Z')),
  ).toBe(false);
  expect(
    digestDue(new Date('2026-10-09T03:00:00Z'), 'Asia/Kolkata', new Date('2026-10-08T03:00:00Z')),
  ).toBe(true);
});

it('coalesces pending updates, excludes urgent mail and keeps unread notifications intact', async () => {
  const now = new Date('2026-10-08T03:00:00Z');
  const send = jest.fn<Promise<void>, [MailMessage, string?]>().mockResolvedValue(undefined);
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    userOrganization: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { user: { id: 'employee', email: 'employee@t.test', displayName: 'Employee' } },
        ]),
    },
    notification: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(1000),
      findMany: jest
        .fn()
        .mockResolvedValue([{ title: 'Leave approved', body: 'Your leave was approved.' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1000 }),
    },
  };
  const database = {
    runSystem: jest
      .fn()
      .mockResolvedValue([{ id: 'organization', name: 'Company', timezone: 'Asia/Kolkata' }]),
    run: jest.fn((_context: unknown, work: (transaction: typeof tx) => unknown) =>
      Promise.resolve(work(tx)),
    ),
  };
  const service = new NotificationDigestService(
    database as unknown as TenantDatabaseService,
    { send } as unknown as MailService,
    new ConfigService({ APP_PUBLIC_URL: 'https://company.test' }),
  );
  expect(await service.sendPending(now)).toBe(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0].to).toBe('employee@t.test');
  expect(send.mock.calls[0]?.[0].subject).toContain('1000 updates');
  expect(send.mock.calls[0]?.[1]).toBe('digest-organization-employee-2026-10-08');
  expect(tx.notification.updateMany).toHaveBeenCalledWith({
    where: {
      organizationId: 'organization',
      recipientUserId: 'employee',
      emailedAt: null,
      createdAt: { lte: now },
      kind: { notIn: ['APPROVAL_ESCALATED', 'PAYROLL_RELEASED'] },
    },
    data: { emailedAt: now },
  });
  tx.notification.findFirst.mockResolvedValue({ emailedAt: now });
  expect(await service.sendPending(now)).toBe(0);
  expect(send).toHaveBeenCalledTimes(1);
});
