export type CandidateStage =
  | 'OFFER_ACCEPTED'
  | 'PRE_BOARDING'
  | 'DOCS_VERIFICATION'
  | 'ASSET_PROVISIONING'
  | 'DAY1_READY'
  | 'COMPLETED';

export interface OnboardingDocument {
  id: string;
  title: string;
  type: 'IDENTITY' | 'EDUCATION' | 'EXPERIENCE' | 'BANKING' | 'TAX';
  fileName: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  submittedAt: string;
  verifiedAt: string | null;
  reviewerRemarks: string | null;
}

export interface OnboardingTask {
  id: string;
  title: string;
  description: string;
  stage: 'PRE_BOARDING' | 'DAY_1' | 'WEEK_1' | 'MONTH_1';
  assignedRole: 'HR' | 'IT' | 'MANAGER' | 'EMPLOYEE';
  isCompleted: boolean;
  dueDate: string;
  completedAt: string | null;
}

export interface ProvisionedAsset {
  id: string;
  assetType: 'LAPTOP' | 'MONITOR' | 'ACCESS_CARD' | 'PERIPHERALS';
  modelName: string;
  serialNumber: string;
  status: 'ORDERED' | 'ASSIGNED' | 'DISPATCHED' | 'DELIVERED';
  trackingNumber: string | null;
  assignedAt: string;
}

export interface CandidateRecord {
  id: string;
  candidateName: string;
  firstName: string;
  lastName: string;
  personalEmail: string;
  workEmail: string;
  phone: string;
  employeeNumber: string;
  jobTitle: string;
  department: string;
  branchName: string;
  managerName: string;
  managerEmployeeId: string;
  joiningDate: string;
  employmentType: 'FULL_TIME' | 'CONTRACT' | 'INTERN';
  shiftName: string;
  stage: CandidateStage;
  progressPercentage: number;
  avatarInitials: string;
  assignedTeamName: string | null;
  assignedProjectName: string | null;
  allocationPercentage: number | null;
  compensation: {
    annualCtc: number;
    currency: string;
    payFrequency: string;
    basic: number;
    hra: number;
    specialAllowance: number;
  };
  documents: OnboardingDocument[];
  checklist: OnboardingTask[];
  assets: ProvisionedAsset[];
  notes: string | null;
  createdAt: string;
}
