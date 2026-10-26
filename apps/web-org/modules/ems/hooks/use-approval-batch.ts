'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { emitDataChanged } from '../lib/data-events';
import { orgPath } from '../repositories/api-helpers';

export type BatchResult = {
  id: string;
  domain: string;
  outcome: 'DECIDED' | 'FAILED';
  status?: string;
  message: string;
  label?: string;
};
export type BatchState = {
  batchId: string;
  state: string;
  total: number;
  processed: number;
  results: BatchResult[];
  error: string | null;
};
type BatchItem = {
  id: string;
  domain: 'LEAVE' | 'ATTENDANCE_CORRECTION';
  expectedStepNumber: number;
  label?: string;
};

function savedBatch(key: string, value?: string) {
  try {
    if (value) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useApprovalBatch(organizationId: string | null, userId: string | null) {
  const [state, setState] = useState<BatchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const key =
    organizationId && userId ? `smarteam-approval-batch:${organizationId}:${userId}` : null;
  const refreshed = useRef<string | null>(null);
  const currentKey = useRef(key);
  currentKey.current = key;
  const active = state !== null && !['completed', 'failed'].includes(state.state);
  useEffect(() => {
    setState(null);
    setError(null);
    setStarting(false);
    if (!key || !organizationId) return;
    let alive = true;
    const id = savedBatch(key);
    if (id)
      void apiRequest(`${orgPath(organizationId, '/approval-batches')}/${encodeURIComponent(id)}`, {
        method: 'GET',
      })
        .then((result) => {
          if (alive) setState(result as BatchState);
        })
        .catch((caught) => {
          if (alive)
            setError(caught instanceof Error ? caught.message : 'Could not restore the batch.');
        });
    return () => {
      alive = false;
    };
  }, [key, organizationId]);
  useEffect(() => {
    if (!active || !organizationId || !state.batchId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = (await apiRequest(
          `${orgPath(organizationId, '/approval-batches')}/${encodeURIComponent(state.batchId)}`,
          { method: 'GET' },
        )) as BatchState;
        if (alive) {
          setState(result);
          setError(null);
        }
      } catch (caught) {
        if (alive)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Progress could not be loaded. The batch continues on the server.',
          );
      }
      if (alive) timer = setTimeout(() => void poll(), 1500);
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active, state?.batchId, organizationId]);
  useEffect(() => {
    if (state?.state === 'completed' && refreshed.current !== state.batchId) {
      refreshed.current = state.batchId;
      emitDataChanged('approvals', 'leave', 'attendance', 'timesheets', 'payroll');
    }
  }, [state]);
  const start = useCallback(
    async (items: BatchItem[], status: 'APPROVED' | 'REJECTED', comment: string) => {
      if (!organizationId || !key || active || starting) return false;
      setStarting(true);
      setError(null);
      const batchId = crypto.randomUUID();
      // Store before sending; an uncertain network result can still be recovered after a reload.
      savedBatch(key, batchId);
      try {
        const result = (await apiRequest(orgPath(organizationId, '/approval-batches'), {
          method: 'POST',
          body: { batchId, items, status, ...(comment.trim() ? { comment: comment.trim() } : {}) },
        })) as BatchState;
        if (currentKey.current === key) setState(result);
        return true;
      } catch (caught) {
        try {
          const restored = await apiRequest(
            `${orgPath(organizationId, '/approval-batches')}/${batchId}`,
            { method: 'GET' },
          );
          if (currentKey.current === key) setState(restored as BatchState);
          return true;
        } catch {
          if (currentKey.current === key)
            setError(caught instanceof Error ? caught.message : 'Could not start the batch.');
        }
        return false;
      } finally {
        if (currentKey.current === key) setStarting(false);
      }
    },
    [organizationId, key, active, starting],
  );
  return { state, error, running: active || starting, start };
}
