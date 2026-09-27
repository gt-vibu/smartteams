import { apiRequest } from '../lib/api-client';
import { orgPath } from './api-helpers';

export type CompOff = {
  id: string;
  employeeName: string;
  workDate: string;
  days: number;
  workedMinutes: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  decisionComment: string | null;
  expiresOn: string | null;
  lapsedDays: number | null;
  mine: boolean;
};

export type Encashment = {
  id: string;
  employeeName: string;
  leaveType: string;
  days: number;
  amount: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  decisionComment: string | null;
  paidInRun: boolean;
  mine: boolean;
};

const base = (organizationId: string) => orgPath(organizationId, '/leave');
type Decision = { approve: boolean; comment?: string };

/** Comp-off and encashment: the caller's own, and those waiting on them to decide. */
export const leaveExtrasRepository = {
  compOffs: async (organizationId: string) =>
    (await apiRequest(`${base(organizationId)}/comp-offs`, { method: 'GET' })) as CompOff[],
  requestCompOff: (
    organizationId: string,
    input: { workDate: string; days: number; reason: string },
  ) => apiRequest(`${base(organizationId)}/comp-offs`, { method: 'POST', body: input }),
  decideCompOff: (organizationId: string, id: string, input: Decision) =>
    apiRequest(`${base(organizationId)}/comp-offs/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: input,
    }),
  encashments: async (organizationId: string) =>
    (await apiRequest(`${base(organizationId)}/encashments`, { method: 'GET' })) as Encashment[],
  requestEncashment: (organizationId: string, input: { leaveTypeId: string; days: number }) =>
    apiRequest(`${base(organizationId)}/encashments`, { method: 'POST', body: input }),
  decideEncashment: (organizationId: string, id: string, input: Decision) =>
    apiRequest(`${base(organizationId)}/encashments/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: input,
    }),
};
