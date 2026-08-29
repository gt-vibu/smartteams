import employeesFixture from './fixtures/employees.json';
import { EmployeeProfile } from '../types/employee.types';

export const mockEmployeeProfile: EmployeeProfile =
  employeesFixture.currentEmployee as unknown as EmployeeProfile;
