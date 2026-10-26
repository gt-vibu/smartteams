import type { DomainContext } from '../../common/context/domain-context';
import { LeaveAttachmentsService } from './leave-attachments.service';

function setup(userId: string) {
  const context: DomainContext = {
    organizationId: 'org',
    actor: { type: 'USER', userId },
    accessMode: 'NATIVE',
    permissions: new Set(['leave.requests.read', 'leave.requests.decide']),
    correlationId: 'c',
    requestId: 'r',
  };
  const tx = {
    leaveRequest: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'request',
        employeeId: 'employee',
        status: 'PENDING',
        branchId: 'branch',
        employee: { userId: 'requester', manager: null },
        approvals: [],
        approvalPolicy: {
          steps: [
            {
              id: 'step',
              stepNumber: 1,
              approverType: 'USER',
              approverUserId: 'approver',
              roleId: null,
            },
          ],
        },
      }),
    },
    fileObject: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'file',
        objectKey: 'private/file',
        originalName: 'support.pdf',
        contentType: 'application/pdf',
      }),
    },
    employee: { findFirst: jest.fn().mockResolvedValue({ id: 'approver-employee' }) },
    approvalDelegation: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const database = {
    run: <T>(_context: unknown, callback: (client: unknown) => Promise<T>) => callback(tx),
  };
  const storage = {
    createDownloadUrl: jest.fn().mockResolvedValue('https://storage.example/signed-file'),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    context,
    tx,
    storage,
    service: new LeaveAttachmentsService(database as never, storage as never, audit),
  };
}

it('lets the current approver review supporting documents without granting all employee files', async () => {
  const { service, context, tx } = setup('approver');
  expect(await service.download(context, 'request', 'file')).toMatchObject({ fileId: 'file' });
  expect(tx.fileObject.findFirst).toHaveBeenCalledWith({
    where: {
      id: 'file',
      organizationId: 'org',
      leaveRequestId: 'request',
      employeeId: 'employee',
      purpose: 'LEAVE_ATTACHMENT',
      status: 'AVAILABLE',
      deletedAt: null,
    },
  });
});
it('refuses another employee before signing or revealing an attachment', async () => {
  const { service, context, storage } = setup('colleague');
  await expect(service.download(context, 'request', 'file')).rejects.toThrow(
    'Leave attachment was not found',
  );
  expect(storage.createDownloadUrl).not.toHaveBeenCalled();
});
it('refuses a file that is not attached to the authorized request', async () => {
  const { service, context, tx, storage } = setup('approver');
  tx.fileObject.findFirst.mockResolvedValueOnce(null);
  await expect(service.download(context, 'request', 'different-file')).rejects.toThrow(
    'Leave attachment was not found',
  );
  expect(storage.createDownloadUrl).not.toHaveBeenCalled();
});
