import { ConfigService } from '@nestjs/config';
import type { DomainContext } from '../../common/context/domain-context';
import { EmployeeFederationSyncService } from './employee-federation-sync.service';
import { EmployeeRecordsService } from './employee-records.service';

const context: DomainContext = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  accessMode: 'FEDERATION',
  actor: { type: 'FEDERATION_CLIENT', clientId: 'client-1' },
  correlationId: 'test',
  requestId: 'test',
  permissions: new Set([
    'employees.write',
    'employees.personal_details.write',
    'employees.bank_details.write',
  ]),
};
const details = {
  fatherName: 'Ramesh Shah',
  motherName: 'Geeta Shah',
  spouseName: 'Raj Shah',
  aadhaarNumber: '123456789012',
  panNumber: 'ABCDE1234F',
  presentAddress: 'MG Road',
  permanentAddress: 'JP Nagar',
  bankName: 'State Bank',
  bankAccountNumber: '12345678901',
  ifscCode: 'SBIN0001234',
  bankAccountName: 'Priya Shah',
  familyReferenceName: 'Sister',
  familyReferenceContact: '9876543211',
  referenceName2: 'Brother',
  referenceContact2: '9876543212',
};

function setup() {
  let employee: Record<string, unknown> | undefined;
  let sequence = 0;
  let failure: string | undefined;
  const writes: Array<{ stage: string; data: Record<string, unknown> }> = [];
  const write = (stage: string, data: Record<string, unknown>) => {
    if (failure === stage) throw new Error(`${stage} failed`);
    writes.push({ stage, data });
    return Promise.resolve({ id: stage, ...data });
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    organization: {
      update: jest.fn(() => Promise.resolve({ employeeNumberSequence: ++sequence })),
    },
    employee: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(where.employeeNumber ? null : (employee ?? null)),
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        employee = { id: 'employee-1', version: 1, ...data };
        return Promise.resolve(employee);
      }),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        employee = { ...employee, ...data, version: 2 };
        return Promise.resolve(employee);
      }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
    userOrganization: { upsert: jest.fn().mockResolvedValue({}) },
    employeeFieldOwnership: { upsert: jest.fn().mockResolvedValue({}) },
    employeePersonalProfile: {
      upsert: jest.fn(({ create }: { create: Record<string, unknown> }) =>
        write('personal', create),
      ),
    },
    employeeBankAccount: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => write('bank', data)),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    employeeReference: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => write('references', data)),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const database = {
    run: jest.fn(
      async (_context: DomainContext, work: (transaction: typeof tx) => Promise<unknown>) => {
        const savedEmployee = employee;
        const savedSequence = sequence;
        const savedWriteCount = writes.length;
        try {
          return await work(tx);
        } catch (error) {
          employee = savedEmployee;
          sequence = savedSequence;
          writes.splice(savedWriteCount);
          throw error;
        }
      },
    ),
  };
  const audit = { record: jest.fn() };
  const outbox = { append: jest.fn() };
  const records = new EmployeeRecordsService(
    database as never,
    audit,
    new ConfigService({
      INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: 'test-only-encryption-key-32-characters-long',
    }),
  );
  const service = new EmployeeFederationSyncService(
    database as never,
    audit,
    outbox as never,
    {} as never,
    records,
  );
  const create = () =>
    service.syncFederated(context, 'external-1', 'client-1', {
      firstName: 'Priya',
      lastName: 'Shah',
      dateOfJoining: '2026-10-09',
      personalDetails: details,
    });
  return {
    create,
    database,
    writes,
    outbox,
    fail: (stage?: string) => {
      failure = stage;
    },
    employee: () => employee,
    sequence: () => sequence,
  };
}

describe('atomic federated employee onboarding', () => {
  it('stores all required records using the employee transaction, with encrypted sensitive numbers', async () => {
    const t = setup();
    await t.create();
    expect(t.database.run).toHaveBeenCalledTimes(1);
    expect(t.writes.map((write) => write.stage)).toEqual([
      'personal',
      'bank',
      'references',
      'references',
    ]);
    const personal = t.writes[0]!.data;
    const bank = t.writes[1]!.data;
    expect(personal.aadhaarNumberEncrypted).not.toBe(details.aadhaarNumber);
    expect(personal.panNumberEncrypted).not.toBe(details.panNumber);
    expect(bank.accountNumberEncrypted).not.toBe(details.bankAccountNumber);
    expect(bank).not.toHaveProperty('accountNumber');
    expect(t.outbox.append).toHaveBeenCalledTimes(1);
  });
  it.each(['personal', 'bank', 'references'])(
    'rolls back failed %s storage and allows a clean retry',
    async (stage) => {
      const t = setup();
      t.fail(stage);
      await expect(t.create()).rejects.toThrow(`${stage} failed`);
      expect(t.employee()).toBeUndefined();
      expect(t.sequence()).toBe(0);
      expect(t.writes).toHaveLength(0);
      expect(t.outbox.append).not.toHaveBeenCalled();
      t.fail();
      await expect(t.create()).resolves.toMatchObject({ employeeNumber: 'EMP-0001' });
      expect(t.database.run).toHaveBeenCalledTimes(2);
    },
  );
});
