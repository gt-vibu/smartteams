'use client';

import { Button, Checkbox, Input } from '@smarteam/ui';

import React, { useState } from 'react';
import { DatePicker, Select } from '@smarteam/ui';
import type { CandidateRecord } from '../../types/onboarding.types';

interface OnboardWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (candidate: CandidateRecord) => void;
}

const DEPARTMENTS = [
  'Engineering & Technology',
  'Product & Design',
  'Marketing & Growth',
  'People & Operations',
  'Finance & Legal',
];

const BRANCHES = [
  { id: 'branch-hq', name: 'HQ – Bengaluru' },
  { id: 'branch-mum', name: 'Mumbai Office' },
  { id: 'branch-del', name: 'Delhi Office' },
];

const MANAGERS = [
  { id: 'user-009', name: 'Ranjith Kumar C', title: 'Engineering Manager' },
  { id: 'user-020', name: 'Kavita Joshi', title: 'Head of Product' },
  { id: 'user-040', name: 'Vikramaditya Sengupta', title: 'VP of People Ops' },
  { id: 'user-030', name: 'Pooja Agarwal', title: 'Marketing Lead' },
];

const TEAMS = [
  'Frontend Engineering',
  'Platform Core',
  'Product & Design',
  'Growth & Marketing',
  'QA & Release Engineering',
];

const PROJECTS = [
  'EMS v2',
  'Luxasia 2026',
  'Smarteam EMS Redesign',
  'Payroll Automation Q2',
  'Growth Experiments Q3',
];

const LAPTOP_OPTIONS = [
  'Apple MacBook Pro 16" M3 Max (36GB RAM, 1TB SSD)',
  'Apple MacBook Pro 14" M3 Pro (32GB RAM, 512GB SSD)',
  'Lenovo ThinkPad X1 Carbon Gen 12 (32GB RAM, 1TB SSD)',
  'Dell XPS 15 (i9 14th Gen, 32GB RAM, RTX 4060)',
];

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
const previousWizardStep = (step: WizardStep): WizardStep => Math.max(1, step - 1) as WizardStep;

const nextWizardStep = (step: WizardStep): WizardStep => Math.min(6, step + 1) as WizardStep;

export function OnboardWizardModal({ isOpen, onClose, onComplete }: OnboardWizardModalProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Form State
  // Step 1: Candidate Personal
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('Male');
  const [dob, setDob] = useState('1996-05-14');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // Step 2: Job & Org
  const [employeeNumber, setEmployeeNumber] = useState(
    `EMP-0${Math.floor(Math.random() * 20 + 75)}`,
  );
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]!);
  const [branchName, setBranchName] = useState(BRANCHES[0]!.name);
  const [employmentType, setEmploymentType] = useState<'FULL_TIME' | 'CONTRACT' | 'INTERN'>(
    'FULL_TIME',
  );
  const [manager, setManager] = useState(MANAGERS[0]!);
  const [shiftName, setShiftName] = useState('GEN - General Shift (10:00 AM - 6:00 PM)');
  const [joiningDate, setJoiningDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]!,
  );

  // Step 3: Team & Project
  const [assignedTeam, setAssignedTeam] = useState(TEAMS[0]!);
  const [assignedProject, setAssignedProject] = useState(PROJECTS[0]!);
  const [projectRole, setProjectRole] = useState('Senior Developer');
  const [allocation, setAllocation] = useState(100);

  // Step 4: Compensation
  const [annualCtc, setAnnualCtc] = useState('1800000');
  const [payFrequency, setPayFrequency] = useState('MONTHLY');
  const [currency, setCurrency] = useState('INR');

  // Step 5: IT Assets
  const [laptopModel, setLaptopModel] = useState(LAPTOP_OPTIONS[0]!);
  const [includeMonitor, setIncludeMonitor] = useState(true);
  const [includeAccessCard, setIncludeAccessCard] = useState(true);
  const [includeWelcomeKit, setIncludeWelcomeKit] = useState(true);

  if (!isOpen) return null;

  const calculatedWorkEmail =
    firstName && lastName
      ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@smarteam.cloud`
      : 'new.hire@smarteam.cloud';

  const ctcNum = Number(annualCtc) || 1800000;
  const basicSalary = Math.round(ctcNum * 0.5);
  const hraSalary = Math.round(ctcNum * 0.2);
  const specialAllowanceSalary = Math.round(ctcNum * 0.3);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newCandidate: CandidateRecord = {
      id: `cand-${Date.now()}`,
      candidateName: `${firstName} ${lastName}`.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      personalEmail: personalEmail.trim(),
      workEmail: calculatedWorkEmail,
      phone: phone.trim(),
      employeeNumber: employeeNumber.trim(),
      jobTitle: jobTitle.trim(),
      department,
      branchName,
      managerName: manager.name,
      managerEmployeeId: manager.id,
      joiningDate,
      employmentType,
      shiftName,
      stage: 'PRE_BOARDING',
      progressPercentage: 30,
      avatarInitials: `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase(),
      assignedTeamName: assignedTeam,
      assignedProjectName: assignedProject,
      allocationPercentage: allocation,
      compensation: {
        annualCtc: ctcNum,
        currency,
        payFrequency,
        basic: basicSalary,
        hra: hraSalary,
        specialAllowance: specialAllowanceSalary,
      },
      documents: [
        {
          id: `doc-${Date.now()}-1`,
          title: 'Government Photo ID (Aadhaar / Passport)',
          type: 'IDENTITY',
          fileName: `${firstName.toLowerCase()}_id_proof.pdf`,
          status: 'PENDING',
          submittedAt: new Date().toISOString().split('T')[0]!,
          verifiedAt: null,
          reviewerRemarks: null,
        },
        {
          id: `doc-${Date.now()}-2`,
          title: 'PAN Card (Tax Identification)',
          type: 'TAX',
          fileName: `${firstName.toLowerCase()}_pan.pdf`,
          status: 'PENDING',
          submittedAt: new Date().toISOString().split('T')[0]!,
          verifiedAt: null,
          reviewerRemarks: null,
        },
        {
          id: `doc-${Date.now()}-3`,
          title: 'Highest Educational Degree Certificate',
          type: 'EDUCATION',
          fileName: `${firstName.toLowerCase()}_degree.pdf`,
          status: 'PENDING',
          submittedAt: new Date().toISOString().split('T')[0]!,
          verifiedAt: null,
          reviewerRemarks: null,
        },
      ],
      checklist: [
        {
          id: `chk-${Date.now()}-1`,
          title: 'Sign Digital Offer Letter & IP Non-Disclosure Agreement',
          description: 'Legal agreement generated and sent to personal email.',
          stage: 'PRE_BOARDING',
          assignedRole: 'EMPLOYEE',
          isCompleted: true,
          dueDate: joiningDate,
          completedAt: new Date().toISOString().split('T')[0]!,
        },
        {
          id: `chk-${Date.now()}-2`,
          title: 'KYC Document & Bank Details Verification',
          description: 'HR Compliance check for statutory payroll enrollment.',
          stage: 'PRE_BOARDING',
          assignedRole: 'HR',
          isCompleted: false,
          dueDate: joiningDate,
          completedAt: null,
        },
        {
          id: `chk-${Date.now()}-3`,
          title: 'IT Hardware Laptop & Security Key Provisioning',
          description: `Configure ${laptopModel} with MDM encryption.`,
          stage: 'PRE_BOARDING',
          assignedRole: 'IT',
          isCompleted: false,
          dueDate: joiningDate,
          completedAt: null,
        },
        {
          id: `chk-${Date.now()}-4`,
          title: 'Day 1 Orientation & HR Welcome Induction',
          description: 'Meet People Ops lead for company policies and culture walkthrough.',
          stage: 'DAY_1',
          assignedRole: 'HR',
          isCompleted: false,
          dueDate: joiningDate,
          completedAt: null,
        },
        {
          id: `chk-${Date.now()}-5`,
          title: `Manager 1:1 with ${manager.name}`,
          description: `Project alignment for ${assignedProject} and team welcome in ${assignedTeam}.`,
          stage: 'WEEK_1',
          assignedRole: 'MANAGER',
          isCompleted: false,
          dueDate: joiningDate,
          completedAt: null,
        },
      ],
      assets: [
        {
          id: `ast-${Date.now()}-1`,
          assetType: 'LAPTOP',
          modelName: laptopModel,
          serialNumber: `SMAR-${laptopModel.slice(0, 3).toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`,
          status: 'ORDERED',
          trackingNumber: null,
          assignedAt: new Date().toISOString().split('T')[0]!,
        },
        ...(includeMonitor
          ? [
              {
                id: `ast-${Date.now()}-2`,
                assetType: 'MONITOR' as const,
                modelName: 'Dell UltraSharp 27" 4K USB-C Hub Monitor (U2723QE)',
                serialNumber: `MON-4K-${Math.floor(Math.random() * 9000 + 1000)}`,
                status: 'ASSIGNED' as const,
                trackingNumber: null,
                assignedAt: new Date().toISOString().split('T')[0]!,
              },
            ]
          : []),
        ...(includeAccessCard
          ? [
              {
                id: `ast-${Date.now()}-3`,
                assetType: 'ACCESS_CARD' as const,
                modelName: 'Smarteam RFID/NFC Office Keycard',
                serialNumber: `NFC-${employeeNumber}`,
                status: 'ASSIGNED' as const,
                trackingNumber: null,
                assignedAt: new Date().toISOString().split('T')[0]!,
              },
            ]
          : []),
      ],
      notes: `Onboarded into ${department} team under ${manager.name}. Allocated to ${assignedProject} (${allocation}%).`,
      createdAt: new Date().toISOString().split('T')[0]!,
    };

    onComplete(newCandidate);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-card rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden flex flex-col max-h-[94vh] min-w-0">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#12161E] flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded">
                HR Onboarding Wizard
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                Provision Employee & Assets
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-1 truncate">
              Onboard New Team Member
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        {/* Stepper Progress Indicator */}
        <div className="px-3 sm:px-6 py-2.5 bg-slate-100/70 dark:bg-[#10141B] border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {(
            [
              { num: 1, label: 'Candidate Profile' },
              { num: 2, label: 'Job & Role' },
              { num: 3, label: 'Team & Project' },
              { num: 4, label: 'Compensation' },
              { num: 5, label: 'Hardware & IT' },
              { num: 6, label: 'Review & Launch' },
            ] as Array<{ num: WizardStep; label: string }>
          ).map((s) => (
            <div
              key={s.num}
              onClick={() => {
                // allow clicking previous completed steps
                if (s.num < step) setStep(s.num);
              }}
              className={`flex items-center gap-1.5 shrink-0 cursor-pointer ${
                step === s.num
                  ? 'text-slate-900 dark:text-white font-bold'
                  : step > s.num
                    ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                    : 'text-slate-400'
              }`}
            >
              <div
                className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === s.num
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                    : step > s.num
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                }`}
              >
                {step > s.num ? '✓' : s.num}
              </div>
              <span className="text-xs whitespace-nowrap hidden sm:inline">{s.label}</span>
              {s.num < 6 && <span className="text-slate-300 dark:text-slate-700 mx-0.5">›</span>}
            </div>
          ))}
        </div>

        {/* Wizard Form Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5"
        >
          {/* ── STEP 1: Candidate Identity ── */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Step 1: Personal & Identity Information
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Enter candidate's legal details for statutory background checks and contract
                  generation.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="text"
                    required
                    placeholder="e.g. Siddharth"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-[5px] focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="text"
                    required
                    placeholder="e.g. Nambiar"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-[5px] focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Personal Email Address <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="email"
                    required
                    placeholder="siddharth.nambiar@gmail.com"
                    value={personalEmail}
                    onChange={(e) => setPersonalEmail(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-[5px] focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone / Mobile <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="tel"
                    required
                    placeholder="+91 98450 12345"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-[5px] focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Date of Birth
                  </label>
                  <DatePicker value={dob} onChange={(d) => setDob(d)} placeholder="Date of Birth" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                  <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-Binary">Non-Binary</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Emergency Contact Name
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Radhika Nambiar (Spouse)"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-[5px] focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Emergency Contact Number
                  </label>
                  <Input
                    type="tel"
                    placeholder="+91 99887 76655"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-[5px] focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Auto-generated work email preview badge */}
              <div className="bg-sky-50 border border-sky-200 rounded-[6px] p-3 flex items-center justify-between text-xs">
                <span className="text-slate-600">Company Work Email to be provisioned:</span>
                <span className="font-mono font-bold text-primary bg-white px-2 py-0.5 rounded border border-sky-100">
                  {calculatedWorkEmail}
                </span>
              </div>
            </div>
          )}

          {/* ── STEP 2: Job & Organization ── */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Step 2: Role, Department & Reporting Line
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Set position parameters, reporting structure, and location.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Employee ID / Code <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="text"
                    required
                    value={employeeNumber}
                    onChange={(e) => setEmployeeNumber(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-[5px] bg-slate-50 font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Designation / Job Title <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="text"
                    required
                    placeholder="e.g. Lead Frontend Architect"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-[5px] focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Department <span className="text-rose-500">*</span>
                  </label>
                  <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Primary Office Branch <span className="text-rose-500">*</span>
                  </label>
                  <Select value={branchName} onChange={(e) => setBranchName(e.target.value)}>
                    {BRANCHES.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Reporting Manager <span className="text-rose-500">*</span>
                  </label>
                  <Select
                    value={manager.id}
                    onChange={(e) => {
                      const found = MANAGERS.find((m) => m.id === e.target.value);
                      if (found) setManager(found);
                    }}
                  >
                    {MANAGERS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.title})
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Date of Joining <span className="text-rose-500">*</span>
                  </label>
                  <DatePicker
                    value={joiningDate}
                    onChange={(d) => setJoiningDate(d)}
                    placeholder="Date of Joining"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Employment Type
                  </label>
                  <Select
                    value={employmentType}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'FULL_TIME' || value === 'CONTRACT' || value === 'INTERN') {
                        setEmploymentType(value);
                      }
                    }}
                  >
                    <option value="FULL_TIME">Full-Time Permanent (FTE)</option>
                    <option value="CONTRACT">Contractor / Consultant</option>
                    <option value="INTERN">Graduate Intern</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Assigned Work Shift
                  </label>
                  <Input
                    type="text"
                    value={shiftName}
                    onChange={(e) => setShiftName(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-[5px] bg-slate-50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Team & Project ── */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Step 3: Initial Squad & Project Assignment
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Automatically map new hire into squad rosters and project allocation percentage.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Primary Team / Squad
                  </label>
                  <Select value={assignedTeam} onChange={(e) => setAssignedTeam(e.target.value)}>
                    {TEAMS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Initial Project Assignment
                  </label>
                  <Select
                    value={assignedProject}
                    onChange={(e) => setAssignedProject(e.target.value)}
                  >
                    {PROJECTS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Project Role
                  </label>
                  <Input
                    type="text"
                    value={projectRole}
                    onChange={(e) => setProjectRole(e.target.value)}
                    placeholder="e.g. Lead Engineer"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-[5px] focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Allocation Percentage:{' '}
                    <span className="text-primary font-mono font-bold">{allocation}%</span>
                  </label>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="10"
                    value={allocation}
                    onChange={(e) => setAllocation(Number(e.target.value))}
                    className="w-full accent-sky-600 mt-2 cursor-pointer"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-[6px] text-xs text-slate-600 space-y-1">
                <div className="font-bold text-slate-800">✓ Automatic Roster Sync</div>
                <p className="text-[11px]">
                  Once onboarded, this employee will appear automatically in the{' '}
                  <strong>{assignedTeam}</strong> squad view and <strong>{assignedProject}</strong>{' '}
                  active project allocation dashboard.
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 4: Compensation ── */}
          {step === 4 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Step 4: Compensation & Salary Structure
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Calculate annual CTC, pay components, and statutory PF/ESI eligibility.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Annual CTC (₹) <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="number"
                    required
                    min="300000"
                    step="50000"
                    value={annualCtc}
                    onChange={(e) => setAnnualCtc(e.target.value)}
                    className="w-full text-xs font-bold font-mono px-3 py-2 border border-slate-300 rounded-[5px] focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pay Frequency
                  </label>
                  <Select value={payFrequency} onChange={(e) => setPayFrequency(e.target.value)}>
                    <option value="MONTHLY">Monthly</option>
                    <option value="BI_WEEKLY">Bi-Weekly</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Currency</label>
                  <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="SGD">SGD (S$)</option>
                  </Select>
                </div>
              </div>

              {/* Pay Component Breakdown Card */}
              <div className="bg-slate-50 rounded-[6px] border border-slate-200 p-4 space-y-3">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Calculated Monthly Pay Breakdown (India Statutory)
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 bg-white rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">
                      Basic Pay (50%)
                    </div>
                    <div className="text-sm font-bold text-slate-800 mt-0.5">
                      ₹{Math.round(basicSalary / 12).toLocaleString('en-IN')}/mo
                    </div>
                  </div>
                  <div className="p-2.5 bg-white rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">
                      House Rent (HRA 20%)
                    </div>
                    <div className="text-sm font-bold text-slate-800 mt-0.5">
                      ₹{Math.round(hraSalary / 12).toLocaleString('en-IN')}/mo
                    </div>
                  </div>
                  <div className="p-2.5 bg-white rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">
                      Special Allowance (30%)
                    </div>
                    <div className="text-sm font-bold text-slate-800 mt-0.5">
                      ₹{Math.round(specialAllowanceSalary / 12).toLocaleString('en-IN')}/mo
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 5: IT Assets ── */}
          {step === 5 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Step 5: Hardware & Welcome Kit Provisioning
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Select work laptop configuration, office peripherals, and welcome swag kit.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Primary Workstation Laptop
                </label>
                <Select value={laptopModel} onChange={(e) => setLaptopModel(e.target.value)}>
                  {LAPTOP_OPTIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2.5 pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <Checkbox
                    checked={includeMonitor}
                    onCheckedChange={setIncludeMonitor}
                    className="rounded text-sky-600"
                  />
                  <span>Include Dell UltraSharp 27" 4K USB-C Hub Monitor</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <Checkbox
                    checked={includeAccessCard}
                    onCheckedChange={setIncludeAccessCard}
                    className="rounded text-sky-600"
                  />
                  <span>Provision Smarteam Smart NFC Office Access Card & YubiKey 5C NFC</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <Checkbox
                    checked={includeWelcomeKit}
                    onCheckedChange={setIncludeWelcomeKit}
                    className="rounded text-sky-600"
                  />
                  <span>
                    Dispatch Smarteam Welcome Swag Box (Hoodie, Tumbler, Notebook, Stickers)
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* ── STEP 6: Review & Finalize ── */}
          {step === 6 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Step 6: Review Onboarding Summary & Launch
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Confirm candidate profile before provisioning accounts, payroll, and team rosters.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-[6px] border border-slate-200">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Candidate</span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {firstName} {lastName}
                  </div>
                  <div className="text-slate-500">
                    {calculatedWorkEmail} · {phone}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px]">
                    Position & ID
                  </span>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {jobTitle || 'Engineer'} ({employeeNumber})
                  </div>
                  <div className="text-slate-500">
                    {department} · {branchName}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px]">
                    Reporting & Joining
                  </span>
                  <div className="font-semibold text-slate-800 mt-0.5">Manager: {manager.name}</div>
                  <div className="text-slate-500">
                    Starts on: {joiningDate} ({shiftName.split('(')[0]})
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px]">
                    Squad & Allocation
                  </span>
                  <div className="font-semibold text-slate-800 mt-0.5">{assignedTeam}</div>
                  <div className="text-slate-500">
                    {assignedProject} ({allocation}%)
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px]">
                    Compensation
                  </span>
                  <div className="font-bold text-emerald-700 mt-0.5">
                    ₹{Number(annualCtc).toLocaleString('en-IN')} / annum
                  </div>
                  <div className="text-slate-500">{payFrequency} payroll cycle</div>
                </div>

                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px]">
                    IT Equipment
                  </span>
                  <div className="font-semibold text-slate-800 mt-0.5 truncate">{laptopModel}</div>
                  <div className="text-slate-500">
                    {includeMonitor ? '4K Monitor + ' : ''}NFC Access Keycard
                  </div>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-[6px] text-xs text-emerald-900">
                <div className="font-bold">✨ Complete Automated Provisioning</div>
                <p className="text-[11px] mt-0.5 text-emerald-800 leading-relaxed">
                  Upon clicking <strong>Launch Onboarding</strong>, the system will trigger the
                  candidate pre-boarding portal, create statutory checklist tasks, dispatch IT asset
                  orders, and register the employee in the company directory.
                </p>
              </div>
            </div>
          )}

          {/* Validation Error Banner */}
          {validationError && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-md text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <span>⚠️</span>
              <span>{validationError}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setValidationError(null);
                  setStep(previousWizardStep);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-[5px] transition-colors cursor-pointer border border-slate-300 dark:border-slate-700"
              >
                ← Back
              </Button>
            ) : (
              <div />
            )}

            {step < 6 ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => {
                  if (
                    step === 1 &&
                    (!firstName.trim() || !lastName.trim() || !personalEmail.trim())
                  ) {
                    setValidationError('Please fill in candidate first name, last name and email.');
                    return;
                  }
                  if (step === 2 && !jobTitle.trim()) {
                    setValidationError('Please specify the Job Title.');
                    return;
                  }
                  setValidationError(null);
                  setStep(nextWizardStep);
                }}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-[5px] shadow-xs transition-colors cursor-pointer"
              >
                Continue to Step {step + 1} →
              </Button>
            ) : (
              <Button
                type="submit"
                variant="success"
                size="sm"
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-[5px] shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>🚀 Launch Onboarding</span>
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
