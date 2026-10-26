import { apiRequest } from '../lib/api-client';
import { orgPath } from './api-helpers';

export type ResignationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'COMPLETED';

export type Resignation = {
  id: string;
  employeeId: string;
  employee: { name: string; employeeNumber: string };
  reason: string;
  requestedLastDay: string;
  lastWorkingDay: string | null;
  status: ResignationStatus;
  submittedAt: string;
  decidedAt: string | null;
  decisionComment: string | null;
  completedAt: string | null;
};

const base = (organizationId: string) => orgPath(organizationId, '/resignations');

export const resignationsRepository = {
  async mine(organizationId: string) {
    return (await apiRequest(`${base(organizationId)}/mine`, { method: 'GET' })) as Resignation[];
  },
  async list(organizationId: string) {
    return (await apiRequest(base(organizationId), { method: 'GET' })) as Resignation[];
  },
  async submit(organizationId: string, input: { reason: string; requestedLastDay: string }) {
    return (await apiRequest(base(organizationId), { method: 'POST', body: input })) as Resignation;
  },
  async withdraw(organizationId: string, id: string) {
    return (await apiRequest(`${base(organizationId)}/${encodeURIComponent(id)}/withdraw`, {
      method: 'POST',
    })) as Resignation;
  },
  async decide(
    organizationId: string,
    id: string,
    input: { accept: boolean; lastWorkingDay?: string; comment?: string },
  ) {
    return (await apiRequest(`${base(organizationId)}/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: input,
    })) as Resignation;
  },
};

export const RESIGNATION_LABEL: Record<ResignationStatus, string> = {
  PENDING: 'Awaiting decision',
  ACCEPTED: 'Accepted',
  REJECTED: 'Not accepted',
  WITHDRAWN: 'Withdrawn',
  COMPLETED: 'Left',
};
