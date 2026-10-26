import { describe, expect, it } from 'vitest';
import type { ApprovalPolicy } from '@smarteam/contracts';
import { draftsFrom, stepsFrom } from './approval-step-editor';

const ROLE = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

const policy = (steps: ApprovalPolicy['steps']): ApprovalPolicy => ({
  id: 'p',
  organizationId: 'o',
  domain: 'LEAVE',
  code: 'LEAVE',
  name: 'Leave',
  isDefault: true,
  isActive: true,
  steps,
});

describe('approval step drafts', () => {
  it('starts a new policy at the reporting manager, with the administrator as backup', () => {
    expect(draftsFrom(null, ROLE)).toEqual([{ kind: 'MANAGER', roleId: ROLE, userId: '' }]);
  });

  it('reads a saved chain back as it was built', () => {
    const drafts = draftsFrom(
      policy([
        {
          id: 'a',
          stepNumber: 1,
          approverType: 'MANAGER',
          roleId: ROLE,
          approverUserId: null,
          required: true,
        },
        {
          id: 'b',
          stepNumber: 2,
          approverType: 'USER',
          roleId: null,
          approverUserId: USER,
          required: true,
        },
      ]),
      '',
    );
    expect(drafts).toEqual([
      { kind: 'MANAGER', roleId: ROLE, userId: '' },
      { kind: 'USER', roleId: '', userId: USER },
    ]);
  });

  it('numbers the steps in the order shown and sends a manager backup only when chosen', () => {
    expect(
      stepsFrom([
        { kind: 'MANAGER', roleId: '', userId: '' },
        { kind: 'ROLE', roleId: ROLE, userId: '' },
        { kind: 'USER', roleId: '', userId: USER },
      ]),
    ).toEqual([
      { stepNumber: 1, approverType: 'MANAGER' },
      { stepNumber: 2, approverType: 'ROLE', roleId: ROLE },
      { stepNumber: 3, approverType: 'USER', approverUserId: USER },
    ]);
  });

  it('holds back a chain while a step has no approver chosen', () => {
    expect(stepsFrom([{ kind: 'ROLE', roleId: '', userId: '' }])).toBeNull();
    expect(stepsFrom([{ kind: 'USER', roleId: '', userId: '' }])).toBeNull();
  });
});
