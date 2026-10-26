import {
  AttendanceLocationService,
  validateAttendanceCoordinates,
} from './attendance-location.service';

const circle = (id: string, latitude: number, radiusMeters: number) => ({
  id,
  latitude,
  longitude: 0,
  radiusMeters,
});

describe('attendance geofence geometry and scope', () => {
  const service = new AttendanceLocationService();

  it('accepts any containing location even when the nearest centre has a smaller radius', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([circle('near', 0.001, 10), circle('large', 0.002, 500)]);
    const result = await service.evaluateGeofence(
      { workLocation: { findMany } } as never,
      'org',
      'branch',
      0,
      0,
      'REQUIRED',
    );
    expect(result).toMatchObject({ isWithin: true, workLocationId: 'large' });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        isActive: true,
        OR: [{ branchId: 'branch' }, { branchId: null }],
      },
    });
  });

  it('reports the nearest location when outside all circles', async () => {
    const result = await service.evaluateGeofence(
      {
        workLocation: {
          findMany: jest
            .fn()
            .mockResolvedValue([circle('far', 0.002, 10), circle('near', 0.001, 10)]),
        },
      } as never,
      'org',
      undefined,
      0,
      0,
      'REQUIRED',
    );
    expect(result).toMatchObject({ isWithin: false, workLocationId: 'near' });
    expect(result.distance).toBeGreaterThan(100);
  });

  it('accepts a point exactly on the boundary', async () => {
    const latitude = (100 / 6_371_000) * (180 / Math.PI);
    const result = await service.evaluateGeofence(
      {
        workLocation: {
          findMany: jest.fn().mockResolvedValue([circle('boundary', latitude, 100)]),
        },
      } as never,
      'org',
      'branch',
      0,
      0,
      'REQUIRED',
    );
    expect(result.isWithin).toBe(true);
  });

  it('does not evaluate a boundary in GPS-only mode', async () => {
    const findMany = jest.fn();
    await expect(
      service.evaluateGeofence(
        { workLocation: { findMany } } as never,
        'org',
        'branch',
        0,
        0,
        'DISABLED',
      ),
    ).resolves.toMatchObject({ isWithin: null, distance: null });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('uses only organization circles when there is no branch', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await service.evaluateGeofence(
      { workLocation: { findMany } } as never,
      'org',
      undefined,
      0,
      0,
      'REQUIRED',
    );
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org', isActive: true, branchId: null },
    });
  });

  it.each([
    { latitude: NaN, longitude: 0 },
    { latitude: 0, longitude: Infinity },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 },
    { latitude: 0 },
    { longitude: 0 },
    { latitude: null, longitude: 0 },
    { accuracyMeters: -1 },
    { accuracyMeters: Infinity },
  ])('rejects invalid coordinates or accuracy: %j', (input) => {
    expect(() => validateAttendanceCoordinates(input as never)).toThrow();
  });

  it('accepts zero coordinates and zero accuracy', () => {
    expect(() =>
      validateAttendanceCoordinates({ latitude: 0, longitude: 0, accuracyMeters: 0 }),
    ).not.toThrow();
  });

  it.each([NaN, Infinity, 0, -1])(
    'rejects invalid radius %s before writing a location',
    async (radiusMeters) => {
      const upsert = jest.fn();
      await expect(
        service.syncWorkLocations({ workLocation: { upsert } } as never, 'org', 'branch', [
          { name: 'Office', latitude: 0, longitude: 0, radiusMeters },
        ]),
      ).rejects.toThrow('invalid');
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('does not move an existing circle from another branch', async () => {
    const upsert = jest.fn();
    await expect(
      service.syncWorkLocations(
        {
          workLocation: {
            findUnique: jest.fn().mockResolvedValue({ branchId: 'other' }),
            upsert,
          },
        } as never,
        'org',
        'branch',
        [{ name: 'Office', latitude: 0, longitude: 0, radiusMeters: 100 }],
      ),
    ).rejects.toThrow('different branch scope');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('clears only the requested location scope', async () => {
    const updateMany = jest.fn();
    await service.syncWorkLocations({ workLocation: { updateMany } } as never, 'org', 'branch', []);
    expect(updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org', branchId: 'branch' },
      data: { isActive: false },
    });
  });
});
