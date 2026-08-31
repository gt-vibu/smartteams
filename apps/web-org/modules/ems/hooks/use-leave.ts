'use client';

import { useState, useEffect, useCallback } from 'react';
import { leaveRepository } from '../repositories/leave.repository';
import type {
  LeaveBalanceItem,
  LeaveApplicationItem,
  ApplyLeaveFormData,
} from '../types/leave.types';

export function useLeave() {
  const [balances, setBalances] = useState<LeaveBalanceItem[]>(() => leaveRepository.getBalances());
  const [applications, setApplications] = useState<LeaveApplicationItem[]>(() =>
    leaveRepository.getApplications(),
  );

  const refresh = useCallback(() => {
    setTimeout(() => {
      setBalances(leaveRepository.getBalances());
      setApplications(leaveRepository.getApplications());
    }, 0);
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

  const applyLeave = useCallback((data: ApplyLeaveFormData) => {
    const updatedApps = leaveRepository.applyLeave(data);
    setApplications(updatedApps);
    setBalances(leaveRepository.getBalances());
    return updatedApps;
  }, []);

  const approveLeave = useCallback((id: string) => {
    const updated = leaveRepository.approveApplication(id);
    setApplications(updated);
    setBalances(leaveRepository.getBalances());
    return updated;
  }, []);

  const rejectLeave = useCallback((id: string) => {
    const updated = leaveRepository.rejectApplication(id);
    setApplications(updated);
    setBalances(leaveRepository.getBalances());
    return updated;
  }, []);

  return {
    balances,
    applications,
    applyLeave,
    approveLeave,
    rejectLeave,
    refresh,
  };
}
