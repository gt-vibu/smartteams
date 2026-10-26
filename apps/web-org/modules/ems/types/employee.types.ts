export interface EmployeeProfile {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  workEmail: string | null;
  jobTitle: string | null;
  department: string | null;
  location?: string;
  avatarUrl?: string | null;
  joinedDate?: string;
  phone?: string;
  employmentType?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
  manager?: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    jobTitle?: string;
    isOnline: boolean;
  } | null;
  /** People who report to this employee. */
  directReports?: Array<{
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
  }>;
  departmentMembers: Array<{
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    jobTitle?: string;
    isOnline: boolean;
  }>;
}
