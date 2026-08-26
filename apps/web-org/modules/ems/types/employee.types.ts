export interface EmployeeProfile {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  jobTitle: string;
  department: string;
  location?: string;
  avatarUrl?: string | null;
  joinedDate?: string;
  phone?: string;
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'INTERN';
  status?: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
  manager: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    jobTitle?: string;
    isOnline: boolean;
  };
  departmentMembers: Array<{
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    jobTitle?: string;
    isOnline: boolean;
  }>;
}

