import { AttendancePunchService, type PunchInput } from './attendance-punch.service';
import { AttendancePreferencesService } from './attendance-preferences.service';
import { AttendanceLocationService } from './attendance-location.service';
import type { DomainContext } from '../../common/context/domain-context';

const context = (overrides: Partial<DomainContext> = {}): DomainContext => ({
  organizationId: 'org',
  accessMode: 'NATIVE',
  actor: { type: 'USER', userId: 'self' },
  permissions: new Set([
    'attendance.write',
    'attendance.preferences.read',
    'attendance.preferences.write',
  ]),
  correlationId: 'c',
  requestId: 'r',
  ...overrides,
});
const input: PunchInput = {
  employeeId: 'employee',
  occurredAt: '2026-10-03T09:00:00Z',
  workDate: '2026-10-03',
  source: 'NATIVE',
};

type WriteData = { data: Record<string, unknown> };

function applyDefinedData<T extends object>(target: T, data: Record<string, unknown>) {
  return Object.assign(
    target,
    Object.fromEntries<unknown>(Object.entries(data).filter(([, value]) => value !== undefined)),
  );
}

function setup() {
  const employee = {
    id: 'employee',
    userId: 'self',
    status: 'ACTIVE',
    primaryBranchId: 'branch' as string | null,
    branchAssignments: [] as { branchId: string; isPrimary: boolean }[],
    geofenceMode: null as string | null,
  };
  const settings = {
    organizationId: 'org',
    geofenceMode: 'DISABLED',
    requireGps: false,
    biometricVerificationMode: 'DISABLED',
    standardDayMinutes: 480,
    metadata: {},
    geofenceOwnerSource: 'NATIVE',
    geofenceOwnerClientId: null as string | null,
    biometricOwnerSource: 'NATIVE',
    biometricOwnerClientId: null as string | null,
  };
  const branch = {
    id: 'branch',
    organizationId: 'org',
    requireGps: null as boolean | null,
    geofenceMode: null as string | null,
    biometricVerificationMode: null,
    geofenceOwnerSource: 'NATIVE',
    geofenceOwnerClientId: null as string | null,
    biometricOwnerSource: 'NATIVE',
    biometricOwnerClientId: null as string | null,
  };
  const circles: Array<Record<string, unknown>> = [];
  const punches: Array<Record<string, unknown>> = [];
  const record = {
    id: 'record',
    organizationId: 'org',
    employeeId: 'employee',
    branchId: 'branch',
    workDate: new Date('2026-10-03'),
    status: 'OPEN',
    dayStatus: 'PRESENT',
    workedMinutes: 0,
    overtimeMinutes: 0,
    version: 1,
  };
  const tx = {
    employee: { findFirst: jest.fn().mockResolvedValue(employee) },
    employeeBranchAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    holiday: { findFirst: jest.fn().mockResolvedValue(null) },
    employeeHolidaySelection: { findFirst: jest.fn().mockResolvedValue(null) },
    employeeShiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }) },
    organizationSettings: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(settings),
      updateMany: jest.fn(
        ({ where, data }: WriteData & { where: { OR?: Record<string, unknown>[] } }) => {
          const allowed = where.OR?.some((condition) =>
            Object.entries(condition).every(
              ([key, value]) => settings[key as keyof typeof settings] === value,
            ),
          );
          if (allowed) applyDefinedData(settings, data);
          return Promise.resolve({ count: allowed ? 1 : 0 });
        },
      ),
      update: jest.fn(({ data }: WriteData) => Promise.resolve(applyDefinedData(settings, data))),
    },
    branch: {
      findFirst: jest.fn().mockResolvedValue(branch),
      updateMany: jest.fn(
        ({ where, data }: WriteData & { where: { OR?: Record<string, unknown>[] } }) => {
          const allowed = where.OR?.some((condition) =>
            Object.entries(condition).every(
              ([key, value]) => branch[key as keyof typeof branch] === value,
            ),
          );
          if (allowed) applyDefinedData(branch, data);
          return Promise.resolve({ count: allowed ? 1 : 0 });
        },
      ),
      update: jest.fn(({ data }: WriteData) => Promise.resolve(applyDefinedData(branch, data))),
    },
    workLocation: {
      findMany: jest.fn(() => Promise.resolve(circles)),
      findUnique: jest.fn(({ where }: { where: { organizationId_name: { name: string } } }) =>
        Promise.resolve(
          circles.find((entry) => entry.name === where.organizationId_name.name) ?? null,
        ),
      ),
      upsert: jest.fn(({ create }: { create: Record<string, unknown> }) => {
        circles.push({ id: 'location', ...create });
        return Promise.resolve(create);
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    attendanceRecord: {
      upsert: jest.fn().mockResolvedValue(record),
      update: jest.fn(({ data }: WriteData) => Promise.resolve({ ...record, ...data, version: 2 })),
    },
    attendancePunch: {
      findMany: jest.fn(() => Promise.resolve([...punches])),
      create: jest.fn(({ data }: WriteData) => {
        const punch = { id: 'punch', ...data };
        punches.push(punch);
        return Promise.resolve(punch);
      }),
    },
    attendanceCorrection: {
      create: jest.fn<Promise<{ id: string }>, [WriteData]>().mockResolvedValue({ id: 'review' }),
    },
    payrollRun: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const database = {
    run: jest.fn(
      (_context: DomainContext, callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };
  const audit = { record: jest.fn() },
    outbox = { append: jest.fn() };
  const locationService = new AttendanceLocationService();
  return {
    employee,
    settings,
    branch,
    tx,
    circles,
    punches,
    service: new AttendancePunchService(database as never, audit, outbox as never, locationService),
    preferences: new AttendancePreferencesService(database as never, audit, locationService),
  };
}

describe('attendance capture location policy', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-10-03T09:00:00Z') }));
  afterEach(() => jest.useRealTimers());
  it('files ordinary federation self captures under the outlet calendar after local midnight', async () => {
    const { service, tx } = setup();
    await service.punch(
      context({
        accessMode: 'FEDERATION',
        actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
      }),
      'IN',
      {
        ...input,
        source: 'FEDERATION',
        occurredAt: '2026-10-03T19:00:00Z',
        workDate: '2026-10-03',
      },
    );
    expect(tx.attendanceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          employeeId_workDate: { employeeId: 'employee', workDate: new Date('2026-10-04') },
        },
      }),
    );
  });

  it('preserves explicitly supplied work dates for authorized managed federation imports', async () => {
    const { service, tx } = setup();
    await service.punch(
      context({
        accessMode: 'FEDERATION',
        actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
      }),
      'IN',
      {
        ...input,
        source: 'FEDERATION',
        manualEntry: true,
        capturedByUserId: 'manager',
        occurredAt: '2026-10-03T19:00:00Z',
      },
    );
    expect(tx.attendanceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          employeeId_workDate: { employeeId: 'employee', workDate: new Date('2026-10-03') },
        },
      }),
    );
  });

  it.each(['IN', 'OUT'] as const)('requires GPS on %s before writing attendance', async (type) => {
    const { service, settings, tx } = setup();
    settings.requireGps = true;
    await expect(service.punch(context(), type, input)).rejects.toMatchObject({
      code: 'GPS_REQUIRED',
    });
    expect(tx.attendanceRecord.upsert).not.toHaveBeenCalled();
    expect(tx.attendancePunch.create).not.toHaveBeenCalled();
  });

  it('captures GPS for both punches anywhere without evaluating a boundary', async () => {
    const { service, settings, tx } = setup();
    settings.requireGps = true;
    for (const type of ['IN', 'OUT'] as const) {
      jest.advanceTimersByTime(1000);
      const result = await service.punch(context(), type, {
        ...input,
        latitude: 0,
        longitude: 0,
        accuracyMeters: 0,
      });
      expect(result.reviewRequired).toBe(false);
      expect(result.punch).toMatchObject({
        latitude: 0,
        longitude: 0,
        accuracyMeters: 0,
        isWithinGeofence: null,
      });
    }
    expect(tx.workLocation.findMany).not.toHaveBeenCalled();
  });

  it.each(['IN', 'OUT'] as const)('rejects out-of-bounds %s before writing', async (type) => {
    const { service, branch, tx } = setup();
    branch.geofenceMode = 'REQUIRED';
    await expect(
      service.punch(context(), type, { ...input, latitude: 0, longitude: 0 }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_GEOFENCE' });
    expect(tx.attendanceRecord.upsert).not.toHaveBeenCalled();
    expect(tx.attendanceCorrection.create).not.toHaveBeenCalled();
  });

  it('accepts in-bounds check-in and check-out with captured coordinates', async () => {
    const { service, branch, circles } = setup();
    branch.geofenceMode = 'REQUIRED';
    circles.push({ id: 'office', latitude: 0, longitude: 0, radiusMeters: 100 });
    for (const type of ['IN', 'OUT'] as const) {
      jest.advanceTimersByTime(1000);
      const result = await service.punch(context(), type, { ...input, latitude: 0, longitude: 0 });
      expect(result.punch.isWithinGeofence).toBe(true);
      expect(result.reviewRequired).toBe(false);
    }
  });

  it('does not treat an ordinary federation self capture as a management exemption', async () => {
    const { service, branch, tx } = setup();
    branch.geofenceMode = 'REQUIRED';
    await expect(
      service.punch(
        context({
          accessMode: 'FEDERATION',
          actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
        }),
        'IN',
        { ...input, source: 'FEDERATION', latitude: 0, longitude: 0 },
      ),
    ).rejects.toMatchObject({ code: 'OUTSIDE_GEOFENCE' });
    expect(tx.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it('keeps the required-mode review workflow for managed federation imports', async () => {
    const { service, branch, tx } = setup();
    branch.geofenceMode = 'REQUIRED';
    const result = await service.punch(
      context({
        accessMode: 'FEDERATION',
        actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
      }),
      'IN',
      { ...input, source: 'FEDERATION', manualEntry: true, capturedByUserId: 'manager' },
    );
    expect(result.reviewRequired).toBe(true);
    expect(tx.attendanceCorrection.create.mock.calls.at(0)?.[0].data).toMatchObject({
      status: 'PENDING',
      reason: 'Punch requires geofence review',
    });
  });

  it('preserves authorized native admin exemptions and review', async () => {
    const { service, settings } = setup();
    settings.requireGps = true;
    settings.geofenceMode = 'REQUIRED';
    const result = await service.punch(context({ permissions: new Set(['*']) }), 'IN', input);
    expect(result.reviewRequired).toBe(true);
  });

  it('does not let an employee claim a manual-entry exemption', async () => {
    const { service, tx } = setup();
    await expect(service.punch(context(), 'IN', { ...input, manualEntry: true })).rejects.toThrow(
      'management access',
    );
    expect(tx.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it('respects the field-worker employee override', async () => {
    const { service, branch, employee } = setup();
    branch.geofenceMode = 'REQUIRED';
    employee.geofenceMode = 'DISABLED';
    await expect(service.punch(context(), 'IN', input)).resolves.toMatchObject({
      reviewRequired: false,
    });
  });

  it('inherits organization settings but honors explicit branch GPS false', async () => {
    const { service, settings, branch } = setup();
    settings.requireGps = true;
    branch.requireGps = false;
    await expect(service.punch(context(), 'IN', input)).resolves.toMatchObject({
      reviewRequired: false,
    });
  });

  it('retains FLAG_ONLY acceptance for outside captures', async () => {
    const { service, branch } = setup();
    branch.geofenceMode = 'FLAG_ONLY';
    await expect(
      service.punch(context(), 'IN', { ...input, latitude: 0, longitude: 0 }),
    ).resolves.toMatchObject({ reviewRequired: false, punch: { isWithinGeofence: false } });
  });

  it('rejects an unassigned branch and a conflicting context branch', async () => {
    const { service, tx } = setup();
    await expect(
      service.punch(context({ accessMode: 'FEDERATION' }), 'IN', { ...input, branchId: 'other' }),
    ).rejects.toThrow('not assigned');
    await expect(
      service.punch(context({ branchId: 'branch' }), 'IN', { ...input, branchId: 'other' }),
    ).rejects.toThrow('active branch');
    expect(tx.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it('rejects a missing or foreign-tenant branch', async () => {
    const { service, tx } = setup();
    tx.branch.findFirst.mockResolvedValue(null);
    await expect(service.punch(context(), 'IN', input)).rejects.toThrow('Branch was not found');
    expect(tx.branch.findFirst).toHaveBeenCalledWith({
      where: { id: 'branch', organizationId: 'org' },
    });
    expect(tx.attendanceRecord.upsert).not.toHaveBeenCalled();
  });
});

describe('attendance location preference roundtrip', () => {
  it('can restore branch GPS inheritance with null but rejects an organization null', async () => {
    const { preferences, settings, branch } = setup();
    settings.requireGps = true;
    branch.requireGps = false;
    await expect(
      preferences.updatePreferences(context(), { branchId: 'branch', requireGps: null }),
    ).resolves.toMatchObject({ requireGps: true });
    expect(branch.requireGps).toBeNull();
    await expect(preferences.updatePreferences(context(), { requireGps: null })).rejects.toThrow(
      'only a branch may inherit',
    );
  });
  it('refuses to enable enforcement without an active circle', async () => {
    const { preferences } = setup();
    await expect(
      preferences.updatePreferences(context(), {
        branchId: 'branch',
        geofenceMode: 'REQUIRED',
        workLocations: [],
      }),
    ).rejects.toThrow('Configure an active attendance location');
  });
  it('writes and reads branch GPS plus numeric location coordinates', async () => {
    const { preferences, tx } = setup();
    const result = await preferences.updatePreferences(context(), {
      branchId: 'branch',
      requireGps: true,
      geofenceMode: 'REQUIRED',
      workLocations: [
        { name: 'Office branch', latitude: 12.97, longitude: 77.59, radiusMeters: 100 },
      ],
    });
    expect(result).toMatchObject({
      requireGps: true,
      geofenceMode: 'REQUIRED',
      workLocations: [
        {
          name: 'Office branch',
          branchId: 'branch',
          latitude: 12.97,
          longitude: 77.59,
          radiusMeters: 100,
        },
      ],
    });
    await expect(preferences.getPreferences(context(), 'branch')).resolves.toEqual(result);
    expect(tx.workLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          isActive: true,
          OR: [{ branchId: 'branch' }, { branchId: null }],
        },
      }),
    );
  });

  it('inherits organization GPS and geofence mode in the branch read', async () => {
    const { preferences, settings } = setup();
    settings.requireGps = true;
    settings.geofenceMode = 'REQUIRED';
    await expect(preferences.getPreferences(context(), 'branch')).resolves.toMatchObject({
      requireGps: true,
      geofenceMode: 'REQUIRED',
    });
  });
  it('reports the self employee effective branch and geofence override', async () => {
    const { preferences, settings, branch, employee } = setup();
    settings.geofenceMode = 'REQUIRED';
    branch.requireGps = true;
    employee.geofenceMode = 'DISABLED';
    await expect(preferences.getPreferences(context())).resolves.toMatchObject({
      requireGps: true,
      geofenceMode: 'DISABLED',
    });
  });

  it('defaults a branch-scoped write to the context branch', async () => {
    const { preferences, tx } = setup();
    await preferences.updatePreferences(context({ branchId: 'branch' }), { requireGps: true });
    expect(tx.branch.update).toHaveBeenCalled();
    expect(tx.organizationSettings.update).not.toHaveBeenCalled();
  });

  it('uses the active primary assignment when the self employee has no primary branch field', async () => {
    const { preferences, employee, branch } = setup();
    employee.primaryBranchId = null;
    employee.branchAssignments = [{ branchId: 'branch', isPrimary: true }];
    branch.requireGps = true;
    branch.geofenceMode = 'REQUIRED';
    await expect(preferences.getPreferences(context())).resolves.toMatchObject({
      requireGps: true,
      geofenceMode: 'REQUIRED',
    });
  });

  it('refuses preference reads and writes across context branches', async () => {
    const { preferences, tx } = setup();
    await expect(
      preferences.getPreferences(context({ branchId: 'branch' }), 'other'),
    ).rejects.toThrow('active branch');
    await expect(
      preferences.updatePreferences(context({ branchId: 'branch' }), {
        branchId: 'other',
        requireGps: true,
      }),
    ).rejects.toThrow('active branch');
    expect(tx.branch.update).not.toHaveBeenCalled();
  });

  it('lets an authorized federation client claim native-default geofence settings on first write', async () => {
    const { preferences, branch, tx } = setup();
    const federationContext = context({
      accessMode: 'FEDERATION',
      actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
    });
    await preferences.updatePreferences(federationContext, {
      branchId: 'branch',
      requireGps: true,
      geofenceMode: 'REQUIRED',
      workLocations: [
        { name: 'Office branch', latitude: 12.97, longitude: 77.59, radiusMeters: 100 },
      ],
    });
    expect(tx.branch.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'branch',
        OR: [
          { geofenceOwnerSource: 'NATIVE' },
          { geofenceOwnerSource: 'FEDERATED', geofenceOwnerClientId: 'partner' },
        ],
      },
      data: { geofenceOwnerSource: 'FEDERATED', geofenceOwnerClientId: 'partner' },
    });
    expect(branch.geofenceOwnerSource).toBe('FEDERATED');
    expect(branch.geofenceOwnerClientId).toBe('partner');
  });

  it('rejects a competing ownership claim that wins between the read and the atomic claim', async () => {
    const { preferences, tx } = setup();
    tx.branch.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      preferences.updatePreferences(
        context({
          accessMode: 'FEDERATION',
          actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
        }),
        { branchId: 'branch', requireGps: true },
      ),
    ).rejects.toThrow('owned by a different federation client');
    expect(tx.branch.update).not.toHaveBeenCalled();
    expect(tx.workLocation.upsert).not.toHaveBeenCalled();
  });

  it('prevents a different federation client from taking geofence settings after they are claimed', async () => {
    const { preferences, branch, tx } = setup();
    branch.geofenceOwnerSource = 'FEDERATED';
    branch.geofenceOwnerClientId = 'existing-owner';
    await expect(
      preferences.updatePreferences(
        context({
          accessMode: 'FEDERATION',
          actor: { type: 'FEDERATION_CLIENT', clientId: 'other-client' },
        }),
        { branchId: 'branch', requireGps: true },
      ),
    ).rejects.toThrow('owned by a different federation client');
    expect(tx.branch.update).not.toHaveBeenCalled();
  });

  it('continues to prevent native writes to federation-owned geofence settings', async () => {
    const { preferences, branch, tx } = setup();
    branch.geofenceOwnerSource = 'FEDERATED';
    branch.geofenceOwnerClientId = 'partner';
    await expect(
      preferences.updatePreferences(context(), { branchId: 'branch', requireGps: true }),
    ).rejects.toThrow('owned by a federation client');
    expect(tx.branch.update).not.toHaveBeenCalled();
  });
});
