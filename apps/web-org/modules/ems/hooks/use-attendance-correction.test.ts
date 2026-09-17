/**
 * A refused correction reaches the drawer with the API's reason, not a generic line.
 *
 * `requestCorrection` used to resolve `false` and park the message in state; the screens then
 * threw using a `saveError` captured before the request, so the employee read "could not be
 * submitted" whatever the API had said.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAttendance } from './use-attendance';

const requestCorrection = vi.fn();
const list = vi.fn();

vi.mock('../repositories/attendance.repository', () => ({
  attendanceRepository: {
    list: (...args: unknown[]) => list(...args) as unknown,
    requestCorrection: (...args: unknown[]) => requestCorrection(...args) as unknown,
    preferences: vi.fn().mockResolvedValue(null),
    getPreferences: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('./auth-context', () => ({
  useSession: () => ({
    session: { organizationId: 'org-1', employeeId: 'employee-1' },
    persona: { permissions: ['attendance.read', 'attendance.corrections.write'] },
  }),
}));

beforeEach(() => {
  requestCorrection.mockReset();
  list.mockReset().mockResolvedValue({ items: [], nextCursor: undefined });
});

describe('useAttendance.requestCorrection', () => {
  it("rejects with the API's reason", async () => {
    requestCorrection.mockRejectedValue(
      new Error('Correction reason must be at least 10 characters'),
    );
    const { result } = renderHook(() => useAttendance());
    await waitFor(() => expect(list).toHaveBeenCalled());

    await expect(result.current.requestCorrection('record-1', 'too short')).rejects.toThrow(
      'Correction reason must be at least 10 characters',
    );
  });

  it('resolves when the API accepts, and reloads the records', async () => {
    requestCorrection.mockResolvedValue({ id: 'correction-1' });
    const { result } = renderHook(() => useAttendance());
    await waitFor(() => expect(list).toHaveBeenCalled());
    const loadsBefore = list.mock.calls.length;

    await act(() => result.current.requestCorrection('record-1', 'Forgot to punch out at 18:00'));

    expect(requestCorrection).toHaveBeenCalledWith(
      'org-1',
      'record-1',
      'Forgot to punch out at 18:00',
    );
    expect(list.mock.calls.length).toBeGreaterThan(loadsBefore);
  });
});
