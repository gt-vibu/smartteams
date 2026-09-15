'use client';

import React from 'react';
import { ProfileState } from '../profile/profile-state';
import { useEmployee } from '../../hooks/use-employee';

export function OverviewProfileTab() {
  const { employee, loading, error, forbidden, hasEmployeeRecord, refetch } = useEmployee();

  const state = ProfileState({ loading, error, forbidden, hasEmployeeRecord, onRetry: refetch });
  if (state || !employee) return state;

  return (
    <div className="bg-card rounded-[6px] border border-border/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/40 flex items-center justify-between">
        <h3 className="!text-xs !font-bold !text-foreground !m-0">
          Employee Information & Hierarchy
        </h3>
        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
          Active Employee
        </span>
      </div>

      <div className="p-5 space-y-6">
        {/* Basic Work Info */}
        <div>
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">
            Primary Work Details
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-muted/40 p-3 rounded border border-border/70">
              <span className="text-muted-foreground font-medium block">Employee ID</span>
              <span className="font-semibold text-foreground mt-0.5 block">
                {employee.employeeNumber}
              </span>
            </div>
            <div className="bg-muted/40 p-3 rounded border border-border/70">
              <span className="text-muted-foreground font-medium block">Full Name</span>
              <span className="font-semibold text-foreground mt-0.5 block">
                {employee.firstName} {employee.lastName}
              </span>
            </div>
            <div className="bg-muted/40 p-3 rounded border border-border/70">
              <span className="text-muted-foreground font-medium block">Job Title</span>
              <span className="font-semibold text-foreground mt-0.5 block">
                {employee.jobTitle}
              </span>
            </div>
            <div className="bg-muted/40 p-3 rounded border border-border/70">
              <span className="text-muted-foreground font-medium block">Department</span>
              <span className="font-semibold text-foreground mt-0.5 block">
                {employee.department}
              </span>
            </div>
            <div className="bg-muted/40 p-3 rounded border border-border/70">
              <span className="text-muted-foreground font-medium block">Work Email</span>
              <span className="font-semibold text-foreground mt-0.5 block">
                {employee.workEmail}
              </span>
            </div>
            <div className="bg-muted/40 p-3 rounded border border-border/70">
              <span className="text-muted-foreground font-medium block">Contact Phone</span>
              <span className="font-semibold text-foreground mt-0.5 block">
                {employee.phone || '+91 98765 43210'}
              </span>
            </div>
            <div className="bg-muted/40 p-3 rounded border border-border/70">
              <span className="text-muted-foreground font-medium block">Work Location</span>
              <span className="font-semibold text-foreground mt-0.5 block">
                {employee.location || 'Bangalore, India'}
              </span>
            </div>
            <div className="bg-muted/40 p-3 rounded border border-border/70">
              <span className="text-muted-foreground font-medium block">Date of Joining</span>
              <span className="font-semibold text-foreground mt-0.5 block">
                {employee.joinedDate || '15-Jan-2024'}
              </span>
            </div>
          </div>
        </div>

        {/* Manager & Hierarchy */}
        <div>
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">
            Reporting Structure
          </h4>
          {employee.manager ? (
            <div className="bg-muted/40 border border-border rounded p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center">
                  {employee.manager.firstName.charAt(0)}
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground">
                    {employee.manager.employeeNumber} · {employee.manager.firstName}{' '}
                    {employee.manager.lastName}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-medium">
                    Reporting Manager · {employee.manager.jobTitle || 'Engineering Manager'}
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Online
              </span>
            </div>
          ) : (
            <div className="bg-muted/40 border border-border rounded p-3.5 text-xs text-muted-foreground italic">
              Executive / Head of Organization (No direct reporting manager assigned).
            </div>
          )}
        </div>

        {/* Department Peers */}
        <div>
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">
            Department Members ({employee.departmentMembers.length})
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {employee.departmentMembers.map((member) => (
              <div
                key={member.id}
                className="bg-muted/40 border border-border/80 rounded p-3 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-full bg-slate-700 text-white font-bold text-[11px] flex items-center justify-center">
                    {member.firstName.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">
                      {member.firstName} {member.lastName}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {member.employeeNumber} · {member.jobTitle || 'Engineer'}
                    </div>
                  </div>
                </div>
                <span className="h-2 w-2 rounded-full bg-emerald-500" title="Online" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
