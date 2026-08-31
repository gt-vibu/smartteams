'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  AttendanceLiveState,
  AttendanceRecordItem,
  AttendancePunchItem,
} from '../repositories/attendance.repository';
import { attendanceRepository } from '../repositories/attendance.repository';

export function useAttendance() {
  const [liveState, setLiveState] = useState<AttendanceLiveState>(() =>
    attendanceRepository.getLiveState(),
  );
  const [records, setRecords] = useState<AttendanceRecordItem[]>(() =>
    attendanceRepository.getRecords(),
  );
  const [punches, setPunches] = useState<AttendancePunchItem[]>(() =>
    attendanceRepository.getPunches(),
  );

  const [timerDisplay, setTimerDisplay] = useState<{
    hrs: string;
    mins: string;
    secs: string;
    totalSeconds: number;
  }>({ hrs: '00', mins: '00', secs: '00', totalSeconds: 0 });

  const refresh = useCallback(() => {
    setTimeout(() => {
      setLiveState(attendanceRepository.getLiveState());
      setRecords(attendanceRepository.getRecords());
      setPunches(attendanceRepository.getPunches());
    }, 0);
  }, []);

  // Sync with storage events across components and tabs
  useEffect(() => {
    const handleStorageChange = () => refresh();
    window.addEventListener('ems:storage:change', handleStorageChange);
    window.addEventListener('ems:storage:reset', handleStorageChange);
    return () => {
      window.removeEventListener('ems:storage:change', handleStorageChange);
      window.removeEventListener('ems:storage:reset', handleStorageChange);
    };
  }, [refresh]);

  // Live Timer derived strictly from checkInTimestamp
  useEffect(() => {
    if (!liveState.isCheckedIn || !liveState.checkInTimestamp) {
      setTimerDisplay({ hrs: '00', mins: '00', secs: '00', totalSeconds: 0 });
      return;
    }

    const calculateTimer = () => {
      const checkInTime = new Date(liveState.checkInTimestamp!).getTime();
      const now = Date.now();
      const diffSecs = Math.max(0, Math.floor((now - checkInTime) / 1000));

      const h = Math.floor(diffSecs / 3600);
      const m = Math.floor((diffSecs % 3600) / 60);
      const s = diffSecs % 60;

      setTimerDisplay({
        hrs: String(h).padStart(2, '0'),
        mins: String(m).padStart(2, '0'),
        secs: String(s).padStart(2, '0'),
        totalSeconds: diffSecs,
      });
    };

    calculateTimer();
    const interval = setInterval(calculateTimer, 1000);
    return () => clearInterval(interval);
  }, [liveState.isCheckedIn, liveState.checkInTimestamp]);

  const checkIn = useCallback((note: string = '') => {
    const newState = attendanceRepository.checkIn(note);
    setLiveState(newState);
    setRecords(attendanceRepository.getRecords());
    setPunches(attendanceRepository.getPunches());
    return newState;
  }, []);

  const checkOut = useCallback((note: string = '') => {
    const newState = attendanceRepository.checkOut(note);
    setLiveState(newState);
    setRecords(attendanceRepository.getRecords());
    setPunches(attendanceRepository.getPunches());
    return newState;
  }, []);

  const regularize = useCallback((recordId: string, reason: string) => {
    const success = attendanceRepository.regularize(recordId, reason);
    if (success) {
      setRecords(attendanceRepository.getRecords());
    }
    return success;
  }, []);

  return {
    liveState,
    records,
    punches,
    timerDisplay,
    checkIn,
    checkOut,
    regularize,
    refresh,
  };
}
