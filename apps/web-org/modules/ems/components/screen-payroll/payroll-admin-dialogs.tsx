'use client';

import React from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Label,
  Select,
} from '@smarteam/ui';
import type { EditablePayrollLineItem } from './edit-payroll-line-item-modal';
import { EditPayrollLineItemModal } from './edit-payroll-line-item-modal';
import type { PayslipData } from './payslip-document-modal';
import { PayslipDocumentModal } from './payslip-document-modal';
import type { PayrollRun } from './screen-payroll-admin';

export interface PayrollAdminDialogsProps {
  isStartRunModalOpen: boolean;
  setIsStartRunModalOpen: (open: boolean) => void;
  handleStartNewRun: (event: React.FormEvent) => void;
  newPeriodMonth: string;
  setNewPeriodMonth: (month: string) => void;
  newPeriodYear: string;
  setNewPeriodYear: (year: string) => void;
  editingLineItem: EditablePayrollLineItem | null;
  setEditingLineItem: (item: EditablePayrollLineItem | null) => void;
  handleSaveLineItem: (item: EditablePayrollLineItem) => void;
  isVerificationModalOpen: boolean;
  setIsVerificationModalOpen: (open: boolean) => void;
  selectedRun: PayrollRun | null;
  activePayslipModalData: PayslipData | null;
  setActivePayslipModalData: (data: PayslipData | null) => void;
}

export function PayrollAdminDialogs({
  isStartRunModalOpen,
  setIsStartRunModalOpen,
  handleStartNewRun,
  newPeriodMonth,
  setNewPeriodMonth,
  newPeriodYear,
  setNewPeriodYear,
  editingLineItem,
  setEditingLineItem,
  handleSaveLineItem,
  isVerificationModalOpen,
  setIsVerificationModalOpen,
  selectedRun,
  activePayslipModalData,
  setActivePayslipModalData,
}: PayrollAdminDialogsProps) {
  return (
    <>
      {/* Start New Payroll Run Dialog */}
      {isStartRunModalOpen && (
        <Dialog open={isStartRunModalOpen} onOpenChange={setIsStartRunModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Initialize New Payroll Run</DialogTitle>
              <DialogDescription>
                Select the pay period to aggregate biometric attendance, approved leaves, and role
                salary templates.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleStartNewRun} className="space-y-3.5 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Month</Label>
                  <Select
                    value={newPeriodMonth}
                    onChange={(e) => setNewPeriodMonth(e.target.value)}
                  >
                    <option value="07">July</option>
                    <option value="08">August</option>
                    <option value="09">September</option>
                    <option value="10">October</option>
                    <option value="11">November</option>
                    <option value="12">December</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Year</Label>
                  <Select value={newPeriodYear} onChange={(e) => setNewPeriodYear(e.target.value)}>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                  </Select>
                </div>
              </div>

              <div className="p-3 bg-sky-50 dark:bg-card rounded-lg border border-sky-200 dark:border-sky-800/60 text-xs text-sky-900 dark:text-sky-300">
                <span>
                  The system will automatically run pre-run verification on 42 active workforce
                  members.
                </span>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsStartRunModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Draft Run</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Line Item Adjust Modal */}
      {editingLineItem && (
        <EditPayrollLineItemModal
          isOpen={Boolean(editingLineItem)}
          onClose={() => setEditingLineItem(null)}
          item={editingLineItem}
          onSave={handleSaveLineItem}
        />
      )}

      {/* Verification Checklist Inspection Dialog */}
      {isVerificationModalOpen && (
        <Dialog open={isVerificationModalOpen} onOpenChange={setIsVerificationModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <DialogTitle>Pre-Flight Payroll Integrity Checklist</DialogTitle>
              </div>
              <DialogDescription>
                Automated compliance and data reconciliation checks for cycle {selectedRun?.code}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400">
                  <span className="font-bold">✓</span>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Attendance & Timesheets Synchronized
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Biometric punch records and project timesheets reconciled for 24 staff.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400">
                  <span className="font-bold">✓</span>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Leave Balances & Loss of Pay (LOP)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      0 unpaid absence days detected across active departments.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400">
                  <span className="font-bold">✓</span>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Role Salary Formulas & Grade Structures
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Basic, HRA, and statutory ceilings resolved without formula errors.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 p-2 rounded border border-amber-200 dark:border-amber-900/40">
                  <span className="font-bold">⚠️</span>
                  <div>
                    <div className="font-semibold text-amber-900 dark:text-amber-300">
                      3 Staff Missing PAN (Non-blocking Warning)
                    </div>
                    <div className="text-[11px] text-amber-800 dark:text-amber-400">
                      Higher TDS rate (20%) under Section 206AA will apply if PAN is not submitted
                      before payout.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setIsVerificationModalOpen(false)} size="sm">
                Close Checklist
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {/* Official Real-World Payslip Modal */}
      {activePayslipModalData && (
        <PayslipDocumentModal
          isOpen={Boolean(activePayslipModalData)}
          onClose={() => setActivePayslipModalData(null)}
          payslip={activePayslipModalData}
        />
      )}
    </>
  );
}
