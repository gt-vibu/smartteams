import { parseShift, parseShiftList, type Shift } from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath } from './api-helpers';

/**
 * Shift data access.
 *
 * The backend has supported shifts in full — definitions, updates, retirement and effective-dated
 * employee assignment — with no screen ever calling it. `shifts.json` seeded a `localStorage` key
 * that nothing read, so the capability was invisible in the product.
 *
 * The API decides everything that matters: it refuses a branch outside the caller's scope, and
 * refuses an employee assignment that overlaps an existing one.
 */

const base = (organizationId: string) => orgPath(organizationId, '/shifts');

export type ShiftInput = {
  code: string;
  name: string;
  branchId?: string;
  daysOfWeek: number[];
  startsAt: string;
  endsAt: string;
  crossesMidnight: boolean;
  breakMinutes: number;
};

export const shiftsRepository = {
  /** Active shifts, narrowed to the caller's branch scope by the API. */
  async list(organizationId: string): Promise<Shift[]> {
    return expectShape(
      parseShiftList(await apiRequest(base(organizationId), { method: 'GET' })),
      'shift list',
    );
  },

  async create(organizationId: string, input: ShiftInput): Promise<Shift> {
    return expectShape(
      parseShift(await apiRequest(base(organizationId), { method: 'POST', body: input })),
      'shift',
    );
  },

  async update(
    organizationId: string,
    shiftId: string,
    input: Partial<ShiftInput>,
  ): Promise<Shift> {
    return expectShape(
      parseShift(
        await apiRequest(`${base(organizationId)}/${encodeURIComponent(shiftId)}`, {
          method: 'PATCH',
          body: input,
        }),
      ),
      'shift',
    );
  },

  /** Retires a shift. The backend requires a reason and audits it. */
  async deactivate(organizationId: string, shiftId: string, reason: string): Promise<unknown> {
    return apiRequest(`${base(organizationId)}/${encodeURIComponent(shiftId)}/deactivate`, {
      method: 'POST',
      body: { reason },
    });
  },

  /**
   * Assigns a shift to an employee for a period. Overlapping assignments are refused server-side,
   * so an employee always has at most one shift on any given day.
   */
  async assign(
    organizationId: string,
    employeeId: string,
    input: { shiftId: string; branchId?: string; startsOn: string; endsOn?: string },
  ): Promise<unknown> {
    return apiRequest(
      `${base(organizationId)}/employees/${encodeURIComponent(employeeId)}/assignments`,
      { method: 'POST', body: input },
    );
  },
};
