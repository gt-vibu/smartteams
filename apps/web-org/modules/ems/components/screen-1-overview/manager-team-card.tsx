import { Button } from '@smarteam/ui';
import React from 'react';
import type { EmployeeProfile } from '../../types/employee.types';

interface ManagerTeamCardProps {
  employee: EmployeeProfile;
}

export function ManagerTeamCard({ employee }: ManagerTeamCardProps) {
  return (
    <div className="space-y-4">
      {/* Reporting Manager Card */}
      {employee.manager && (
        <div className="bg-card rounded-[6px] border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="text-xs font-semibold text-muted-foreground mb-2.5">
            Reporting Manager
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-slate-200 text-foreground font-bold text-xs flex items-center justify-center shrink-0">
              {employee.manager.firstName[0]}
            </div>
            <div className="truncate">
              <div className="text-xs font-semibold text-foreground truncate">
                {employee.manager.employeeNumber} - {employee.manager.firstName}{' '}
                {employee.manager.lastName}
              </div>
              <div className="text-[11px] font-semibold text-emerald-700">
                {employee.manager.isOnline ? 'In' : 'Out'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Department Members Card */}
      <div className="bg-card rounded-[6px] border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="text-xs font-semibold text-muted-foreground mb-2.5">Department Members</div>
        <div className="space-y-3">
          {employee.departmentMembers.map((member) => (
            <div key={member.id} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-slate-200 text-foreground font-bold text-xs flex items-center justify-center shrink-0">
                {member.firstName[0]}
              </div>
              <div className="truncate">
                <div className="text-xs font-semibold text-foreground truncate">
                  {member.employeeNumber} - {member.firstName} {member.lastName}
                </div>
                <div className="text-[11px] font-semibold text-emerald-700">
                  {member.isOnline ? 'In' : 'Out'}
                </div>
              </div>
            </div>
          ))}

          <div className="pt-1">
            <Button className="h-auto p-0 text-xs font-semibold" variant="link">
              +8 More
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
