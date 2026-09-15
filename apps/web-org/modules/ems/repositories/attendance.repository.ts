import {
  parseAttendanceCorrectionPage,
  parseAttendancePage,
  parseAttendancePreferences,
  type AttendanceCorrection,
  type AttendancePage,
  type AttendancePreferences,
} from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath, queryString } from './api-helpers';

/**
 * Attendance data access.
 *
 * Replaces a repository that read a fixture and wrote to `localStorage`, which meant a punch
 * existed only in the browser that made it — invisible to payroll, to an approver, and to the
 * same user on another device.
 *
 * Every path is tenant-scoped by the organization id from the session, and the API re-checks it.
 * There is no fixture fallback: a failed request stays failed.
 */

export type PunchInput = {
  employeeId: string;
  occurredAt: string;
  workDate: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
};

export const attendanceRepository = {
  async list(
    organizationId: string,
    filters: {
      employeeId?: string;
      branchId?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<AttendancePage> {
    return expectShape(
      parseAttendancePage(
        await apiRequest(`${orgPath(organizationId, '/attendance')}${queryString(filters)}`, {
          method: 'GET',
        }),
      ),
      'attendance list',
    );
  },

  async checkIn(organizationId: string, input: PunchInput): Promise<unknown> {
    return apiRequest(`${orgPath(organizationId, '/attendance')}/check-ins`, {
      method: 'POST',
      body: input,
    });
  },

  async checkOut(organizationId: string, input: PunchInput): Promise<unknown> {
    return apiRequest(`${orgPath(organizationId, '/attendance')}/check-outs`, {
      method: 'POST',
      body: input,
    });
  },

  /**
   * Raises a correction request. The API requires at least ten characters of reason and writes
   * it to the audit trail, so the caller cannot submit an empty justification.
   */
  /** Asks for a day's missing check-out to be added at `checkOutAt` (an ISO instant). */
  async requestMissingCheckOut(
    organizationId: string,
    attendanceId: string,
    checkOutAt: string,
    reason: string,
  ): Promise<unknown> {
    return apiRequest(
      `${orgPath(organizationId, '/attendance')}/${encodeURIComponent(attendanceId)}/corrections/missing-check-out`,
      { method: 'POST', body: { checkOutAt, reason } },
    );
  },

  async requestCorrection(
    organizationId: string,
    attendanceId: string,
    reason: string,
  ): Promise<unknown> {
    return apiRequest(
      `${orgPath(organizationId, '/attendance')}/${encodeURIComponent(attendanceId)}/corrections`,
      { method: 'POST', body: { reason } },
    );
  },

  async decideCorrection(
    organizationId: string,
    correctionId: string,
    status: 'APPROVED' | 'REJECTED',
    comment: string,
  ): Promise<unknown> {
    return apiRequest(
      `${orgPath(organizationId, '/attendance')}/${encodeURIComponent(correctionId)}/decision`,
      { method: 'POST', body: { status, comment } },
    );
  },

  async listCorrections(
    organizationId: string,
    filters: { employeeId?: string; status?: string; limit?: number } = {},
  ): Promise<AttendanceCorrection[]> {
    return expectShape(
      parseAttendanceCorrectionPage(
        await apiRequest(
          `${orgPath(organizationId, '/attendance')}/corrections${queryString(filters)}`,
          {
            method: 'GET',
          },
        ),
      ),
      'attendance correction list',
    ).corrections;
  },

  /** Corrections awaiting the signed-in user's decision. */
  async correctionInbox(organizationId: string): Promise<AttendanceCorrection[]> {
    return expectShape(
      parseAttendanceCorrectionPage(
        await apiRequest(`${orgPath(organizationId, '/attendance')}/corrections/inbox`, {
          method: 'GET',
        }),
      ),
      'attendance approval inbox',
    ).corrections;
  },

  async getPreferences(organizationId: string, branchId?: string): Promise<AttendancePreferences> {
    return expectShape(
      parseAttendancePreferences(
        await apiRequest(
          `${orgPath(organizationId, '/attendance')}/preferences${queryString({ branchId })}`,
          {
            method: 'GET',
          },
        ),
      ),
      'attendance preferences',
    );
  },

  async updatePreferences(
    organizationId: string,
    input: {
      geofenceMode?: string;
      biometricVerificationMode?: string;
      branchId?: string;
    },
  ): Promise<unknown> {
    return apiRequest(`${orgPath(organizationId, '/attendance')}/preferences`, {
      method: 'POST',
      body: input,
    });
  },
};
