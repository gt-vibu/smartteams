import { describe, expect, it } from 'vitest';
import { COMMAND_MODULE_BY_ID, buildCommandItems } from './command-palette-items';
import { canAccessModule } from '../../services/authorization.policy';

/**
 * The palette must not become a way around the permission model.
 *
 * It filtered commands against a map covering six of sixteen ids and let everything unmapped
 * through, so a viewer narrowed to Payroll was still offered "Check In to Attendance", "Apply
 * for Leave", "Log Work Time" and "Inspect Attendance Daily Roster" — while the sidebar next to
 * it correctly hid all four. These assert the two properties that stop it recurring: every
 * command declares a module, and the palette resolves that module through the same
 * `canAccessModule` the sidebar, mobile bar, launcher tiles and router use.
 */
const noop = () => undefined;

function build(workspaceContext: 'ADMIN' | 'EMPLOYEE', permissions: readonly string[]) {
  return buildCommandItems({
    canAccessModule: (module) => canAccessModule(module, workspaceContext, permissions, true),
    checkIn: noop,
    checkOut: noop,
    isAssignedToAnyTeam: true,
    isCheckedIn: false,
    onClose: noop,
    onNavigateModule: noop,
    onNavigateSpace: noop,
    workspaceContext,
  });
}

/** What the palette itself does with the built list. */
function visibleIds(workspaceContext: 'ADMIN' | 'EMPLOYEE', permissions: readonly string[]) {
  return build(workspaceContext, permissions)
    .filter((item) => {
      const module = COMMAND_MODULE_BY_ID[item.id];
      return module ? canAccessModule(module, workspaceContext, permissions, true) : false;
    })
    .map((item) => item.id);
}

describe('command palette permission mapping', () => {
  it('every command it can build declares the module it belongs to', () => {
    const ids = new Set([
      ...build('ADMIN', ['*']).map((item) => item.id),
      ...build('EMPLOYEE', ['*']).map((item) => item.id),
    ]);
    const unmapped = [...ids].filter((id) => !COMMAND_MODULE_BY_ID[id]);
    expect(unmapped).toEqual([]);
  });

  it('withholds every attendance, leave and timesheet command from a payroll-only viewer', () => {
    const permissions = ['organizations.read', 'payroll.payslips.read', 'payroll.preview.read'];
    const ids = visibleIds('ADMIN', permissions);
    expect(ids).not.toContain('act-punch');
    expect(ids).not.toContain('act-leave');
    expect(ids).not.toContain('act-logtime');
    expect(ids).not.toContain('act-admin-attendance-roster');
    expect(ids).not.toContain('act-admin-leave-policy');
    expect(ids).not.toContain('nav-attendance');
    expect(ids).not.toContain('nav-time-off');
    expect(ids).not.toContain('nav-timesheet');
  });

  it('still offers the payroll commands that viewer can genuinely reach', () => {
    const permissions = ['organizations.read', 'payroll.payslips.read', 'payroll.preview.read'];
    const ids = visibleIds('ADMIN', permissions);
    expect(ids).toContain('act-admin-payroll');
  });

  it('offers the self-service commands to an employee who holds those permissions', () => {
    const permissions = ['attendance.read', 'leave.requests.read', 'timesheets.read'];
    const ids = visibleIds('EMPLOYEE', permissions);
    expect(ids).toContain('act-punch');
    expect(ids).toContain('act-leave');
    expect(ids).toContain('act-logtime');
  });
});
