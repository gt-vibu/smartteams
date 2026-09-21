import {
  decideFileAccess,
  mayUploadTo,
  type AccessFile,
  type AccessShare,
  type AccessViewer,
} from './files-access-policy';

/**
 * The document access matrix. Each case is one real situation; the names say who, what and
 * the expected answer.
 */
const EMPLOYEE_PERMS = ['files.read', 'files.write'];
const HR_PERMS = [...EMPLOYEE_PERMS, 'files.read.all', 'files.organization.manage', 'files.share'];

const viewer = (overrides: Partial<AccessViewer> & { perms?: string[] } = {}): AccessViewer => ({
  userId: 'u-vibu',
  employeeId: 'e-vibu',
  roleIds: new Set(['r-employee']),
  teamIds: new Set<string>(),
  reportIds: new Set<string>(),
  permissions: new Set(overrides.perms ?? EMPLOYEE_PERMS),
  ...overrides,
});
const vibu = viewer();
const other = viewer({ userId: 'u-asha', employeeId: 'e-asha' });
const hr = viewer({
  userId: 'u-hr',
  employeeId: 'e-hr',
  perms: HR_PERMS,
  roleIds: new Set(['r-hr']),
});
const admin = viewer({ userId: 'u-admin', employeeId: null, perms: ['*'] });

const file = (overrides: Partial<AccessFile> = {}): AccessFile => ({
  accessScope: 'EMPLOYEE',
  employeeId: 'e-vibu',
  teamId: null,
  uploadedByUserId: 'u-hr',
  allowDownload: true,
  shares: [],
  ...overrides,
});
const share = (overrides: Partial<AccessShare>): AccessShare => ({
  granteeType: 'USER',
  granteeUserId: null,
  granteeRoleId: null,
  granteeTeamId: null,
  canDownload: false,
  expiresAt: null,
  revokedAt: null,
  ...overrides,
});

describe('document access', () => {
  describe('admin → employee (offer letter filed about Vibu)', () => {
    const offer = file();
    it('Vibu can view and download it, but not delete what HR filed', () => {
      expect(decideFileAccess(offer, vibu)).toMatchObject({
        view: true,
        download: true,
        manage: false,
        reason: 'ABOUT_YOU',
      });
    });
    it('an unrelated employee cannot see it', () => {
      expect(decideFileAccess(offer, other).view).toBe(false);
    });
    it('HR can view, download and manage it', () => {
      expect(decideFileAccess(offer, hr)).toMatchObject({ view: true, manage: true, reason: 'HR' });
    });
  });

  describe('employee → HR (address proof sent for review)', () => {
    const proof = file({ uploadedByUserId: 'u-vibu' });
    it('HR can view it', () => expect(decideFileAccess(proof, hr).view).toBe(true));
    it('an unrelated employee cannot', () =>
      expect(decideFileAccess(proof, other).view).toBe(false));
    it('Vibu can withdraw what they sent', () =>
      expect(decideFileAccess(proof, vibu).manage).toBe(true));
  });

  describe('personal file', () => {
    const personal = file({ accessScope: 'PERSONAL', uploadedByUserId: 'u-vibu' });
    it('its owner can view and manage it', () => {
      expect(decideFileAccess(personal, vibu)).toMatchObject({ view: true, manage: true });
    });
    it('HR cannot open it, even with files.read.all', () => {
      expect(decideFileAccess(personal, hr).view).toBe(false);
    });
    it('the tenant administrator (wildcard) cannot open it either', () => {
      expect(decideFileAccess(personal, admin).view).toBe(false);
    });
    it('a manager of the owner cannot open it', () => {
      const manager = viewer({
        userId: 'u-m',
        employeeId: 'e-m',
        reportIds: new Set(['e-vibu']),
        perms: [...EMPLOYEE_PERMS, 'files.reports.read'],
      });
      expect(decideFileAccess(personal, manager).view).toBe(false);
    });
    it('another employee cannot open it', () =>
      expect(decideFileAccess(personal, other).view).toBe(false));
  });

  describe('organization file (handbook)', () => {
    const handbook = file({ accessScope: 'ORGANIZATION', employeeId: null });
    it('an employee with files.read can view it', () => {
      expect(decideFileAccess(handbook, other)).toMatchObject({ view: true, manage: false });
    });
    it('someone without files.read cannot', () => {
      expect(decideFileAccess(handbook, viewer({ perms: [] })).view).toBe(false);
    });
    it('a publisher can manage it', () => expect(decideFileAccess(handbook, hr).manage).toBe(true));
    it('view-only when the publisher turned downloads off', () => {
      const viewOnly = file({
        accessScope: 'ORGANIZATION',
        employeeId: null,
        allowDownload: false,
      });
      expect(decideFileAccess(viewOnly, other)).toMatchObject({ view: true, download: false });
      expect(decideFileAccess(viewOnly, hr).download).toBe(true);
    });
  });

  describe('team file', () => {
    const plan = file({ accessScope: 'TEAM', employeeId: null, teamId: 't-eng' });
    it('a member of the team can view it', () => {
      expect(decideFileAccess(plan, viewer({ teamIds: new Set(['t-eng']) })).view).toBe(true);
    });
    it('someone outside the team cannot', () =>
      expect(decideFileAccess(plan, other).view).toBe(false));
  });

  describe('sharing', () => {
    const personal = file({ accessScope: 'PERSONAL', uploadedByUserId: 'u-vibu' });
    it('a file shared with a user opens for that user only', () => {
      const shared = { ...personal, shares: [share({ granteeUserId: 'u-asha' })] };
      expect(decideFileAccess(shared, other)).toMatchObject({
        view: true,
        download: false,
        reason: 'SHARED',
      });
      expect(decideFileAccess(shared, hr).view).toBe(false);
    });
    it('a role share reaches holders of that role', () => {
      const shared = {
        ...personal,
        shares: [share({ granteeType: 'ROLE', granteeRoleId: 'r-hr' })],
      };
      expect(decideFileAccess(shared, hr).view).toBe(true);
      expect(decideFileAccess(shared, other).view).toBe(false);
    });
    it('a team share reaches that team', () => {
      const shared = {
        ...personal,
        shares: [share({ granteeType: 'TEAM', granteeTeamId: 't-eng' })],
      };
      expect(
        decideFileAccess(
          shared,
          viewer({ userId: 'u-x', employeeId: 'e-x', teamIds: new Set(['t-eng']) }),
        ).view,
      ).toBe(true);
    });
    it('a share can allow download', () => {
      const shared = {
        ...personal,
        shares: [share({ granteeUserId: 'u-asha', canDownload: true })],
      };
      expect(decideFileAccess(shared, other).download).toBe(true);
    });
    it('a revoked share gives nothing', () => {
      const shared = {
        ...personal,
        shares: [share({ granteeUserId: 'u-asha', revokedAt: new Date() })],
      };
      expect(decideFileAccess(shared, other).view).toBe(false);
    });
    it('an expired share gives nothing', () => {
      const shared = {
        ...personal,
        shares: [share({ granteeUserId: 'u-asha', expiresAt: new Date(Date.now() - 1000) })],
      };
      expect(decideFileAccess(shared, other).view).toBe(false);
    });
  });

  describe('manager access to reports', () => {
    const report = file();
    const manager = (perms: string[]) =>
      viewer({ userId: 'u-m', employeeId: 'e-m', reportIds: new Set(['e-vibu']), perms });
    it('is off without files.reports.read, even for the direct manager', () => {
      expect(decideFileAccess(report, manager(EMPLOYEE_PERMS)).view).toBe(false);
    });
    it('is on with it, for direct reports only', () => {
      const withPermission = manager([...EMPLOYEE_PERMS, 'files.reports.read']);
      expect(decideFileAccess(report, withPermission)).toMatchObject({
        view: true,
        reason: 'MANAGER',
      });
      expect(decideFileAccess(file({ employeeId: 'e-asha' }), withPermission).view).toBe(false);
    });
  });

  describe('permission revocation', () => {
    it('a caller whose files.read was removed sees nothing, whatever the file', () => {
      const revoked = viewer({ perms: ['files.write'] });
      expect(decideFileAccess(file(), revoked).view).toBe(false);
      expect(
        decideFileAccess(file({ accessScope: 'ORGANIZATION', employeeId: null }), revoked).view,
      ).toBe(false);
    });
  });

  describe('internal files', () => {
    const exported = file({ accessScope: 'INTERNAL', employeeId: null });
    it('stay with file administrators', () => {
      expect(decideFileAccess(exported, hr).view).toBe(true);
      expect(decideFileAccess(exported, vibu).view).toBe(false);
    });
  });

  describe('where a caller may upload', () => {
    it('an employee may upload personal and HR-review files for themselves only', () => {
      expect(mayUploadTo('PERSONAL', vibu, 'e-vibu')).toBe(true);
      expect(mayUploadTo('EMPLOYEE', vibu, 'e-vibu')).toBe(true);
      expect(mayUploadTo('EMPLOYEE', vibu, 'e-asha')).toBe(false);
      expect(mayUploadTo('ORGANIZATION', vibu, null)).toBe(false);
    });
    it('nobody files a personal document for someone else', () => {
      expect(mayUploadTo('PERSONAL', hr, 'e-vibu')).toBe(false);
    });
    it('HR may file for any employee and publish company documents', () => {
      expect(mayUploadTo('EMPLOYEE', hr, 'e-vibu')).toBe(true);
      expect(mayUploadTo('ORGANIZATION', hr, null)).toBe(true);
    });
    it('an employee may share with a team they are on or lead, and no other', () => {
      const onTeam = { ...vibu, teamIds: new Set(['t-core']) };
      expect(mayUploadTo('TEAM', onTeam, null, 't-core')).toBe(true);
      expect(mayUploadTo('TEAM', onTeam, null, 't-other')).toBe(false);
      expect(mayUploadTo('TEAM', vibu, null, null)).toBe(false);
    });
  });
});
