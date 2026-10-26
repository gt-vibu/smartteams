'use client';
import {
  workforceJobSchema,
  type WorkforceInput,
  type WorkforceJobState,
} from '@smarteam/contracts';
import { useEffect, useRef, useState } from 'react';
import { useSession } from './auth-context';
import { apiRequest } from '../lib/api-client';
import { emitDataChanged } from '../lib/data-events';
import { orgPath } from '../repositories/api-helpers';

export function useWorkforceJob() {
  const { session } = useSession();
  const org = session?.organizationId;
  const key = org && session.user.id ? `smarteam-workforce:${org}:${session.user.id}` : null;
  const [state, setState] = useState<WorkforceJobState | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [offset, setOffset] = useState(0);
  const revision = useRef(0);
  const refreshed = useRef('');
  const active = Boolean(state && !['completed', 'failed'].includes(state.state));
  useEffect(() => {
    revision.current++;
    setState(null);
    setError('');
    setOffset(0);
    setStarting(false);
    if (!key || !org) return;
    let alive = true;
    let id: string | null = null;
    try {
      id = localStorage.getItem(key);
    } catch {
      /* Storage can be disabled. */
    }
    if (id)
      void apiRequest(orgPath(org, `/workforce/jobs/${encodeURIComponent(id)}`), { method: 'GET' })
        .then((result) => {
          if (alive) setState(workforceJobSchema.parse(result));
        })
        .catch((caught) => {
          if (alive)
            setError(caught instanceof Error ? caught.message : 'Could not restore the job.');
        });
    return () => {
      alive = false;
    };
  }, [key, org]);
  useEffect(() => {
    if (!state?.batchId || !org) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = workforceJobSchema.parse(
          await apiRequest(orgPath(org, `/workforce/jobs/${state.batchId}?offset=${offset}`), {
            method: 'GET',
          }),
        );
        if (!alive) return;
        setState(data);
        setError('');
        if (['completed', 'failed'].includes(data.state)) {
          if (refreshed.current !== data.batchId) {
            refreshed.current = data.batchId;
            emitDataChanged('workforce', 'payroll', 'leave', 'attendance', 'approvals');
          }
          return;
        }
      } catch (caught) {
        if (alive)
          setError(caught instanceof Error ? caught.message : 'Could not read job progress.');
      }
      if (alive) timer = setTimeout(() => void poll(), 2500);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [state?.batchId, org, offset]);
  const start = async (input: WorkforceInput, fingerprint: string) => {
    if (!org || !key || starting || active) return;
    const version = revision.current;
    const batchId = crypto.randomUUID();
    setStarting(true);
    setError('');
    setOffset(0);
    try {
      localStorage.setItem(key, batchId);
    } catch {
      /* Progress remains available in this session. */
    }
    try {
      const result = workforceJobSchema.parse(
        await apiRequest(orgPath(org, '/workforce/jobs'), {
          method: 'POST',
          body: { ...input, fingerprint, batchId },
          timeoutMs: 60000,
        }),
      );
      if (revision.current === version) {
        setState(result);
        try {
          localStorage.setItem(key, batchId);
        } catch {
          /* Job still runs. */
        }
      }
    } catch (caught) {
      // A lost POST response does not imply the background job failed to start.
      try {
        const recovered = workforceJobSchema.parse(
          await apiRequest(orgPath(org, `/workforce/jobs/${batchId}`), { method: 'GET' }),
        );
        if (revision.current === version) {
          setState(recovered);
          setError('');
        }
      } catch {
        if (revision.current === version)
          setError(caught instanceof Error ? caught.message : 'Could not start assignments.');
      }
    } finally {
      if (revision.current === version) setStarting(false);
    }
  };
  return { state, error, starting, active, start, offset, setOffset };
}
