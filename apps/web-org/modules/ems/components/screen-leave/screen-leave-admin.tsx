'use client';

import { Button, Checkbox, Input, RadioGroup, RadioGroupItem, Textarea } from '@smarteam/ui';

import React, { useState } from 'react';
import { DatePicker, Select } from '@smarteam/ui';
import leavePoliciesFixture from '../../data/fixtures/leave-policies.json';
import { useLeave } from '../../hooks/use-leave';
import { useAuth } from '../../hooks/use-auth';
import type { LeaveApplicationItem } from '../../types/leave.types';

interface HolidayItem {
  id: string;
  name: string;
  date: string;
  type: 'MANDATORY' | 'RESTRICTED' | 'COMPANY_OPTIONAL';
  dayOfWeek: string;
  scope?: string;
}

interface HolidayTemplate {
  id: string;
  name: string;
  code: string;
  description: string;
  applicableBranch: string;
  isDefault: boolean;
  holidays: HolidayItem[];
}

const INITIAL_HOLIDAY_TEMPLATES: HolidayTemplate[] = [
  {
    id: 'ht-national',
    name: 'India National Statutory Holidays (2026)',
    code: 'IN-NAT-2026',
    description: 'Mandatory national public holidays and major statutory festival closures.',
    applicableBranch: 'All Locations (India)',
    isDefault: true,
    holidays: [
      {
        id: 'h-1',
        name: 'Republic Day',
        date: '2026-01-26',
        type: 'MANDATORY',
        dayOfWeek: 'Monday',
      },
      {
        id: 'h-2',
        name: 'Independence Day',
        date: '2026-08-15',
        type: 'MANDATORY',
        dayOfWeek: 'Saturday',
      },
      {
        id: 'h-3',
        name: 'Mahatma Gandhi Jayanti',
        date: '2026-10-02',
        type: 'MANDATORY',
        dayOfWeek: 'Friday',
      },
      {
        id: 'h-4',
        name: 'Diwali / Deepavali',
        date: '2026-11-08',
        type: 'MANDATORY',
        dayOfWeek: 'Sunday',
      },
      {
        id: 'h-5',
        name: 'Eid-ul-Fitr',
        date: '2026-03-20',
        type: 'MANDATORY',
        dayOfWeek: 'Friday',
      },
      {
        id: 'h-6',
        name: 'Christmas Day',
        date: '2026-12-25',
        type: 'MANDATORY',
        dayOfWeek: 'Friday',
      },
    ],
  },
  {
    id: 'ht-ka',
    name: 'Karnataka Regional State Holidays (Bengaluru HQ)',
    code: 'KA-HQ-2026',
    description: 'State statutory holidays for Karnataka state labor department compliance.',
    applicableBranch: 'HQ – Bengaluru',
    isDefault: false,
    holidays: [
      {
        id: 'h-11',
        name: 'Ugadi (Kannada New Year)',
        date: '2026-03-19',
        type: 'MANDATORY',
        dayOfWeek: 'Thursday',
      },
      {
        id: 'h-12',
        name: 'Kannada Rajyotsava',
        date: '2026-11-01',
        type: 'MANDATORY',
        dayOfWeek: 'Sunday',
      },
      {
        id: 'h-13',
        name: 'Ayudha Puja / Vijayadashami',
        date: '2026-10-20',
        type: 'MANDATORY',
        dayOfWeek: 'Tuesday',
      },
    ],
  },
  {
    id: 'ht-mh',
    name: 'Maharashtra State Holidays (Mumbai Branch)',
    code: 'MH-MUM-2026',
    description: 'Statutory gazetted holidays for Mumbai commercial establishment.',
    applicableBranch: 'Mumbai Office',
    isDefault: false,
    holidays: [
      {
        id: 'h-21',
        name: 'Maharashtra Day',
        date: '2026-05-01',
        type: 'MANDATORY',
        dayOfWeek: 'Friday',
      },
      {
        id: 'h-22',
        name: 'Ganesh Chaturthi',
        date: '2026-09-14',
        type: 'MANDATORY',
        dayOfWeek: 'Monday',
      },
      {
        id: 'h-23',
        name: 'Gudi Padwa',
        date: '2026-03-19',
        type: 'MANDATORY',
        dayOfWeek: 'Thursday',
      },
    ],
  },
  {
    id: 'ht-restricted',
    name: 'Optional & Floating Holidays (Select 2 per Year)',
    code: 'OPT-FLOAT-2026',
    description: 'Employee elective floating holidays for cultural and personal observances.',
    applicableBranch: 'All Locations',
    isDefault: false,
    holidays: [
      {
        id: 'h-31',
        name: 'Maha Shivaratri',
        date: '2026-02-15',
        type: 'RESTRICTED',
        dayOfWeek: 'Sunday',
      },
      { id: 'h-32', name: 'Holi', date: '2026-03-04', type: 'RESTRICTED', dayOfWeek: 'Wednesday' },
      {
        id: 'h-33',
        name: 'Janmashtami',
        date: '2026-09-04',
        type: 'RESTRICTED',
        dayOfWeek: 'Friday',
      },
      {
        id: 'h-34',
        name: 'Guru Nanak Jayanti',
        date: '2026-11-24',
        type: 'RESTRICTED',
        dayOfWeek: 'Tuesday',
      },
    ],
  },
];

export function ScreenLeaveAdmin() {
  const { applications, approveLeave, rejectLeave } = useLeave();
  const { canApprove } = useAuth();
  const [activeTab, setActiveTab] = useState<'POLICIES' | 'HOLIDAYS' | 'REQUESTS'>('POLICIES');
  const [policies, setPolicies] = useState(leavePoliciesFixture);
  const [holidayTemplates, setHolidayTemplates] =
    useState<HolidayTemplate[]>(INITIAL_HOLIDAY_TEMPLATES);
  const [selectedTemplate, setSelectedTemplate] = useState<HolidayTemplate>(
    INITIAL_HOLIDAY_TEMPLATES[0]!,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateHolidayModalOpen, setIsCreateHolidayModalOpen] = useState(false);

  // Enhanced New Holiday form state
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('2026-05-01');
  const [newHolidayType, setNewHolidayType] = useState<
    'MANDATORY' | 'RESTRICTED' | 'COMPANY_OPTIONAL'
  >('MANDATORY');
  const [newHolidayScope, setNewHolidayScope] = useState<'ALL_LOCATIONS' | 'SPECIFIC_BRANCHES'>(
    'ALL_LOCATIONS',
  );
  const [selectedBranches, setSelectedBranches] = useState<string[]>([
    'HQ – Bengaluru',
    'Mumbai Office',
  ]);
  const [formErrors, setFormErrors] = useState<{ name?: string; date?: string }>({});

  // Date preview helper (e.g. "Friday, 01 May 2026")
  const formatLongDayText = (isoDate: string) => {
    try {
      const [year, month, day] = isoDate.split('-').map(Number);
      if (!year || !month || !day) return '';
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  // Form state for creating a new leave policy
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newPaid, setNewPaid] = useState(true);
  const [newAccrualType, setNewAccrualType] = useState('FIXED_ANNUAL');
  const [newAnnualAllowance, setNewAnnualAllowance] = useState(12);
  const [newCarryoverLimit, setNewCarryoverLimit] = useState(5);
  const [newDescription, setNewDescription] = useState('');

  const handleCreatePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || !newName) return;

    const newPolicy = {
      id: `lt-${Date.now()}`,
      code: newCode.toUpperCase(),
      name: newName,
      paid: newPaid,
      accrualType: newAccrualType,
      annualAllowance: Number(newAnnualAllowance),
      monthlyAccrual: newAccrualType === 'MONTHLY' ? +(newAnnualAllowance / 12).toFixed(2) : 0,
      carryoverLimit: Number(newCarryoverLimit),
      requiresAttachment: false,
      isActive: true,
      description: newDescription || 'Standard organizational leave policy.',
      branchAssignments: [
        { branchId: 'branch-hq', branchName: 'HQ – Bengaluru' },
        { branchId: 'branch-mum', branchName: 'Mumbai Office' },
      ],
    };

    setPolicies([newPolicy, ...policies]);
    setIsCreateModalOpen(false);
    setNewCode('');
    setNewName('');
    setNewDescription('');
  };

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { name?: string; date?: string } = {};

    if (!newHolidayName.trim()) {
      errors.name = 'Please enter a holiday name.';
    }
    if (!newHolidayDate) {
      errors.date = 'Please select a valid holiday date.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const dateObj = new Date(newHolidayDate);
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

    const newH: HolidayItem = {
      id: `h-${Date.now()}`,
      name: newHolidayName.trim(),
      date: newHolidayDate,
      type: newHolidayType,
      dayOfWeek,
      scope: newHolidayScope === 'ALL_LOCATIONS' ? 'All Locations' : selectedBranches.join(', '),
    };

    const updatedTemplate: HolidayTemplate = {
      ...selectedTemplate,
      holidays: [...selectedTemplate.holidays, newH],
    };

    const nextTemplates = holidayTemplates.map((t) =>
      t.id === selectedTemplate.id ? updatedTemplate : t,
    );
    setHolidayTemplates(nextTemplates);
    setSelectedTemplate(updatedTemplate);
    setIsCreateHolidayModalOpen(false);
    setNewHolidayName('');
    setFormErrors({});
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header with Title and Tabs */}
      <div className="bg-white rounded-[6px] border border-slate-200/90 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
              Admin Governance
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">
              Leave Policies & Holiday Templates
            </span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 mt-1">Leave & Time Off Administration</h1>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-[6px] border border-slate-200 shrink-0 overflow-x-auto no-scrollbar">
          <Button
            onClick={() => setActiveTab('POLICIES')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'POLICIES'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Leave Policies ({policies.length})
          </Button>
          <Button
            onClick={() => setActiveTab('HOLIDAYS')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'HOLIDAYS'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Holiday Templates ({holidayTemplates.length})
          </Button>
          <Button
            onClick={() => setActiveTab('REQUESTS')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'REQUESTS'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Leave Requests ({applications.length})
          </Button>
        </div>
      </div>

      {/* Tab 1: Leave Policies Management */}
      {activeTab === 'POLICIES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Configure statutory and custom leave schemes, annual allocations, and branch
              entitlements.
            </p>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-[5px] transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Create Leave Policy</span>
            </Button>
          </div>

          <div className="bg-white rounded-[6px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="py-2.5 px-4">Code & Name</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Accrual Frequency</th>
                  <th className="py-2.5 px-3">Annual Allowance</th>
                  <th className="py-2.5 px-3">Carryover Limit</th>
                  <th className="py-2.5 px-3">Branch Assignments</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {policies.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded border border-sky-200">
                          {p.code}
                        </span>
                        <span className="font-bold text-slate-900">{p.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                        {p.description}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          p.paid
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {p.paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700">
                      {p.accrualType === 'FIXED_ANNUAL'
                        ? 'Fixed Annual'
                        : p.accrualType === 'MONTHLY'
                          ? 'Monthly Accrual'
                          : 'None'}
                    </td>
                    <td className="py-3 px-3 font-bold font-mono text-slate-900">
                      {p.annualAllowance} Days
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">{p.carryoverLimit} Days</td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {p.branchAssignments.map((b) => (
                          <span
                            key={b.branchId}
                            className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                          >
                            {b.branchName}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Holiday Templates & Regional Calendars */}
      {activeTab === 'HOLIDAYS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Manage statutory public holidays, regional state calendars (Bengaluru HQ, Mumbai,
              Delhi), and optional floating lists.
            </p>
            <Button
              onClick={() => setIsCreateHolidayModalOpen(true)}
              className="px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-[5px] transition-colors shadow-xs cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <span>+</span>
              <span>Add Holiday to Template</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Template Selector Column */}
            <div className="lg:col-span-4 space-y-2.5">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Holiday Templates ({holidayTemplates.length})
              </div>
              <div className="space-y-2">
                {holidayTemplates.map((t) => {
                  const isSelected = selectedTemplate.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTemplate(t)}
                      className={`p-3.5 rounded-[6px] border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-sky-50/80 border-sky-400 ring-1 ring-sky-300 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900">{t.name}</span>
                        {t.isDefault && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                        {t.description}
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-mono">{t.applicableBranch}</span>
                        <span className="font-bold text-slate-700">
                          {t.holidays.length} Holidays
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Template Holidays List */}
            <div className="lg:col-span-8 space-y-3">
              <div className="bg-white rounded-[6px] border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">{selectedTemplate.name}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {selectedTemplate.applicableBranch} · {selectedTemplate.code}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded border border-sky-200">
                    {selectedTemplate.holidays.length} Listed Dates
                  </span>
                </div>

                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/60 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                      <th className="py-2.5 px-4">Holiday Name</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Day of Week</th>
                      <th className="py-2.5 px-3">Classification</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedTemplate.holidays.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-800">{h.name}</td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700 font-bold">
                          {h.date}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{h.dayOfWeek}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                              h.type === 'MANDATORY'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-purple-50 text-purple-700 border-purple-200'
                            }`}
                          >
                            {h.type}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="text-[10px] font-bold text-emerald-700">ACTIVE</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Organization Requests & Action-Level Approvals */}
      {activeTab === 'REQUESTS' && (
        <div className="bg-white rounded-[6px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                <th className="py-2.5 px-4">Leave Scheme</th>
                <th className="py-2.5 px-3">Code</th>
                <th className="py-2.5 px-3">Dates</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">Reason</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Approval Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400 text-xs">
                    No leave requests submitted in the organization.
                  </td>
                </tr>
              ) : (
                applications.map((req: LeaveApplicationItem) => {
                  const isAuthorized = canApprove('LEAVE');
                  return (
                    <tr key={req.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900">{req.leaveTypeName}</span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[10px] text-slate-500">{req.code}</td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-700 font-semibold">
                        {req.startDate} to {req.endDate}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-800">{req.dayCount} Day(s)</td>
                      <td className="py-3 px-3 text-slate-600 max-w-xs truncate">{req.reason}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                            req.status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : req.status === 'REJECTED'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {req.status === 'PENDING' ? (
                          isAuthorized ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                onClick={() => approveLeave(req.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded transition-colors shadow-2xs cursor-pointer"
                              >
                                Approve
                              </Button>
                              <Button
                                onClick={() => rejectLeave(req.id)}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded transition-colors shadow-2xs cursor-pointer"
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              Pending Manager Review
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono">Completed</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Leave Policy Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Create New Leave Policy</h2>
              <Button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </Button>
            </div>

            <form onSubmit={handleCreatePolicy} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[10px] mb-1">
                    Policy Code
                  </label>
                  <Input
                    type="text"
                    required
                    placeholder="e.g. ML, BER"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[10px] mb-1">
                    Policy Name
                  </label>
                  <Input
                    type="text"
                    required
                    placeholder="e.g. Maternity Leave"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[10px] mb-1">
                    Accrual Frequency
                  </label>
                  <Select
                    value={newAccrualType}
                    onChange={(e) => setNewAccrualType(e.target.value)}
                  >
                    <option value="FIXED_ANNUAL">Fixed Annual Grant</option>
                    <option value="MONTHLY">Monthly Accrual</option>
                    <option value="NONE">None (Manual)</option>
                  </Select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[10px] mb-1">
                    Annual Allowance (Days)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="180"
                    value={newAnnualAllowance}
                    onChange={(e) => setNewAnnualAllowance(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[10px] mb-1">
                    Carryover Limit (Days)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="60"
                    value={newCarryoverLimit}
                    onChange={(e) => setNewCarryoverLimit(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 font-mono"
                  />
                </div>
                <div className="flex items-center pt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={newPaid}
                      onCheckedChange={setNewPaid}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="font-bold text-slate-700">Paid Leave Benefit</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase text-[10px] mb-1">
                  Policy Description
                </label>
                <Textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Terms, eligibility criteria, and documentation guidelines..."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-500">
                This policy will automatically be assigned to{' '}
                <span className="font-bold text-slate-700">HQ – Bengaluru</span> and{' '}
                <span className="font-bold text-slate-700">Mumbai Office</span>.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 text-slate-700 font-bold rounded hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="px-4 py-1.5 bg-primary hover:bg-primary/90 text-white font-bold rounded shadow-xs cursor-pointer"
                >
                  Save Policy
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Canonical Add Holiday Form Modal */}
      {isCreateHolidayModalOpen &&
        (() => {
          const duplicateHoliday = selectedTemplate.holidays.find((h) => h.date === newHolidayDate);
          const scopeSummaryText =
            newHolidayScope === 'ALL_LOCATIONS'
              ? selectedTemplate.applicableBranch
              : selectedBranches.length > 0
                ? selectedBranches.join(', ')
                : 'no branches selected';

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
              <div className="w-full max-w-lg bg-white dark:bg-[#1E293B] rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
                {/* Modal Header */}
                <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Add holiday
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                      {selectedTemplate.name} · 2026
                    </p>
                  </div>
                  <Button
                    onClick={() => setIsCreateHolidayModalOpen(false)}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    ✕
                  </Button>
                </div>

                {/* Modal Body */}
                <form
                  onSubmit={handleAddHoliday}
                  className="p-5 space-y-4 text-xs overflow-y-auto flex-1"
                >
                  {/* Holiday Name */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] mb-1">
                      Holiday Name <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Karnataka Rajyotsava / Good Friday"
                      value={newHolidayName}
                      onChange={(e) => {
                        setNewHolidayName(e.target.value);
                        if (formErrors.name) setFormErrors({ ...formErrors, name: undefined });
                      }}
                      className={`w-full px-3 py-2 bg-white dark:bg-slate-900 border rounded text-xs focus:ring-1 focus:ring-sky-500 font-medium ${
                        formErrors.name
                          ? 'border-rose-500 bg-rose-50/20 text-rose-900 dark:text-rose-200'
                          : 'border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white'
                      }`}
                    />
                    {formErrors.name && (
                      <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1 block">
                        {formErrors.name}
                      </span>
                    )}
                  </div>

                  {/* Duplicate Holiday Warning Banner */}
                  {duplicateHoliday && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
                      <span className="text-base leading-none">⚠️</span>
                      <div className="text-[11px]">
                        <span className="font-bold block">
                          Holiday already scheduled on this date
                        </span>
                        <span className="text-amber-800 dark:text-amber-300 mt-0.5 block">
                          <strong>{duplicateHoliday.name}</strong> is already registered for{' '}
                          {formatLongDayText(newHolidayDate)}. You can edit the existing holiday or
                          select a different date.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Date & Classification 2-Column Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] mb-1">
                        Holiday Date <span className="text-rose-500">*</span>
                      </label>
                      <DatePicker
                        value={newHolidayDate}
                        onChange={(d) => {
                          setNewHolidayDate(d);
                          if (formErrors.date) setFormErrors({ ...formErrors, date: undefined });
                        }}
                        placeholder="Select Holiday Date"
                      />
                      <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300 mt-1 block">
                        {formatLongDayText(newHolidayDate)}
                      </span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] mb-1">
                        Holiday Classification
                      </label>
                      <Select
                        value={newHolidayType}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (
                            value === 'MANDATORY' ||
                            value === 'RESTRICTED' ||
                            value === 'COMPANY_OPTIONAL'
                          ) {
                            setNewHolidayType(value);
                          }
                        }}
                      >
                        <option value="MANDATORY">Mandatory statutory holiday</option>
                        <option value="RESTRICTED">Restricted / optional holiday</option>
                        <option value="COMPANY_OPTIONAL">Company declared holiday</option>
                      </Select>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block leading-tight">
                        {newHolidayType === 'MANDATORY' &&
                          'Full office closure. All employees receive paid statutory credit.'}
                        {newHolidayType === 'RESTRICTED' &&
                          'Floating cultural holiday. Claimed from annual optional allowance.'}
                        {newHolidayType === 'COMPANY_OPTIONAL' &&
                          'Discretionary organization-wide holiday declared by management.'}
                      </span>
                    </div>
                  </div>

                  {/* Applicability Scope */}
                  <div className="space-y-2">
                    <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px]">
                      Applicability Scope
                    </label>
                    <RadioGroup
                      value={newHolidayScope}
                      onValueChange={(value) => {
                        if (value === 'ALL_LOCATIONS' || value === 'SPECIFIC_BRANCHES') {
                          setNewHolidayScope(value);
                        }
                      }}
                      className="grid grid-cols-2 gap-2 text-xs"
                    >
                      <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded cursor-pointer">
                        <RadioGroupItem value="ALL_LOCATIONS" aria-label="Template Default" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Template Default
                        </span>
                      </label>
                      <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded cursor-pointer">
                        <RadioGroupItem value="SPECIFIC_BRANCHES" aria-label="Specific Branches" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Specific Branches
                        </span>
                      </label>
                    </RadioGroup>

                    {newHolidayScope === 'SPECIFIC_BRANCHES' && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[
                          'HQ – Bengaluru',
                          'Mumbai Office',
                          'Delhi Branch',
                          'Hyderabad Tech Center',
                        ].map((branch) => {
                          const isChecked = selectedBranches.includes(branch);
                          return (
                            <Button
                              key={branch}
                              type="button"
                              onClick={() => {
                                setSelectedBranches(
                                  isChecked
                                    ? selectedBranches.filter((b) => b !== branch)
                                    : [...selectedBranches, branch],
                                );
                              }}
                              className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {isChecked ? '✓ ' : '+ '} {branch}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Dynamic Informative Callout */}
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] text-slate-600 dark:text-slate-400">
                    This holiday will automatically be applied to branch rosters mapped to{' '}
                    <strong className="text-slate-900 dark:text-white font-semibold">
                      {scopeSummaryText}
                    </strong>
                    .
                  </div>

                  {/* Modal Footer Actions */}
                  <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <Button
                      type="button"
                      onClick={() => {
                        setIsCreateHolidayModalOpen(false);
                        setFormErrors({});
                      }}
                      className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-[6px] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="px-4 py-1.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-[6px] shadow-xs cursor-pointer"
                    >
                      Save Holiday
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
