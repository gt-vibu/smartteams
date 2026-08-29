'use client';

import React from 'react';
import { DepartmentData } from '../../types/organization.types';

interface OrgDepartmentTreeTabProps {
  departments: DepartmentData[];
}

export function OrgDepartmentTreeTab({ departments }: OrgDepartmentTreeTabProps) {
  return (
    <div className="bg-white rounded-[6px] border border-slate-200 shadow-xs overflow-hidden flex flex-col min-h-[550px]">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-slate-900">Department & Functional Topology</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Hierarchical distribution of business divisions and functional squads.
          </p>
        </div>
        <span className="text-xs font-bold text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded shadow-2xs">
          {departments.length} Operating Departments
        </span>
      </div>

      {/* Topology Canvas */}
      <div className="flex-1 p-8 overflow-auto bg-[#F8FAFC] flex flex-col items-center">
        {/* Top Root: Smarteam Organization Node */}
        <div className="w-72 p-4 rounded-[8px] bg-slate-900 text-white shadow-lg border border-slate-800 flex items-center gap-3">
          <div className="h-10 w-10 rounded-[6px] bg-[#0284C7] flex items-center justify-center font-bold text-lg shadow-sm">
            🏢
          </div>
          <div>
            <h3 className="text-xs font-bold leading-tight">Smarteam Technologies</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Enterprise Global Entity</p>
          </div>
        </div>

        {/* Connector Line down from Root */}
        <div className="w-0.5 h-8 bg-slate-300" />

        {/* Horizontal Distributor */}
        <div className="flex items-start justify-center relative pt-4 flex-wrap gap-4 max-w-5xl">
          {departments.map((dept) => (
            <div key={dept.id} className="flex flex-col items-center w-64">
              {/* Department Card Node */}
              <div className="w-full bg-white rounded-[6px] border border-slate-200/90 p-4 shadow-xs hover:shadow-md hover:border-sky-300 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-[9px] font-bold bg-sky-100 text-[#0284C7] px-1.5 py-0.2 rounded uppercase">
                        {dept.code}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 mt-1.5 line-clamp-1">
                        {dept.name}
                      </h4>
                    </div>
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {dept.memberCount}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-3">
                    {dept.description}
                  </p>
                </div>

                {/* Department Head */}
                {dept.headEmployeeName && (
                  <div className="border-t border-slate-100 pt-2.5 flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {dept.headEmployeeAvatar || 'DH'}
                    </div>
                    <div className="truncate">
                      <div className="text-[9px] font-bold text-slate-400 uppercase">Lead</div>
                      <div className="text-[11px] font-semibold text-slate-800 truncate">
                        {dept.headEmployeeName}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
