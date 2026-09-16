import { ForbiddenDomainError } from '../../common/errors/domain-error';
import type { DomainContext } from '../../common/context/domain-context';
import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { findSelfEmployeeId } from './employee-access';

/**
 * The write boundary for employee-scoped mutations.
 *
 * `employee-access` answers "whose record may this caller read"; this answers "on whose behalf may
 * this caller act". They are deliberately separate: reading a colleague's attendance and punching
 * on their behalf are different powers, and only the first has ever been granted by a `.read`
 * permission.
 *
 * The breadth marker is the module's existing `.read.all` permission, not a new one. That is the
 * split the seeded roles already encode — `EMPLOYEE_SELF_SERVICE_PERMISSIONS` carries
 * `attendance.write`, `leave.requests.write` and `timesheets.write` with no `.all` anywhere, while
 * `HR_ADMIN_PERMISSIONS` adds `attendance.read.all`, `leave.requests.read.all` and
 * `timesheets.read.all` on top. Before this module those write permissions were unscoped: holding
 * `attendance.write` let any employee punch for any colleague whose id they could guess, because
 * the services only checked that the target was in the same organization.
 *
 * Introducing `attendance.write.all` and friends would have meant a new permission catalogue, new
 * role seeds and a backfill for every existing tenant, to express a split the roles already make.
 */

/**
 * Whether the caller may act on employees other than themselves.
 *
 * The `FEDERATION` arm mirrors `canReadAllEmployees`: a federation context acts for the whole
 * tenant and carries no `actor.userId`, so it has no "self" to narrow to. Its breadth is bounded
 * by grants and scopes long before a request reaches a domain service.
 */
export function canActForAllEmployees(context: DomainContext, breadthPermission: string): boolean {
  return (
    context.accessMode === 'FEDERATION' ||
    context.permissions.has('*') ||
    context.permissions.has(breadthPermission)
  );
}

/**
 * The employee a mutation is allowed to act on.
 *
 * A caller with breadth gets the employee they asked for, falling back to their own record when
 * they named nobody. A self-service caller always gets their own employee id, and naming anyone
 * else is refused — including naming their own id, which is accepted, so existing clients that
 * send it keep working.
 *
 * The refusal is identical whether the named employee exists, belongs to another tenant, or was
 * never real, so the endpoint cannot be used to enumerate employees.
 */
export async function resolveActingEmployeeId(
  tx: TenantTransaction,
  context: DomainContext,
  requestedEmployeeId: string | undefined,
  breadthPermission: string,
): Promise<string> {
  if (canActForAllEmployees(context, breadthPermission)) {
    if (requestedEmployeeId) return requestedEmployeeId;
    const selfForBreadth = await findSelfEmployeeId(tx, context);
    if (!selfForBreadth) throw noEmployeeRecordError();
    return selfForBreadth;
  }

  const selfEmployeeId = await findSelfEmployeeId(tx, context);
  if (!selfEmployeeId) throw noEmployeeRecordError();
  if (requestedEmployeeId && requestedEmployeeId !== selfEmployeeId) throw actingForOthersError();
  return selfEmployeeId;
}

/**
 * Refuses a mutation against a row that belongs to someone else.
 *
 * For rows reached by their own id — a timesheet, an attendance record — rather than by an
 * employee id. The owner must already have been read from the row inside this tenant, so a row
 * from another organization is reported as missing by the caller's own lookup rather than as
 * forbidden here.
 */
export async function assertMayActForEmployee(
  tx: TenantTransaction,
  context: DomainContext,
  ownerEmployeeId: string,
  breadthPermission: string,
): Promise<void> {
  if (canActForAllEmployees(context, breadthPermission)) return;
  const selfEmployeeId = await findSelfEmployeeId(tx, context);
  if (selfEmployeeId !== ownerEmployeeId) throw actingForOthersError();
}

/** One message for every self-scoped mutation, so the routes stay indistinguishable. */
export function actingForOthersError(): ForbiddenDomainError {
  return new ForbiddenDomainError('You may only act on your own records');
}

/**
 * A caller with no employee record cannot perform a self-service mutation.
 *
 * An administrator who is not themselves an employee reaches this only when they name nobody;
 * naming an employee takes the breadth path above.
 */
export function noEmployeeRecordError(): ForbiddenDomainError {
  return new ForbiddenDomainError('This action requires an employee record in this organization');
}
