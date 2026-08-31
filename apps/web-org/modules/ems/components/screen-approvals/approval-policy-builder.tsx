'use client';

import React, { useState } from 'react';
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Input,
  Select,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@smarteam/ui';
import policiesFixture from '../../data/fixtures/approval-policies.json';
import { emsStorageAdapter } from '../../storage/storage.adapter';

const STORAGE_KEY_APPROVAL_POLICIES = 'ems_approval_policies_list';

export interface ApprovalStep {
  stepNumber: number;
  name: string;
  approverType: 'MANAGER' | 'ROLE' | 'USER' | 'SELF_ADMIN' | 'HR_HEAD';
  targetRole: string | null;
  targetUserId: string | null;
  targetUserName: string | null;
  required: boolean;
  autoEscalateHours: number;
}

export interface ApprovalPolicy {
  id: string;
  domain: string;
  code: string;
  name: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  precedenceLevel: 'ORGANIZATION_DEFAULT' | 'ROLE_RULE' | 'EMPLOYEE_OVERRIDE';
  targetRole?: string;
  targetDepartment?: string;
  targetEmployeeName?: string;
  steps: ApprovalStep[];
}

const DOMAINS_LIST = [
  { id: 'LEAVE_REQUEST', label: 'Leave' },
  { id: 'ATTENDANCE_CORRECTION', label: 'Attendance Regularization' },
  { id: 'TIMESHEET', label: 'Timesheets' },
  { id: 'OVERTIME', label: 'Overtime' },
  { id: 'PAYROLL_RELEASE', label: 'Payroll Release' },
  { id: 'SALARY_REVISION', label: 'Salary Revision' },
  { id: 'SALARY_ADVANCE', label: 'Salary Advance' },
  { id: 'EXPENSE_REIMBURSEMENT', label: 'Expense Reimbursement' },
];

const PRECEDENCE_LEVELS: Array<{
  value: ApprovalPolicy['precedenceLevel'];
  label: string;
}> = [
  { value: 'ORGANIZATION_DEFAULT', label: 'Org Default' },
  { value: 'ROLE_RULE', label: 'Role Rule' },
  { value: 'EMPLOYEE_OVERRIDE', label: 'Employee' },
];

const APPROVER_PRESETS: Array<{
  type: ApprovalStep['approverType'];
  label: string;
  role: string | null;
}> = [
  { type: 'MANAGER', label: '👔 Direct Manager', role: null },
  { type: 'SELF_ADMIN', label: '👑 Admin (Myself)', role: 'Tenant Admin' },
  { type: 'HR_HEAD', label: '🛡 Head of HR', role: 'VP of People Ops' },
  { type: 'ROLE', label: '👥 Specific Role', role: 'Finance Controller' },
];

export function ApprovalPolicyBuilder() {
  const [policies, setPolicies] = useState<ApprovalPolicy[]>(() => {
    return emsStorageAdapter.getItem<ApprovalPolicy[]>(
      STORAGE_KEY_APPROVAL_POLICIES,
      policiesFixture.policies as unknown as ApprovalPolicy[],
    );
  });

  const [activeDomainFilter, setActiveDomainFilter] = useState<string>('ALL');
  const [editingPolicy, setEditingPolicy] = useState<ApprovalPolicy | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleEditPolicy = (policy: ApprovalPolicy) => {
    setEditingPolicy({
      ...policy,
      steps: policy.steps.map((step) => ({ ...step })),
    });
    setShowAdvancedSettings(false);
  };

  const handleSavePolicy = () => {
    if (!editingPolicy) return;
    const updated = policies.map((p) => (p.id === editingPolicy.id ? editingPolicy : p));
    setPolicies(updated);
    emsStorageAdapter.setItem(STORAGE_KEY_APPROVAL_POLICIES, updated);
    setEditingPolicy(null);
    showToast(`Approval policy "${editingPolicy.name}" updated.`);
  };

  const handleAddStep = () => {
    if (!editingPolicy) return;
    const nextStepNum = editingPolicy.steps.length + 1;
    const newStep: ApprovalStep = {
      stepNumber: nextStepNum,
      name: `Level ${nextStepNum} Review`,
      approverType: 'HR_HEAD',
      targetRole: 'HR Head',
      targetUserId: null,
      targetUserName: null,
      required: true,
      autoEscalateHours: 48,
    };
    setEditingPolicy({
      ...editingPolicy,
      steps: [...editingPolicy.steps, newStep],
    });
  };

  const handleRemoveStep = (index: number) => {
    if (!editingPolicy || editingPolicy.steps.length <= 1) return;
    const filtered = editingPolicy.steps.filter((_, idx) => idx !== index);
    const renumbered = filtered.map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
    setEditingPolicy({ ...editingPolicy, steps: renumbered });
  };

  const filteredPolicies =
    activeDomainFilter === 'ALL'
      ? policies
      : policies.filter((p) => p.domain === activeDomainFilter);

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-md shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Domain Filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          variant={activeDomainFilter === 'ALL' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveDomainFilter('ALL')}
          className="text-xs"
        >
          All Domains ({policies.length})
        </Button>
        {DOMAINS_LIST.map((d) => (
          <Button
            key={d.id}
            variant={activeDomainFilter === d.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveDomainFilter(d.id)}
            className="text-xs"
          >
            {d.label}
          </Button>
        ))}
      </div>

      {/* Clean Policies Table */}
      <Card>
        <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs font-bold">
                Configured Approval Routing Policies
              </CardTitle>
              <span
                title="Resolution Priority: Employee Override ↓ Role Rule ↓ Department Rule ↓ Organization Default"
                className="text-slate-400 text-xs cursor-help"
              >
                ⓘ
              </span>
            </div>
            <CardDescription className="mt-0.5">
              Defines multi-level approval hierarchies, routing conditions, and escalation SLAs.
            </CardDescription>
          </div>
          <Badge variant="secondary">{filteredPolicies.length} policies</Badge>
        </CardHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Domain</TableHead>
              <TableHead>Scope / Precedence</TableHead>
              <TableHead>Policy Name</TableHead>
              <TableHead>Approval Route</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPolicies.map((policy) => (
              <TableRow key={policy.id}>
                <TableCell className="px-4">
                  <Badge variant="sky">{policy.domain.replace('_', ' ')}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      policy.precedenceLevel === 'ORGANIZATION_DEFAULT'
                        ? 'purple'
                        : policy.precedenceLevel === 'ROLE_RULE'
                          ? 'sky'
                          : 'warning'
                    }
                  >
                    {policy.precedenceLevel.replace('_', ' ')}
                  </Badge>
                  {policy.targetRole && (
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {policy.targetRole}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-bold text-slate-900 dark:text-white">{policy.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{policy.code}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-xs">
                    {policy.steps.map((s, idx) => (
                      <React.Fragment key={idx}>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {s.targetRole ||
                            (s.approverType === 'MANAGER' ? 'Reporting Manager' : 'Admin')}
                        </span>
                        {idx < policy.steps.length - 1 && <span className="text-slate-400">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">
                  {policy.steps[0]?.autoEscalateHours || 48}h
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditPolicy(policy)}
                    className="text-xs"
                  >
                    ⚙ Configure
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Focused Policy Configuration Modal */}
      {editingPolicy && (
        <Dialog open={Boolean(editingPolicy)} onOpenChange={() => setEditingPolicy(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge variant="sky">{editingPolicy.domain.replace('_', ' ')}</Badge>
                <DialogTitle className="text-base font-bold">
                  Configure Approval Workflow
                </DialogTitle>
              </div>
              <DialogDescription>{editingPolicy.name}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              {/* Who Needs Approval? */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Who does this approval rule apply to?</Label>
                  <span
                    title="Employee Override ↓ Role Rule ↓ Department Rule ↓ Organization Default"
                    className="text-slate-400 text-[11px] cursor-help"
                  >
                    Priority resolution ⓘ
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PRECEDENCE_LEVELS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setEditingPolicy({ ...editingPolicy, precedenceLevel: opt.value })
                      }
                      className={`p-2 rounded border text-xs font-semibold text-center cursor-pointer transition-all ${
                        editingPolicy.precedenceLevel === opt.value
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-2xs'
                          : 'bg-slate-50 dark:bg-card text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Approval Route Steps */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">
                    Approval Steps ({editingPolicy.steps.length})
                  </Label>
                  <Button size="sm" variant="outline" onClick={handleAddStep} className="text-xs">
                    + Add Step
                  </Button>
                </div>

                <div className="space-y-2">
                  {editingPolicy.steps.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">
                          Step {idx + 1}: {step.name}
                        </span>
                        {editingPolicy.steps.length > 1 && (
                          <Button
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            className="text-slate-400 hover:text-rose-600 text-xs cursor-pointer"
                          >
                            ✕
                          </Button>
                        )}
                      </div>

                      {/* Quick 1-Click Approver Presets */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {APPROVER_PRESETS.map((preset) => (
                          <Button
                            key={preset.type}
                            type="button"
                            onClick={() => {
                              const updatedSteps = [...editingPolicy.steps];
                              const currentStep = updatedSteps[idx];
                              if (currentStep) {
                                updatedSteps[idx] = {
                                  stepNumber: currentStep.stepNumber,
                                  name: currentStep.name,
                                  approverType: preset.type,
                                  targetRole: preset.role,
                                  targetUserId: currentStep.targetUserId,
                                  targetUserName: currentStep.targetUserName,
                                  required: currentStep.required,
                                  autoEscalateHours: currentStep.autoEscalateHours,
                                };
                                setEditingPolicy({ ...editingPolicy, steps: updatedSteps });
                              }
                            }}
                            className={`p-1.5 text-[11px] rounded border font-medium cursor-pointer text-center truncate ${
                              step.approverType === preset.type
                                ? 'bg-slate-900 text-white font-bold border-slate-900 dark:bg-white dark:text-slate-900'
                                : 'bg-white dark:bg-card text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {preset.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Progressive Disclosure: Advanced Workflow Settings */}
              <div className="pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="text-xs text-slate-800 dark:text-slate-200 hover:text-slate-900 flex items-center gap-1 cursor-pointer font-medium p-0"
                >
                  <span>{showAdvancedSettings ? '▼' : '▶'}</span>
                  <span>Advanced Workflow Settings (SLA, Auto-Escalation, Delegation)</span>
                </Button>

                {showAdvancedSettings && (
                  <div className="mt-2.5 p-3 bg-slate-50 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Auto-Escalate SLA (Hours)</Label>
                        <Input
                          type="number"
                          value={editingPolicy.steps[0]?.autoEscalateHours || 48}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const updatedSteps = editingPolicy.steps.map((s) => ({
                              ...s,
                              autoEscalateHours: val,
                            }));
                            setEditingPolicy({ ...editingPolicy, steps: updatedSteps });
                          }}
                          className="font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px]">Fallback Approver</Label>
                        <Select defaultValue="ADMIN">
                          <option value="ADMIN">Tenant Administrator</option>
                          <option value="HR_OPS">HR Operations Lead</option>
                          <option value="AUTO_APPROVE">Auto-Approve after SLA</option>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPolicy(null)}>
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleSavePolicy}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-xs"
              >
                Save Policy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
