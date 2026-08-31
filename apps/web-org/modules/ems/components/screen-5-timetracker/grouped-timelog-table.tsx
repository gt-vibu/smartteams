import React, { useState } from 'react';
import { Checkbox, Table, TableBody, TableCell, TableRow } from '@smarteam/ui';
import type { DateGroupedTimeLogs } from '../../types/timelog.types';

interface GroupedTimeLogTableProps {
  groupedLogs: DateGroupedTimeLogs[];
  onSelectEntry?: (entryId: string) => void;
}

export function GroupedTimeLogTable({ groupedLogs, onSelectEntry }: GroupedTimeLogTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleGroup = (group: DateGroupedTimeLogs) => {
    const next = new Set(selectedIds);
    const allSelected = group.entries.every((e) => next.has(e.id));
    if (allSelected) {
      group.entries.forEach((e) => next.delete(e.id));
    } else {
      group.entries.forEach((e) => next.add(e.id));
    }
    setSelectedIds(next);
  };

  return (
    <div className="bg-white dark:bg-card rounded-lg border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden w-full overflow-x-auto relative">
      <Table className="min-w-[650px] sm:min-w-[850px]">
        <TableBody>
          {groupedLogs.map((group) => {
            const allGroupSelected = group.entries.every((e) => selectedIds.has(e.id));

            return (
              <React.Fragment key={group.date}>
                {/* Date Group Header Row */}
                <TableRow className="bg-slate-50/90 border-t border-b border-slate-200/90 text-slate-800">
                  <TableCell className="py-2.5 px-4 w-10">
                    <Checkbox
                      checked={allGroupSelected}
                      aria-label={`Select all time logs for ${group.date}`}
                      onCheckedChange={() => toggleGroup(group)}
                      className="h-3.5 w-3.5"
                    />
                  </TableCell>
                  <TableCell colSpan={3} className="py-2.5 px-3 font-bold text-slate-800 text-xs">
                    {group.date}
                  </TableCell>
                  <TableCell
                    className="py-2.5 px-4 text-right font-mono font-bold text-emerald-600 text-xs"
                    colSpan={2}
                  >
                    {group.totalDayHours}
                  </TableCell>
                </TableRow>

                {/* Sub-Rows under Date */}
                {group.entries.map((entry) => {
                  const isChecked = selectedIds.has(entry.id);

                  return (
                    <TableRow
                      key={entry.id}
                      onClick={() => onSelectEntry && onSelectEntry(entry.id)}
                      className={`border-b border-slate-100 hover:bg-slate-50/60 transition-colors cursor-pointer group ${
                        isChecked ? 'bg-sky-50/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <TableCell
                        className="py-3 px-4 w-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(entry.id);
                        }}
                      >
                        <Checkbox
                          checked={isChecked}
                          aria-label={`Select ${entry.jobName}`}
                          onCheckedChange={() => toggleSelect(entry.id)}
                          className="h-3.5 w-3.5"
                        />
                      </TableCell>

                      {/* Job Name · Project Name */}
                      <TableCell className="py-3 px-3 max-w-[280px]">
                        <div className="font-semibold text-slate-800 group-hover:text-primary transition-colors truncate">
                          {entry.jobName}{' '}
                          <span className="text-slate-400 font-normal">· {entry.projectName}</span>
                        </div>
                      </TableCell>

                      {/* Description */}
                      <TableCell className="py-3 px-3 text-slate-600 max-w-[360px]">
                        <div className="line-clamp-2 text-[11px] leading-relaxed">
                          {entry.description}
                        </div>
                      </TableCell>

                      {/* Billable Status */}
                      <TableCell className="py-3 px-3 w-24 text-slate-600 font-medium">
                        {entry.isBillable ? 'Billable' : 'Non-billable'}
                      </TableCell>

                      {/* Duration */}
                      <TableCell className="py-3 px-4 w-20 font-mono font-semibold text-slate-800 text-right">
                        {entry.duration}
                      </TableCell>

                      {/* Location Pin Icon */}
                      <TableCell className="py-3 px-3 w-10 text-center text-slate-400 hover:text-slate-600">
                        <svg
                          className="h-3.5 w-3.5 inline-block"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
