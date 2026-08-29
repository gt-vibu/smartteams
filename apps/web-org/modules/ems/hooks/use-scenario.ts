'use client';

import { useState, useEffect, useCallback } from 'react';
import { emsStorageAdapter } from '../storage/storage.adapter';
import { EMS_STORAGE_KEYS } from '../storage/storage.keys';

export type EmsScenarioType =
  'fresh' | 'checked-in' | 'checked-out' | 'pending-approvals' | 'empty-state';

export function useScenario() {
  const [activeScenario, setActiveScenario] = useState<EmsScenarioType>(() =>
    emsStorageAdapter.getItem<EmsScenarioType>(EMS_STORAGE_KEYS.ACTIVE_SCENARIO, 'fresh'),
  );

  const setScenario = useCallback((scenario: EmsScenarioType) => {
    emsStorageAdapter.seedScenario(scenario);
    setActiveScenario(scenario);
  }, []);

  const resetAllData = useCallback(() => {
    emsStorageAdapter.resetToDefaults();
    setActiveScenario('fresh');
  }, []);

  useEffect(() => {
    const handleStorage = () => {
      setActiveScenario(
        emsStorageAdapter.getItem<EmsScenarioType>(EMS_STORAGE_KEYS.ACTIVE_SCENARIO, 'fresh'),
      );
    };
    window.addEventListener('ems:storage:reset', handleStorage);
    window.addEventListener('ems:storage:change', handleStorage);
    return () => {
      window.removeEventListener('ems:storage:reset', handleStorage);
      window.removeEventListener('ems:storage:change', handleStorage);
    };
  }, []);

  return {
    activeScenario,
    setScenario,
    resetAllData,
  };
}
