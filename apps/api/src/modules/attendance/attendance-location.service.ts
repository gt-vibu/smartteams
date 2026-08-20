import { Injectable } from '@nestjs/common';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { GeofenceMode } from '../../generated/prisma/enums';

export type AttendanceTransaction = Parameters<Parameters<TenantDatabaseService['run']>[1]>[0];

export type WorkLocationInput = {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

@Injectable()
export class AttendanceLocationService {
  async evaluateGeofence(
    tx: AttendanceTransaction,
    organizationId: string,
    branchId: string | undefined,
    latitude: number | undefined,
    longitude: number | undefined,
    mode: GeofenceMode,
  ) {
    if (mode === GeofenceMode.DISABLED || latitude === undefined || longitude === undefined)
      return {
        isWithin: mode === GeofenceMode.DISABLED ? null : false,
        distance: null,
        workLocationId: undefined,
      };
    const locations = await tx.workLocation.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : { branchId: null }),
      },
    });
    const nearest = locations
      .map((location) => ({
        location,
        distance: this.distanceMeters(
          latitude,
          longitude,
          Number(location.latitude),
          Number(location.longitude),
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest) return { isWithin: false, distance: null, workLocationId: undefined };
    return {
      isWithin: nearest.distance <= Number(nearest.location.radiusMeters),
      distance: nearest.distance,
      workLocationId: nearest.location.id,
    };
  }

  async syncWorkLocations(
    tx: AttendanceTransaction,
    organizationId: string,
    branchId: string | null,
    locations?: WorkLocationInput[],
  ) {
    if (locations === undefined) return;
    const names = new Set<string>();
    for (const location of locations) {
      const name = location.name.trim();
      if (!name || names.has(name))
        throw new ConflictError('Work-location names must be unique within a request');
      names.add(name);
      if (
        location.latitude < -90 ||
        location.latitude > 90 ||
        location.longitude < -180 ||
        location.longitude > 180 ||
        location.radiusMeters <= 0
      )
        throw new ConflictError('Work-location coordinates or radius are invalid');
      const existing = await tx.workLocation.findUnique({
        where: { organizationId_name: { organizationId, name } },
      });
      if (existing && existing.branchId !== branchId)
        throw new ConflictError(`Work location ${name} belongs to a different branch scope`);
      await tx.workLocation.upsert({
        where: { organizationId_name: { organizationId, name } },
        create: {
          organizationId,
          branchId,
          name,
          latitude: location.latitude,
          longitude: location.longitude,
          radiusMeters: location.radiusMeters,
          isActive: true,
        },
        update: {
          branchId,
          latitude: location.latitude,
          longitude: location.longitude,
          radiusMeters: location.radiusMeters,
          isActive: true,
        },
      });
    }
    await tx.workLocation.updateMany({
      where: { organizationId, branchId, ...(names.size ? { name: { notIn: [...names] } } : {}) },
      data: { isActive: false },
    });
  }

  private distanceMeters(
    latitudeA: number,
    longitudeA: number,
    latitudeB: number,
    longitudeB: number,
  ) {
    const radius = 6_371_000;
    const latitudeDelta = ((latitudeB - latitudeA) * Math.PI) / 180;
    const longitudeDelta = ((longitudeB - longitudeA) * Math.PI) / 180;
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos((latitudeA * Math.PI) / 180) *
        Math.cos((latitudeB * Math.PI) / 180) *
        Math.sin(longitudeDelta / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }
}
