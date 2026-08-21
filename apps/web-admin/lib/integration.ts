export const FEDERATION_SCOPES = [
  {
    code: 'capabilities.read',
    label: 'Capabilities',
    description: 'Discover enabled federation capabilities.',
  },
  {
    code: 'tenants.write',
    label: 'Tenant provisioning',
    description: 'Provision or reconcile the organization boundary.',
  },
  {
    code: 'branches.write',
    label: 'Branch provisioning',
    description: 'Provision or reconcile organization branches.',
  },
  {
    code: 'employees.write',
    label: 'Employee sync',
    description: 'Provision and reconcile employee identity data.',
  },
  {
    code: 'employees.branches.write',
    label: 'Employee branches',
    description: 'Assign employees to branches.',
  },
  {
    code: 'employees.access.write',
    label: 'Employee access',
    description: 'Synchronize employee access permissions.',
  },
  {
    code: 'employees.sessions.revoke',
    label: 'Session revocation',
    description: 'Revoke federated employee sessions.',
  },
  {
    code: 'attendance.read',
    label: 'Attendance read',
    description: 'Read attendance records and summaries.',
  },
  {
    code: 'attendance.write',
    label: 'Attendance write',
    description: 'Send check-in, check-out, and punch data.',
  },
  {
    code: 'attendance.preferences.read',
    label: 'Attendance preferences',
    description: 'Read attendance policies and preferences.',
  },
  {
    code: 'attendance.preferences.write',
    label: 'Attendance configuration',
    description: 'Configure attendance preferences and geofencing.',
  },
  {
    code: 'attendance.corrections.write',
    label: 'Attendance corrections',
    description: 'Submit attendance corrections.',
  },
  {
    code: 'attendance.corrections.decide',
    label: 'Correction decisions',
    description: 'Approve or reject attendance corrections.',
  },
  {
    code: 'attendance.webauthn.enroll',
    label: 'WebAuthn enrollment',
    description: 'Enroll employee verification credentials.',
  },
  {
    code: 'attendance.webauthn.assert',
    label: 'WebAuthn assertions',
    description: 'Verify attendance authentication assertions.',
  },
  {
    code: 'shifts.read',
    label: 'Shift visibility',
    description: 'Read shift definitions used for attendance.',
  },
  {
    code: 'leave.types.read',
    label: 'Leave types read',
    description: 'Read leave type configuration.',
  },
  {
    code: 'leave.types.write',
    label: 'Leave types write',
    description: 'Synchronize leave type configuration.',
  },
  {
    code: 'leave.balances.read',
    label: 'Leave balances',
    description: 'Read employee leave balances.',
  },
  {
    code: 'leave.balances.adjust',
    label: 'Balance adjustments',
    description: 'Apply audited leave balance adjustments.',
  },
  {
    code: 'leave.requests.read',
    label: 'Leave requests read',
    description: 'Read employee leave requests.',
  },
  {
    code: 'leave.requests.write',
    label: 'Leave requests write',
    description: 'Create or cancel leave requests.',
  },
  {
    code: 'leave.requests.decide',
    label: 'Leave decisions',
    description: 'Approve or reject leave requests.',
  },
  {
    code: 'payroll.components.read',
    label: 'Payroll components',
    description: 'Read configured pay components.',
  },
  {
    code: 'payroll.calendars.read',
    label: 'Payroll calendars read',
    description: 'Read payroll calendars.',
  },
  {
    code: 'payroll.calendars.write',
    label: 'Payroll calendars write',
    description: 'Configure payroll calendars.',
  },
  {
    code: 'payroll.runs.read',
    label: 'Payroll runs read',
    description: 'Read payroll run status and results.',
  },
  { code: 'payroll.runs.write', label: 'Payroll runs write', description: 'Create payroll runs.' },
  {
    code: 'payroll.runs.calculate',
    label: 'Payroll calculate',
    description: 'Calculate a payroll run.',
  },
  {
    code: 'payroll.runs.approve',
    label: 'Payroll approve',
    description: 'Approve a calculated payroll run.',
  },
  {
    code: 'payroll.runs.release',
    label: 'Payroll release',
    description: 'Release an approved payroll run.',
  },
  { code: 'payroll.runs.lock', label: 'Payroll lock', description: 'Lock a released payroll run.' },
  {
    code: 'payroll.adjustments.write',
    label: 'Payroll adjustments',
    description: 'Create audited payroll adjustments.',
  },
  {
    code: 'payroll.ledger.read',
    label: 'Payroll ledger',
    description: 'Read payroll ledger data.',
  },
  {
    code: 'webhooks.write',
    label: 'Webhook subscriptions',
    description: 'Register and manage event delivery.',
  },
  {
    code: 'webhooks.replay',
    label: 'Webhook replay',
    description: 'Replay a specific webhook delivery.',
  },
  {
    code: 'events.read',
    label: 'Event replay',
    description: 'Read cursor-based federation event history.',
  },
] as const;

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_CURRENCY = 'INR';

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}
