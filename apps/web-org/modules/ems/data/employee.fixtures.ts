import { EmployeeProfile } from '../types/employee.types';

export const mockEmployeeProfile: EmployeeProfile = {
  id: 'emp_064',
  employeeNumber: '64',
  firstName: 'Mithun',
  lastName: 'Gowda H',
  workEmail: 'mithun.gowda@smarteam.cloud',
  jobTitle: 'Software Engineer',
  department: 'Product Engineering',
  employmentType: 'FULL_TIME',
  status: 'ACTIVE',
  manager: {
    id: 'emp_009',
    employeeNumber: '009',
    firstName: 'Ranjith',
    lastName: 'Kumar C',
    isOnline: true,
  },
  departmentMembers: [
    {
      id: 'emp_009',
      employeeNumber: '009',
      firstName: 'Ranjith',
      lastName: 'Kumar C',
      isOnline: true,
    },
    {
      id: 'emp_016',
      employeeNumber: '016',
      firstName: 'Shailesh',
      lastName: 'Thipse',
      isOnline: true,
    },
    {
      id: 'emp_018',
      employeeNumber: '018',
      firstName: 'Tejasri',
      lastName: 'Bonala',
      isOnline: true,
    },
  ],
};
