import React from 'react';
import { TimeLogItem } from '../../types/timelog.types';

interface TimeLogTableProps {
  logs: TimeLogItem[];
  onSelectLog?: (log: TimeLogItem) => void;
}

export function TimeLogTable({ logs, onSelectLog }: TimeLogTableProps) {
  return (
    <div className="bg-white rounded-[6px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse min-w-[750px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-700 font-semibold">
            <th className="py-3 px-4">Job Name</th>
            <th className="py-3 px-4">Project Name</th>
            <th className="py-3 px-3">Duration</th>
            <th className="py-3 px-3">Billable Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-800">
          {logs.map((log) => (
            <tr
              key={log.id}
              onClick={() => onSelectLog && onSelectLog(log)}
              className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
            >
              <td className="py-3 px-4 font-semibold text-slate-900">{log.jobName}</td>
              <td className="py-3 px-4 font-medium text-slate-700">{log.projectName}</td>
              <td className="py-3 px-3 font-mono font-bold text-slate-800">{log.duration}</td>
              <td className="py-3 px-3 font-medium text-slate-600">{log.isBillable ? 'Billable' : 'Non-billable'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
