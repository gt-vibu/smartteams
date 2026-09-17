'use client';

import React, { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { Users, CheckCircle2 } from 'lucide-react';
import { useEmployees, useTeams } from '../../hooks/use-workforce';
import type { CompensationState } from '../../hooks/use-compensation';
import { payrollRepository } from '../../repositories/payroll.repository';
import { useSession } from '../../hooks/auth-context';

interface RoleSalaryAllotmentDialogProps {
  compensation: CompensationState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoleSalaryAllotmentDialog({
  compensation,
  open,
  onOpenChange,
}: RoleSalaryAllotmentDialogProps) {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;

  const employeesResource = useEmployees();
  const teamsResource = useTeams();

  const allEmployees = employeesResource.data ?? [];
  const allTeams = teamsResource.data ?? [];

  const [selectedTarget, setSelectedTarget] = useState<string>('ALL');
  const [excludedEmpIds, setExcludedEmpIds] = useState<Set<string>>(new Set());
  const [grossSalary, setGrossSalary] = useState<string>('');
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');
  const [pfEnabled, setPfEnabled] = useState<boolean>(true);
  const [ptEnabled, setPtEnabled] = useState<boolean>(true);
  const [esiEnabled, setEsiEnabled] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter employees matching target selection (ALL, team_id, or employment type)
  const targetEmployees = useMemo(() => {
    if (selectedTarget === 'ALL') {
      return allEmployees.filter((e) => e.status === 'ACTIVE');
    }

    if (selectedTarget.startsWith('TEAM:')) {
      const teamId = selectedTarget.slice(5);
      const team = allTeams.find((t) => t.id === teamId);
      const memberEmpIds = new Set(team?.members?.map((m) => m.employeeId) ?? []);
      return allEmployees.filter((e) => e.status === 'ACTIVE' && memberEmpIds.has(e.id));
    }

    if (selectedTarget.startsWith('TYPE:')) {
      const type = selectedTarget.slice(5);
      return allEmployees.filter((e) => e.status === 'ACTIVE' && e.employmentType === type);
    }

    return allEmployees.filter((e) => e.status === 'ACTIVE');
  }, [allEmployees, allTeams, selectedTarget]);

  // Selected employees are target employees not in excluded set
  const selectedEmployees = useMemo(
    () => targetEmployees.filter((e) => !excludedEmpIds.has(e.id)),
    [targetEmployees, excludedEmpIds],
  );

  const handleTargetChange = (val: string) => {
    setSelectedTarget(val);
    setExcludedEmpIds(new Set());
  };

  // Auto-suggest ESI when gross salary changes
  const handleGrossChange = (val: string) => {
    setGrossSalary(val);
    const num = Number(val);
    if (Number.isFinite(num) && num > 0) {
      setEsiEnabled(num <= 21000);
    }
  };

  const toggleSelectAll = () => {
    if (excludedEmpIds.size === 0) {
      // Exclude all
      setExcludedEmpIds(new Set(targetEmployees.map((e) => e.id)));
    } else {
      // Include all
      setExcludedEmpIds(new Set());
    }
  };

  const toggleEmp = (id: string) => {
    setExcludedEmpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const numericGross = Number(grossSalary);
    if (!Number.isFinite(numericGross) || numericGross <= 0) {
      setErrorMsg('Please enter a valid monthly gross salary.');
      return;
    }

    if (!effectiveFrom) {
      setErrorMsg('Please select an effective from date.');
      return;
    }

    if (selectedEmployees.length === 0) {
      setErrorMsg('Please select at least one employee.');
      return;
    }

    if (!organizationId) {
      setErrorMsg('Organization not found in session.');
      return;
    }

    setSubmitting(true);
    const empList = selectedEmployees.map((e) => e.id);

    try {
      let count = 0;
      for (const empId of empList) {
        setProgressMsg(`Saving salary for employee ${count + 1} of ${empList.length}...`);
        await payrollRepository.saveSalaryProfile(organizationId, {
          employeeId: empId,
          grossSalary: numericGross,
          payType: 'SALARY',
          payFrequency: 'MONTHLY',
          overtimeMultiplier: 1.5,
          effectiveFrom,
          payrollEnabled: true,
          salarySlipMode: 'ENABLED',
          pfEnabled,
          esiEnabled,
          ptEnabled,
        });
        count++;
      }

      await compensation.refetch();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'An error occurred during bulk salary allotment.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
      setProgressMsg('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogTitle className="flex items-center gap-2 text-base font-bold">
          <Users className="h-5 w-5 text-primary" />
          Role-Wise Salary Allotment
        </DialogTitle>
        <p className="text-xs text-muted-foreground -mt-2">
          Allot salary structure and statutory configurations across all employees in a specific
          role or group.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Target Group Selector */}
          <div>
            <Label className="mb-1 block text-xs font-semibold">Target Group / Role</Label>
            <SelectMenu value={selectedTarget} onValueChange={handleTargetChange}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a role or team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Active Employees ({allEmployees.length})</SelectItem>
                {allTeams.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                      Teams / Departments
                    </div>
                    {allTeams.map((team) => (
                      <SelectItem key={team.id} value={`TEAM:${team.id}`}>
                        Team: {team.name} ({team.members?.length ?? 0} members)
                      </SelectItem>
                    ))}
                  </>
                )}
                <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                  Employment Type
                </div>
                <SelectItem value="TYPE:FULL_TIME">Full Time</SelectItem>
                <SelectItem value="TYPE:PART_TIME">Part Time</SelectItem>
                <SelectItem value="TYPE:CONTRACT">Contract</SelectItem>
                <SelectItem value="TYPE:INTERN">Intern</SelectItem>
              </SelectContent>
            </SelectMenu>
          </div>

          {/* Matching Employees Checklist */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs font-semibold">
                Employees to Allot ({selectedEmployees.length} of {targetEmployees.length} selected)
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2"
                onClick={toggleSelectAll}
              >
                {excludedEmpIds.size === 0 ? 'Deselect all' : 'Select all'}
              </Button>
            </div>

            <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-card p-2 space-y-1.5">
              {targetEmployees.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  No active employees found in this group.
                </p>
              ) : (
                targetEmployees.map((emp) => {
                  const isChecked = !excludedEmpIds.has(emp.id);
                  return (
                    <div
                      key={emp.id}
                      onClick={() => toggleEmp(emp.id)}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-muted/40 cursor-pointer text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Checkbox checked={isChecked} onCheckedChange={() => toggleEmp(emp.id)} />
                        <span className="font-medium text-foreground">
                          {emp.firstName} {emp.lastName}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          ({emp.employeeNumber})
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {emp.employmentType}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Salary Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <Label className="mb-1 block text-xs font-semibold" htmlFor="role-gross">
                Monthly Gross Salary (₹)
              </Label>
              <Input
                id="role-gross"
                type="number"
                inputMode="decimal"
                placeholder="e.g. 50000"
                value={grossSalary}
                onChange={(e) => handleGrossChange(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs font-semibold" htmlFor="role-effective">
                Effective From
              </Label>
              <DatePicker
                id="role-effective"
                value={effectiveFrom}
                onChange={setEffectiveFrom}
                disabled={submitting}
              />
            </div>
          </div>

          {/* Statutory Switches */}
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">
              Statutory Withholdings & Benefits
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPfEnabled(!pfEnabled)}
                className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-colors ${
                  pfEnabled
                    ? 'bg-primary/10 border-primary text-primary font-semibold'
                    : 'bg-muted/30 border-border text-muted-foreground'
                }`}
              >
                <CheckCircle2
                  className={`h-3.5 w-3.5 ${pfEnabled ? 'text-primary' : 'text-muted-foreground/40'}`}
                />
                PF {pfEnabled ? 'On' : 'Off'}
              </button>

              <button
                type="button"
                onClick={() => setPtEnabled(!ptEnabled)}
                className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-colors ${
                  ptEnabled
                    ? 'bg-primary/10 border-primary text-primary font-semibold'
                    : 'bg-muted/30 border-border text-muted-foreground'
                }`}
              >
                <CheckCircle2
                  className={`h-3.5 w-3.5 ${ptEnabled ? 'text-primary' : 'text-muted-foreground/40'}`}
                />
                PT {ptEnabled ? 'On' : 'Off'}
              </button>

              <button
                type="button"
                onClick={() => setEsiEnabled(!esiEnabled)}
                className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-colors ${
                  esiEnabled
                    ? 'bg-primary/10 border-primary text-primary font-semibold'
                    : 'bg-muted/30 border-border text-muted-foreground'
                }`}
              >
                <CheckCircle2
                  className={`h-3.5 w-3.5 ${esiEnabled ? 'text-primary' : 'text-muted-foreground/40'}`}
                />
                ESI {esiEnabled ? 'On' : 'Off'}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              PF (Provident Fund) and PT (Professional Tax) are standard for all roles. ESI
              auto-enables for gross ≤ ₹21,000.
            </p>
          </div>

          {errorMsg && (
            <p className="text-xs text-destructive font-medium" role="alert">
              {errorMsg}
            </p>
          )}

          {progressMsg && (
            <p className="text-xs text-primary font-medium flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-primary animate-ping" />
              {progressMsg}
            </p>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                submitting || selectedEmployees.length === 0 || !grossSalary || !effectiveFrom
              }
            >
              {submitting
                ? 'Allotting...'
                : `Allot Salary to ${selectedEmployees.length} Employees`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
