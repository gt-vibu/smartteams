'use client';

import { Button, Checkbox, Input } from '@smarteam/ui';

import React, { useState, useEffect } from 'react';
import { DatePicker, Select } from '@smarteam/ui';

export interface EmployeePayStructure {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  annualCtc: number;
  monthlyGross: number;
  basicMonthly: number;
  hraMonthly: number;
  specialMonthly: number;
  epfEnrolled: boolean;
  esiEnrolled: boolean;
  ptEnrolled: boolean;
  gratuityEnrolled: boolean;
  effectiveDate: string;
  schemeTemplate: 'STANDARD_50_20_30' | 'LEADERSHIP_40_30_30' | 'CUSTOM';
}

const DEMO_EMPLOYEES = [
  {
    id: 'user-064',
    number: 'EMP-064',
    name: 'Mithun Gowda H',
    role: 'Software Engineer',
    dept: 'Engineering & Technology',
  },
  {
    id: 'user-002',
    number: 'EMP-002',
    name: 'Priya Sharma',
    role: 'Senior UI/UX Designer',
    dept: 'Product & Design',
  },
  {
    id: 'user-003',
    number: 'EMP-003',
    name: 'Rahul Verma',
    role: 'React Developer',
    dept: 'Engineering & Technology',
  },
  {
    id: 'user-004',
    number: 'EMP-004',
    name: 'Sneha Patil',
    role: 'Backend Engineer',
    dept: 'Engineering & Technology',
  },
  {
    id: 'user-009',
    number: 'EMP-009',
    name: 'Ranjith Kumar C',
    role: 'Engineering Lead',
    dept: 'Engineering & Technology',
  },
  {
    id: 'user-016',
    number: 'EMP-016',
    name: 'Shailesh Thipse',
    role: 'Senior Frontend Engineer',
    dept: 'Engineering & Technology',
  },
  {
    id: 'user-018',
    number: 'EMP-018',
    name: 'Tejasri Bonala',
    role: 'QA Analyst',
    dept: 'Quality Assurance',
  },
  {
    id: 'user-040',
    number: 'EMP-040',
    name: 'Vikramaditya Sengupta',
    role: 'VP of People Operations',
    dept: 'Human Resources',
  },
];

import { formatINR } from '../../utils/formatters';

interface AssignPayStructureModalProps {
  isOpen: boolean;
  initialStructure?: EmployeePayStructure | null;
  onClose: () => void;
  onAssign: (structure: EmployeePayStructure) => void;
}

export function AssignPayStructureModal({
  isOpen,
  initialStructure,
  onClose,
  onAssign,
}: AssignPayStructureModalProps) {
  const [selectedEmpId, setSelectedEmpId] = useState(DEMO_EMPLOYEES[0]!.id);
  const [annualCtc, setAnnualCtc] = useState(1500000);
  const [schemeTemplate, setSchemeTemplate] = useState<
    'STANDARD_50_20_30' | 'LEADERSHIP_40_30_30' | 'CUSTOM'
  >('STANDARD_50_20_30');
  const [basicRatio, setBasicRatio] = useState(50);
  const [hraRatio, setHraRatio] = useState(20);
  const [specialRatio, setSpecialRatio] = useState(30);
  const [epfEnrolled, setEpfEnrolled] = useState(true);
  const [esiEnrolled, setEsiEnrolled] = useState(false);
  const [ptEnrolled, setPtEnrolled] = useState(true);
  const [gratuityEnrolled, setGratuityEnrolled] = useState(true);
  const [effectiveDate, setEffectiveDate] = useState('2026-09-01');

  useEffect(() => {
    if (initialStructure) {
      setSelectedEmpId(initialStructure.employeeId);
      setAnnualCtc(initialStructure.annualCtc);
      setSchemeTemplate(initialStructure.schemeTemplate);
      setEpfEnrolled(initialStructure.epfEnrolled);
      setEsiEnrolled(initialStructure.esiEnrolled);
      setPtEnrolled(initialStructure.ptEnrolled);
      setGratuityEnrolled(initialStructure.gratuityEnrolled);
      setEffectiveDate(initialStructure.effectiveDate || '2026-09-01');
    }
  }, [initialStructure]);

  if (!isOpen) return null;

  const monthlyGross = Math.round(annualCtc / 12);
  const basicMonthly = Math.round((monthlyGross * basicRatio) / 100);
  const hraMonthly = Math.round((monthlyGross * hraRatio) / 100);
  const specialMonthly = Math.max(0, monthlyGross - basicMonthly - hraMonthly);

  const handleSchemeChange = (scheme: 'STANDARD_50_20_30' | 'LEADERSHIP_40_30_30' | 'CUSTOM') => {
    setSchemeTemplate(scheme);
    if (scheme === 'STANDARD_50_20_30') {
      setBasicRatio(50);
      setHraRatio(20);
      setSpecialRatio(30);
    } else if (scheme === 'LEADERSHIP_40_30_30') {
      setBasicRatio(40);
      setHraRatio(30);
      setSpecialRatio(30);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = DEMO_EMPLOYEES.find((e) => e.id === selectedEmpId) || DEMO_EMPLOYEES[0]!;

    const newStructure: EmployeePayStructure = {
      id: initialStructure ? initialStructure.id : `ps-${Date.now()}`,
      employeeId: emp.id,
      employeeNumber: emp.number,
      employeeName: emp.name,
      jobTitle: emp.role,
      department: emp.dept,
      annualCtc,
      monthlyGross,
      basicMonthly,
      hraMonthly,
      specialMonthly,
      epfEnrolled,
      esiEnrolled,
      ptEnrolled,
      gratuityEnrolled,
      effectiveDate,
      schemeTemplate,
    };

    onAssign(newStructure);
  };

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amt);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-[#1E293B] rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {initialStructure
                ? 'Edit Employee Compensation Structure'
                : 'Assign & Configure Employee Pay Structure'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Set annual CTC, custom component splits, and statutory rules.
            </p>
          </div>
          <Button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            ✕
          </Button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Employee Picker */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] mb-1">
              Select Employee
            </label>
            <Select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              disabled={!!initialStructure}
            >
              {DEMO_EMPLOYEES.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.number} · {emp.name} ({emp.role} - {emp.dept})
                </option>
              ))}
            </Select>
          </div>

          {/* Annual CTC & Effective Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] mb-1">
                Annual CTC (INR)
              </label>
              <Input
                type="number"
                min="100000"
                step="10000"
                value={annualCtc}
                onChange={(e) => setAnnualCtc(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono font-bold text-slate-900 dark:text-white"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Monthly Gross:{' '}
                <strong className="text-sky-600">{formatCurrency(monthlyGross)}</strong>
              </span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] mb-1">
                Effective Date
              </label>
              <DatePicker
                value={effectiveDate}
                onChange={(d) => setEffectiveDate(d)}
                placeholder="Effective Date"
              />
            </div>
          </div>

          {/* Scheme Template Preset Selector */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] mb-1.5">
              Compensation Scheme Template
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <Button
                type="button"
                onClick={() => handleSchemeChange('STANDARD_50_20_30')}
                className={`p-2.5 rounded border text-left cursor-pointer transition-all ${
                  schemeTemplate === 'STANDARD_50_20_30'
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-300 ring-1 ring-sky-500/30'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="font-bold text-[11px]">Standard FTE</div>
                <div className="text-[10px] text-slate-500">50% Basic · 20% HRA · 30% Special</div>
              </Button>

              <Button
                type="button"
                onClick={() => handleSchemeChange('LEADERSHIP_40_30_30')}
                className={`p-2.5 rounded border text-left cursor-pointer transition-all ${
                  schemeTemplate === 'LEADERSHIP_40_30_30'
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-300 ring-1 ring-sky-500/30'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="font-bold text-[11px]">Executive Package</div>
                <div className="text-[10px] text-slate-500">40% Basic · 30% HRA · 30% Special</div>
              </Button>

              <Button
                type="button"
                onClick={() => handleSchemeChange('CUSTOM')}
                className={`p-2.5 rounded border text-left cursor-pointer transition-all ${
                  schemeTemplate === 'CUSTOM'
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-300 ring-1 ring-sky-500/30'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="font-bold text-[11px]">Custom Split</div>
                <div className="text-[10px] text-slate-500">Adjust percentages freely</div>
              </Button>
            </div>
          </div>

          {/* Component Breakdowns */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-[6px] border border-slate-200 dark:border-slate-700 space-y-3">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase text-[10px] tracking-wider">
              Component Calculations (Monthly / Annual)
            </h4>

            <div className="space-y-2">
              {/* Basic */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Basic Salary ({basicRatio}%)
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Statutory retirement base
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {formatINR(basicMonthly)}/mo
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {formatINR(basicMonthly * 12)}/yr
                  </span>
                </div>
              </div>

              {/* HRA */}
              <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    House Rent Allowance (HRA) ({hraRatio}%)
                  </span>
                  <span className="text-[10px] text-slate-400 block">Exempt u/s 10(13A)</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {formatINR(hraMonthly)}/mo
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {formatINR(hraMonthly * 12)}/yr
                  </span>
                </div>
              </div>

              {/* Special */}
              <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Special Allowance (Balancing: {specialRatio}%)
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Flexible monthly component
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {formatINR(specialMonthly)}/mo
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {formatINR(specialMonthly * 12)}/yr
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Statutory Enrollments */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] mb-2">
              Statutory Compliance Rules
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded cursor-pointer">
                <Checkbox
                  checked={epfEnrolled}
                  onCheckedChange={setEpfEnrolled}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    EPF (12% Basic)
                  </span>
                  <span className="text-[10px] text-slate-400">Provident fund deduction</span>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded cursor-pointer">
                <Checkbox
                  checked={esiEnrolled}
                  onCheckedChange={setEsiEnrolled}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    ESI (0.75% Gross)
                  </span>
                  <span className="text-[10px] text-slate-400">State healthcare scheme</span>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded cursor-pointer">
                <Checkbox
                  checked={ptEnrolled}
                  onCheckedChange={setPtEnrolled}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    Professional Tax (PT)
                  </span>
                  <span className="text-[10px] text-slate-400">State monthly slab (₹200)</span>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded cursor-pointer">
                <Checkbox
                  checked={gratuityEnrolled}
                  onCheckedChange={setGratuityEnrolled}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    Gratuity Accrual
                  </span>
                  <span className="text-[10px] text-slate-400">4.81% Basic employer accrual</span>
                </div>
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded shadow-xs cursor-pointer"
            >
              {initialStructure ? 'Update Pay Structure' : 'Assign Pay Structure'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
