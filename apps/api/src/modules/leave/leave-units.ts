import { ConflictError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
export type LeaveUnit = {
  startDate: Date;
  endDate: Date;
  session?: string;
  chargedDates?: Prisma.JsonValue | null;
};
export function validateLeaveSession(session: string | undefined, start: Date, end: Date) {
  if (session && !['FULL_DAY', 'FIRST_HALF', 'SECOND_HALF'].includes(session))
    throw new ConflictError('Choose a valid leave session.');
  if (session && session !== 'FULL_DAY' && start.getTime() !== end.getTime())
    throw new ConflictError('Half-day leave must use one working date.');
  return session && session !== 'FULL_DAY' ? 0.5 : 1;
}
export function leaveUnitsOn(request: LeaveUnit, date: Date) {
  if (date < request.startDate || date > request.endDate) return 0;
  const key = date.toISOString().slice(0, 10);
  if (Array.isArray(request.chargedDates) && !request.chargedDates.includes(key)) return 0;
  return request.session && request.session !== 'FULL_DAY' ? 0.5 : 1;
}
export function leaveOverlapSession(session?: string) {
  return session && session !== 'FULL_DAY' ? { session: { in: ['FULL_DAY', session] } } : {};
}
