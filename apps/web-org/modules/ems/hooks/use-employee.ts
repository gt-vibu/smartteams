'use client';

import { useState, useEffect, useCallback } from 'react';
import { employeeRepository, EmployeeProfile } from '../repositories/employee.repository';

export function useEmployee() {
  const [employee, setEmployee] = useState<EmployeeProfile>(() =>
    employeeRepository.getCurrentEmployee()
  );

  const refresh = useCallback(() => {
    setEmployee(employeeRepository.getCurrentEmployee());
  }, []);

  useEffect(() => {
    const handleStorageChange = () => refresh();
    window.addEventListener('ems:storage:change', handleStorageChange);
    window.addEventListener('ems:storage:reset', handleStorageChange);
    return () => {
      window.removeEventListener('ems:storage:change', handleStorageChange);
      window.removeEventListener('ems:storage:reset', handleStorageChange);
    };
  }, [refresh]);

  const updateProfile = useCallback((updates: Partial<EmployeeProfile>) => {
    const updated = employeeRepository.updateProfile(updates);
    setEmployee(updated);
    return updated;
  }, []);

  const updateAvatar = useCallback((avatarUrl: string | null) => {
    const updated = employeeRepository.updateAvatar(avatarUrl);
    setEmployee(updated);
    return updated;
  }, []);

  return {
    employee,
    updateProfile,
    updateAvatar,
    refresh,
  };
}
