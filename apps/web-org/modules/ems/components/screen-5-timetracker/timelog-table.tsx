import React from 'react';
import type { ColumnDef } from '@smarteam/ui';
import { StandardDataTable } from '@smarteam/ui';
import type { TimeLogItem } from '../../types/timelog.types';

interface TimeLogTableProps {
  logs: TimeLogItem[];
  onSelectLog?: (log: TimeLogItem) => void;
}

export function TimeLogTable({ logs, onSelectLog }: TimeLogTableProps) {
  const columns: ColumnDef<TimeLogItem>[] = [
    {
      id: 'jobName',
      header: 'Job Name',
      accessorKey: 'jobName',
      sortable: true,
      pinned: 'left',
      cell: (log) => <span className="font-semibold text-slate-900">{log.jobName}</span>,
    },
    {
      id: 'projectName',
      header: 'Project Name',
      accessorKey: 'projectName',
      sortable: true,
      filterable: true,
      cell: (log) => <span className="font-medium text-slate-700">{log.projectName}</span>,
    },
    {
      id: 'duration',
      header: 'Duration',
      accessorKey: 'duration',
      sortable: true,
      cell: (log) => <span className="font-mono font-bold text-slate-800">{log.duration}</span>,
    },
    {
      id: 'isBillable',
      header: 'Billable Status',
      accessorKey: (log) => (log.isBillable ? 'Billable' : 'Non-billable'),
      filterable: true,
      filterOptions: [
        { label: 'Billable', value: 'Billable' },
        { label: 'Non-billable', value: 'Non-billable' },
      ],
      cell: (log) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
            log.isBillable
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
              : 'bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          {log.isBillable ? 'Billable' : 'Non-billable'}
        </span>
      ),
    },
  ];

  return (
    <StandardDataTable
      data={logs}
      columns={columns}
      keyExtractor={(log) => log.id}
      searchPlaceholder="Search timelogs by job or project..."
      onRowClick={onSelectLog}
      initialRowsPerPage={10}
    />
  );
}
