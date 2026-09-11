export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type GeofenceMode = 'DISABLED' | 'RECOMMENDED' | 'ENFORCED';
export type BiometricVerificationMode = 'DISABLED' | 'OPTIONAL' | 'MANDATORY';
export type ApproverType = 'MANAGER' | 'ROLE' | 'SPECIFIC_USER';
export type ApprovalDomain =
  'ATTENDANCE_CORRECTION' | 'LEAVE_REQUEST' | 'TIMESHEET' | 'PAYROLL_RUN';

export interface WorkLocationData {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isActive: boolean;
}

export interface BranchAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  pinCode: string;
}

export interface BranchData {
  id: string;
  name: string;
  code: string;
  status: OrganizationStatus;
  timezone: string;
  isHQ: boolean;
  employeeCount: number;
  geofenceMode: GeofenceMode;
  biometricVerificationMode: BiometricVerificationMode;
  address: BranchAddress;
  workLocations: WorkLocationData[];
}

export interface OrganizationSettingsData {
  workWeekDays: number[];
  standardDayMinutes: number;
  payrollFrequency: 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY';
  leaveYearStartMonth: number;
  geofenceMode: GeofenceMode;
  biometricVerificationMode: BiometricVerificationMode;
}

export interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  legalEntityName: string;
  status: OrganizationStatus;
  timezone: string;
  currencyCode: string;
  locale: string;
  country: string;
  logoUrl: string | null;
  coverUrl: string | null;
  employeeCount: number;
  branchCount: number;
  departmentCount: number;
  activeTeamsCount: number;
  activeProjectsCount: number;
  settings: OrganizationSettingsData;
}

export interface OrgEmployeeSummary {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
  branchId: string;
  branchName: string;
  workEmail: string;
  phone?: string;
  avatarUrl?: string | null;
  avatarInitials: string;
  managerEmployeeId?: string | null;
  managerName?: string | null;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
  status: 'ACTIVE' | 'INACTIVE';
  dateOfJoining: string;
  isOnline?: boolean;
}

export interface OrgEmployeeNode extends OrgEmployeeSummary {
  directReportsCount: number;
  children: OrgEmployeeNode[];
}

export interface DepartmentData {
  id: string;
  name: string;
  code: string;
  description: string;
  headEmployeeId: string | null;
  headEmployeeName: string | null;
  headEmployeeJobTitle?: string | null;
  headEmployeeAvatar?: string | null;
  memberCount: number;
  employees: OrgEmployeeSummary[];
}

export interface ApprovalPolicyStepData {
  stepNumber: number;
  approverType: ApproverType;
  approverTitle: string;
  required: boolean;
}

export interface ApprovalPolicyData {
  id: string;
  domain: ApprovalDomain;
  code: string;
  name: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  steps: ApprovalPolicyStepData[];
}

export interface AnnouncementData {
  id: string;
  title: string;
  content: string;
  author: string;
  role: string;
  avatarInitials: string;
  date: string;
  category: 'ALL_HANDS' | 'POLICY' | 'EVENT' | 'SECURITY';
  isPinned: boolean;
  likes: number;
  commentsCount: number;
}

export interface MilestoneData {
  id: string;
  type: 'BIRTHDAY' | 'NEW_HIRE' | 'ANNIVERSARY';
  employeeName: string;
  employeeNumber: string;
  jobTitle: string;
  department: string;
  avatarInitials: string;
  date: string;
  badgeText: string;
}
