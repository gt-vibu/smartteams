'use client';

import React from 'react';
import { ApprovalPolicyData } from '../../types/organization.types';

interface OrgPoliciesTabProps {
  approvalPolicies: ApprovalPolicyData[];
}

export function OrgPoliciesTab({ approvalPolicies }: OrgPoliciesTabProps) {
  const domainBadges: Record<string, { label: string; cls: string }> = {
    LEAVE_REQUEST: { label: 'Time Off & Leave', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
    TIMESHEET: {
      label: 'Timesheet & Logs',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    ATTENDANCE_CORRECTION: {
      label: 'Attendance Regularization',
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    PAYROLL_RUN: {
      label: 'Payroll & Compensation',
      cls: 'bg-rose-50 text-rose-700 border-rose-200',
    },
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-[6px] border border-slate-200 p-4 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-slate-900">
            Company Approval Policies & Workflow Rules
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Configured organizational governance rules for requests, timesheets, regularizations,
            and payroll.
          </p>
        </div>
        <span className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1 rounded">
          {approvalPolicies.length} Active Governance Policies
        </span>
      </div>

      {/* Policies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {approvalPolicies.map((policy) => {
          const badge = domainBadges[policy.domain] || {
            label: policy.domain,
            cls: 'bg-slate-100 text-slate-700 border-slate-200',
          };

          return (
            <div
              key={policy.id}
              className="bg-white rounded-[6px] border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded border ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    <h3 className="text-xs font-bold text-slate-900 mt-1.5">{policy.name}</h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 font-semibold">
                    {policy.code}
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
                  {policy.description}
                </p>

                {/* Step-by-Step Approver Flow */}
                <div className="space-y-2 mb-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Approval Workflow Pipeline
                  </div>
                  <div className="space-y-1.5">
                    {policy.steps.map((step) => (
                      <div
                        key={step.stepNumber}
                        className="flex items-center gap-2.5 p-2 bg-slate-50 rounded-[4px] border border-slate-100 text-xs"
                      >
                        <span className="h-5 w-5 rounded-full bg-[#0284C7] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {step.stepNumber}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800 truncate">
                            {step.approverTitle}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Type: {step.approverType} {step.required && '· Required Sign-off'}
                          </div>
                        </div>
                        {step.required && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            Enforced
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Policy Footer */}
              <div className="border-t border-slate-100 pt-3 mt-3 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Default System Policy
                </span>
                <span className="text-[10px] text-slate-400">Status: Active</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
