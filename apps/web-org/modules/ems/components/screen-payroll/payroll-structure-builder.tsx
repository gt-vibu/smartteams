'use client';

import React, { useState, useMemo } from 'react';
import {
  Button,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Input,
  Select,
  Label,
  Textarea,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@smarteam/ui';
import structuresFixture from '../../data/fixtures/payroll-structures.json';
import componentsFixture from '../../data/fixtures/salary-components.json';
import { formatINR } from '../../utils/formatters';
import { useAuth } from '../../hooks/use-auth';
import { emsStorageAdapter } from '../../storage/storage.adapter';
import type { PayslipData } from './payslip-document-modal';
import { PayslipDocumentModal } from './payslip-document-modal';
import type { SalaryStructureDocumentData } from './salary-structure-document-modal';
import { SalaryStructureDocumentModal } from './salary-structure-document-modal';

const STORAGE_KEY_STRUCTURES = 'ems_salary_structures_list';
const STORAGE_KEY_ASSIGNMENTS = 'ems_structure_assignments_list';

export interface StructureComponentConfig {
  code: string;
  name: string;
  category: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  calculationType:
    | 'PERCENTAGE_OF_CTC'
    | 'PERCENTAGE_OF_BASIC'
    | 'PERCENTAGE_OF_GROSS'
    | 'FIXED'
    | 'REMAINING_BALANCE';
  value: number;
  isStatutory: boolean;
  tooltipInfo?: string;
}

export interface SalaryStructure {
  id: string;
  code: string;
  name: string;
  description: string;
  payStructureMode: 'DETAILED' | 'CONSOLIDATED';
  consolidatedMonthlyPay?: number;
  level: 'ORGANIZATION_DEFAULT' | 'ROLE_SPECIFIC' | 'DEPARTMENT_SPECIFIC' | 'INDIVIDUAL_OVERRIDE';
  targetRole?: string;
  targetDepartment?: string;
  targetLocation?: string;
  targetEmployee?: string;
  status: 'ACTIVE' | 'INACTIVE';
  effectiveFrom: string;
  components: StructureComponentConfig[];
  epfCapEnabled: boolean;
  ptEnabled?: boolean;
  tdsEnabled?: boolean;
  ptState?: string;
  esicEnabled: boolean;
  gratuityEnabled: boolean;
}

export interface EmployeeStructureAssignment {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  branchName: string;
  structureId: string;
  structureName: string;
  annualCtc: number;
  assignmentType: 'INHERITED_FROM_ROLE' | 'EMPLOYEE_SPECIFIC_OVERRIDE';
  isOverride: boolean;
  overrideReason?: string;
  effectiveDate: string;
  customBasicPct?: number;
  customHraPct?: number;
}

interface RawStructureComponent {
  code: string;
  name?: string;
  category?: string;
  calculationType?: string;
  value?: number | string;
  isStatutory?: boolean;
  tooltipInfo?: string;
}

interface RawSalaryStructure {
  id: string;
  code: string;
  name: string;
  description: string;
  level: SalaryStructure['level'];
  status: SalaryStructure['status'];
  effectiveFrom: string;
  components?: RawStructureComponent[];
  payStructureMode?: SalaryStructure['payStructureMode'];
  consolidatedMonthlyPay?: number;
  epfCapEnabled?: boolean;
  ptEnabled?: boolean;
  tdsEnabled?: boolean;
  ptState?: string;
  esicEnabled?: boolean;
  gratuityEnabled?: boolean;
}

const CALCULATION_TYPES: StructureComponentConfig['calculationType'][] = [
  'PERCENTAGE_OF_CTC',
  'PERCENTAGE_OF_BASIC',
  'PERCENTAGE_OF_GROSS',
  'FIXED',
  'REMAINING_BALANCE',
];

function parseCalculationType(value: string): StructureComponentConfig['calculationType'] {
  return CALCULATION_TYPES.includes(value as StructureComponentConfig['calculationType'])
    ? (value as StructureComponentConfig['calculationType'])
    : 'PERCENTAGE_OF_CTC';
}

function normalizeComponents(rawComps: RawStructureComponent[]): StructureComponentConfig[] {
  if (!Array.isArray(rawComps)) return [];

  const defaultNames: Record<
    string,
    { name: string; category: StructureComponentConfig['category']; tooltip?: string }
  > = {
    BASIC: {
      name: 'Basic Salary',
      category: 'EARNING',
      tooltip:
        'Under the Code on Wages, excluded allowances above the permitted proportion can be added back when determining statutory wages. Configure based on your policy.',
    },
    HRA: {
      name: 'House Rent Allowance (HRA)',
      category: 'EARNING',
      tooltip:
        'HRA is an employer-defined salary component. Tax treatment and exemption depend on applicable tax rules and employee rent declarations.',
    },
    CONVEYANCE: { name: 'Conveyance Allowance', category: 'EARNING' },
    LTA: {
      name: 'Leave Travel Allowance (LTA)',
      category: 'EARNING',
      tooltip: 'Tax exempt subject to Section 10(5) for actual domestic travel expenses.',
    },
    SPECIAL_ALLOWANCE: {
      name: 'Special Allowance',
      category: 'EARNING',
      tooltip: 'Balancing component that absorbs the remainder of total CTC.',
    },
    EPF_EMP: { name: 'Employee Provident Fund (EPF)', category: 'DEDUCTION' },
    EPF_EMPR: { name: 'Employer EPF Contribution', category: 'EMPLOYER_CONTRIBUTION' },
    PROFESSIONAL_TAX: { name: 'Professional Tax (PT)', category: 'DEDUCTION' },
    GRATUITY_PROVISION: {
      name: 'Gratuity Provision',
      category: 'EMPLOYER_CONTRIBUTION',
      tooltip: 'Employer liability provision calculated as (15/26) * Basic / 12 (4.81%).',
    },
  };

  return rawComps.map((c) => {
    const meta: { name: string; category: StructureComponentConfig['category']; tooltip?: string } =
      defaultNames[c.code] || {
        name: c.name || c.code.replace(/_/g, ' '),
        category: c.code.includes('DEDUCT') || c.code.includes('TAX') ? 'DEDUCTION' : 'EARNING',
        tooltip: undefined,
      };

    const category: StructureComponentConfig['category'] =
      c.category === 'DEDUCTION' || c.category === 'EMPLOYER_CONTRIBUTION' ? c.category : 'EARNING';

    return {
      code: c.code,
      name: c.name || meta.name,
      category: c.category ? category : meta.category,
      calculationType: parseCalculationType(c.calculationType || 'PERCENTAGE_OF_CTC'),
      value: c.value !== undefined ? Number(c.value) : 0,
      isStatutory: Boolean(c.isStatutory),
      tooltipInfo: c.tooltipInfo || meta.tooltip,
    };
  });
}

function normalizeStructures(rawStructures: RawSalaryStructure[]): SalaryStructure[] {
  return rawStructures.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    description: s.description,
    level: s.level,
    status: s.status,
    effectiveFrom: s.effectiveFrom,
    payStructureMode: s.payStructureMode || 'DETAILED',
    consolidatedMonthlyPay: s.consolidatedMonthlyPay || 10000,
    components: normalizeComponents(s.components || []),
    epfCapEnabled: s.epfCapEnabled !== undefined ? s.epfCapEnabled : true,
    ptEnabled: s.ptEnabled,
    tdsEnabled: s.tdsEnabled,
    ptState: s.ptState || 'KARNATAKA',
    esicEnabled: Boolean(s.esicEnabled),
    gratuityEnabled: s.gratuityEnabled !== undefined ? s.gratuityEnabled : true,
  }));
}

const PRESET_ALLOWANCES = [
  {
    code: 'CONVEYANCE',
    name: 'Conveyance Allowance',
    calculationType: 'FIXED' as const,
    value: 1600,
  },
  {
    code: 'MEDICAL_ALLOWANCE',
    name: 'Medical Allowance',
    calculationType: 'FIXED' as const,
    value: 1250,
  },
  {
    code: 'LTA',
    name: 'Leave Travel Allowance (LTA)',
    calculationType: 'PERCENTAGE_OF_BASIC' as const,
    value: 8.33,
  },
  {
    code: 'PERF_BONUS',
    name: 'Performance Bonus',
    calculationType: 'PERCENTAGE_OF_CTC' as const,
    value: 10,
  },
  {
    code: 'SHIFT_ALLOWANCE',
    name: 'Shift Allowance',
    calculationType: 'FIXED' as const,
    value: 3000,
  },
  {
    code: 'FOOD_COUPON',
    name: 'Meal & Food Coupons',
    calculationType: 'FIXED' as const,
    value: 2200,
  },
];

const PRESET_DEDUCTIONS = [
  {
    code: 'MED_INSURANCE',
    name: 'Health Insurance Premium',
    calculationType: 'FIXED' as const,
    value: 750,
  },
  {
    code: 'VOLUNTARY_PF',
    name: 'Voluntary PF (VPF)',
    calculationType: 'PERCENTAGE_OF_BASIC' as const,
    value: 6,
  },
  {
    code: 'NPS_CONTRIBUTION',
    name: 'NPS (Sec 80CCD)',
    calculationType: 'PERCENTAGE_OF_BASIC' as const,
    value: 10,
  },
  {
    code: 'LOAN_RECOVERY',
    name: 'Salary Advance / Loan Recovery',
    calculationType: 'FIXED' as const,
    value: 2000,
  },
];

export function PayrollStructureBuilder() {
  const { workspaceContext, hasPermission } = useAuth();
  const canManage =
    workspaceContext === 'ADMIN' || hasPermission('*') || hasPermission('payroll.policy.write');

  const [structures, setStructures] = useState<SalaryStructure[]>(() => {
    const cached = emsStorageAdapter.getItem<RawSalaryStructure[]>(
      STORAGE_KEY_STRUCTURES,
      structuresFixture.structures as unknown as RawSalaryStructure[],
    );
    return normalizeStructures(cached);
  });

  const [assignments, setAssignments] = useState<EmployeeStructureAssignment[]>(() => {
    return emsStorageAdapter.getItem<EmployeeStructureAssignment[]>(
      STORAGE_KEY_ASSIGNMENTS,
      structuresFixture.employeeAssignments as unknown as EmployeeStructureAssignment[],
    );
  });

  const [activeTab, setActiveTab] = useState<string>('structures');
  const [selectedStructureId, setSelectedStructureId] = useState<string>(
    structures[0]?.id || 'struct-default-org',
  );
  const [simulatedCtc, setSimulatedCtc] = useState<number>(1200000);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Configuration Editor Mode: null (closed) | 'CREATE' | 'EDIT'
  const [editorMode, setEditorMode] = useState<'CREATE' | 'EDIT' | null>(null);
  const [editingForm, setEditingForm] = useState<SalaryStructure | null>(null);

  // Add Component Modal State
  const [isAddComponentModalOpen, setIsAddComponentModalOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<'EARNING' | 'DEDUCTION'>('EARNING');
  const [newCompName, setNewCompName] = useState('');
  const [newCompCalcType, setNewCompCalcType] =
    useState<StructureComponentConfig['calculationType']>('PERCENTAGE_OF_BASIC');
  const [newCompValue, setNewCompValue] = useState<number>(10);

  // Individual Employee Override Modal State
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [selectedEmployeeForOverride, setSelectedEmployeeForOverride] =
    useState<EmployeeStructureAssignment | null>(null);
  const [overrideBasicPct, setOverrideBasicPct] = useState<number>(50);
  const [overrideHraPct, setOverrideHraPct] = useState<number>(40);
  const [overrideReason, setOverrideReason] = useState<string>('');

  // Payslip Preview Modal State
  const [previewPayslipData, setPreviewPayslipData] = useState<PayslipData | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const selectedStructure = useMemo(() => {
    if (editorMode && editingForm) return editingForm;
    return structures.find((s) => s.id === selectedStructureId) || structures[0] || null;
  }, [structures, selectedStructureId, editorMode, editingForm]);

  // Compute live breakdown for simulated CTC
  const breakdown = useMemo(() => {
    if (!selectedStructure) return null;

    if (selectedStructure.payStructureMode === 'CONSOLIDATED') {
      const monthlyPay = selectedStructure.consolidatedMonthlyPay || 10000;
      const annualCtc = monthlyPay * 12;
      const epfEmp = Math.round(monthlyPay * 0.12);
      const epfEmpr = Math.round(monthlyPay * 0.12);
      const esiEmp = monthlyPay <= 21000 ? Math.round(monthlyPay * 0.0075) : 0;
      const esiEmpr = monthlyPay <= 21000 ? Math.round(monthlyPay * 0.0325) : 0;
      const pt = monthlyPay > 25000 ? 200 : 0;
      const totalDeductions = epfEmp + esiEmp + pt;
      const netTakeHome = monthlyPay - totalDeductions;

      return {
        monthlyCtc: monthlyPay + epfEmpr + esiEmpr,
        basic: monthlyPay,
        hra: 0,
        specialAllowance: 0,
        totalOtherEarnings: 0,
        totalOtherDeductions: 0,
        itemizedEarnings: [
          {
            code: 'CONSOLIDATED_PAY',
            name: 'Consolidated Monthly Pay',
            monthly: monthlyPay,
            annual: annualCtc,
          },
        ],
        itemizedDeductions: [],
        grossSalary: monthlyPay,
        epfEmp,
        epfEmpr,
        esiEmp,
        esiEmpr,
        pt,
        gratuity: 0,
        totalDeductions,
        netTakeHome,
        basicRatio: 100,
        isCompliant: true,
      };
    }

    const monthlyCtc = simulatedCtc / 12;
    let basic = 0;
    let hra = 0;
    const itemizedEarnings: { code: string; name: string; monthly: number; annual: number }[] = [];
    const itemizedDeductions: { code: string; name: string; monthly: number; annual: number }[] =
      [];

    // 1. Basic Pay
    const basicComp = selectedStructure.components.find((c) => c.code === 'BASIC');
    if (basicComp) {
      if (basicComp.calculationType === 'PERCENTAGE_OF_CTC') {
        basic = (monthlyCtc * (basicComp.value || 50)) / 100;
      } else if (basicComp.calculationType === 'FIXED') {
        basic = basicComp.value || 50000;
      }
    } else {
      basic = monthlyCtc * 0.5;
    }

    // 2. Earnings Allowances
    let totalOtherEarnings = 0;
    selectedStructure.components.forEach((c) => {
      if (c.code === 'BASIC' || c.code === 'SPECIAL_ALLOWANCE') return;

      const isEarning =
        c.category === 'EARNING' ||
        c.code === 'HRA' ||
        c.code === 'CONVEYANCE' ||
        c.code === 'LTA' ||
        c.code === 'PERF_BONUS' ||
        c.code === 'SHIFT_ALLOWANCE' ||
        c.code === 'FOOD_COUPON' ||
        c.code === 'MEDICAL_ALLOWANCE';

      if (isEarning) {
        let monthly = 0;
        if (c.calculationType === 'PERCENTAGE_OF_BASIC') {
          monthly = (basic * (c.value || 0)) / 100;
        } else if (c.calculationType === 'PERCENTAGE_OF_CTC') {
          monthly = (monthlyCtc * (c.value || 0)) / 100;
        } else if (c.calculationType === 'FIXED') {
          monthly = c.value || 0;
        }

        if (c.code === 'HRA') {
          hra = monthly;
        } else {
          totalOtherEarnings += monthly;
        }

        itemizedEarnings.push({
          code: c.code,
          name: c.name || c.code,
          monthly: Math.round(monthly),
          annual: Math.round(monthly * 12),
        });
      }
    });

    // 3. Statutory Deductions
    const epfWageBase = selectedStructure.epfCapEnabled ? Math.min(basic, 15000) : basic;
    const epfEmp = Math.round(epfWageBase * 0.12);
    const epfEmpr = Math.round(epfWageBase * 0.12);

    let gratuity = 0;
    if (selectedStructure.gratuityEnabled !== false) {
      gratuity = Math.round((basic * 15) / (26 * 12));
    }

    // Professional Tax: Toggleable standard ₹200/mo
    const pt = selectedStructure.ptEnabled !== false ? 200 : 0;

    // 4. Custom Deductions
    let totalOtherDeductions = 0;
    selectedStructure.components.forEach((c) => {
      const isCustomDeduction =
        c.category === 'DEDUCTION' &&
        c.code !== 'EPF_EMP' &&
        c.code !== 'EPF_EMPR' &&
        c.code !== 'PROFESSIONAL_TAX' &&
        c.code !== 'PT' &&
        c.code !== 'TDS' &&
        c.code !== 'ESIC' &&
        c.code !== 'GRATUITY_PROVISION';

      if (isCustomDeduction) {
        let monthly = 0;
        if (c.calculationType === 'PERCENTAGE_OF_BASIC') {
          monthly = (basic * (c.value || 0)) / 100;
        } else if (c.calculationType === 'PERCENTAGE_OF_CTC') {
          monthly = (monthlyCtc * (c.value || 0)) / 100;
        } else if (c.calculationType === 'FIXED') {
          monthly = c.value || 0;
        }
        totalOtherDeductions += monthly;
        itemizedDeductions.push({
          code: c.code,
          name: c.name || c.code,
          monthly: Math.round(monthly),
          annual: Math.round(monthly * 12),
        });
      }
    });

    // 5. Special Allowance as Balancing Residual
    const employerCost = epfEmpr + gratuity;
    const allocatedEarnings = basic + hra + totalOtherEarnings;
    const specialAllowance = Math.max(0, monthlyCtc - allocatedEarnings - employerCost);

    const grossSalary = basic + hra + totalOtherEarnings + specialAllowance;

    // TDS: Toggleable 10% of gross earnings
    const tds = selectedStructure.tdsEnabled !== false ? Math.round(grossSalary * 0.1) : 0;

    let esiEmp = 0;
    let esiEmpr = 0;
    if (selectedStructure.esicEnabled && grossSalary <= 21000) {
      esiEmp = Math.round(grossSalary * 0.0075);
      esiEmpr = Math.round(grossSalary * 0.0325);
    }

    const totalDeductions = epfEmp + pt + tds + esiEmp + totalOtherDeductions;
    const netTakeHome = grossSalary - totalDeductions;
    const basicRatio = monthlyCtc > 0 ? (basic / monthlyCtc) * 100 : 0;
    const isCompliant = basicRatio >= 50.0;

    return {
      monthlyCtc,
      basic,
      hra,
      specialAllowance,
      totalOtherEarnings,
      totalOtherDeductions,
      itemizedEarnings,
      itemizedDeductions,
      grossSalary,
      epfEmp,
      epfEmpr,
      esiEmp,
      esiEmpr,
      pt,
      tds,
      gratuity,
      totalDeductions,
      netTakeHome,
      basicRatio,
      isCompliant,
    };
  }, [selectedStructure, simulatedCtc]);

  // Open Configuration Editor for New Structure
  const handleOpenCreate = () => {
    const newStructure: SalaryStructure = {
      id: `struct-${Date.now()}`,
      code: `STRUCT_CUSTOM_${Math.floor(1000 + Math.random() * 9000)}`,
      name: 'Engineering & Product Salary Track',
      description: 'Standard compensation structure with statutory compliance rules.',
      payStructureMode: 'DETAILED',
      consolidatedMonthlyPay: 10000,
      level: 'ROLE_SPECIFIC',
      targetRole: 'Software Engineer',
      targetDepartment: 'Engineering & Technology',
      targetLocation: 'Bangalore HQ',
      status: 'ACTIVE',
      effectiveFrom: '2026-04-01',
      epfCapEnabled: true,
      ptState: 'KARNATAKA',
      esicEnabled: false,
      gratuityEnabled: true,
      components: [
        {
          code: 'BASIC',
          name: 'Basic Salary',
          category: 'EARNING',
          calculationType: 'PERCENTAGE_OF_CTC',
          value: 50,
          isStatutory: true,
          tooltipInfo:
            'Under the Code on Wages, excluded allowances above permitted proportion can be added back when determining statutory wages.',
        },
        {
          code: 'HRA',
          name: 'House Rent Allowance (HRA)',
          category: 'EARNING',
          calculationType: 'PERCENTAGE_OF_BASIC',
          value: 40,
          isStatutory: false,
          tooltipInfo:
            'HRA is an employer-defined salary component. Tax treatment and exemption depend on applicable tax rules.',
        },
        {
          code: 'SPECIAL_ALLOWANCE',
          name: 'Special Allowance',
          category: 'EARNING',
          calculationType: 'REMAINING_BALANCE',
          value: 0,
          isStatutory: false,
          tooltipInfo: 'Residual balancing component that absorbs the remainder of total CTC.',
        },
      ],
    };
    setEditingForm(newStructure);
    setEditorMode('CREATE');
  };

  // Open Configuration Editor for Existing Structure
  const handleOpenEdit = (struct: SalaryStructure) => {
    setEditingForm({
      ...struct,
      components: struct.components.map((component) => ({ ...component })),
    });
    setEditorMode('EDIT');
  };

  // Save Structure
  const handleSaveStructure = () => {
    if (!editingForm) return;
    let next: SalaryStructure[];
    const idx = structures.findIndex((s) => s.id === editingForm.id);
    if (idx >= 0) {
      next = [...structures];
      next[idx] = editingForm;
    } else {
      next = [editingForm, ...structures];
    }
    setStructures(next);
    setSelectedStructureId(editingForm.id);
    emsStorageAdapter.setItem(STORAGE_KEY_STRUCTURES, next);
    setEditorMode(null);
    setEditingForm(null);
    showToast(`Salary structure "${editingForm.name}" saved successfully.`);
  };

  // Handle Component Edit
  const handleUpdateComponent = (code: string, updates: Partial<StructureComponentConfig>) => {
    if (!editingForm) return;
    const nextComponents = editingForm.components.map((c) =>
      c.code === code ? { ...c, ...updates } : c,
    );
    setEditingForm({
      ...editingForm,
      components: nextComponents,
    });
  };

  // Remove Component
  const handleRemoveComponent = (code: string) => {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      components: editingForm.components.filter((c) => c.code !== code),
    });
  };

  // Quick Add Preset
  const handleQuickAddPreset = (
    preset: (typeof PRESET_ALLOWANCES)[0],
    category: 'EARNING' | 'DEDUCTION',
  ) => {
    if (!editingForm) return;
    if (editingForm.components.some((c) => c.code === preset.code)) {
      showToast(`${preset.name} is already present in this structure.`);
      return;
    }
    const newComp: StructureComponentConfig = {
      code: preset.code,
      name: preset.name,
      category,
      calculationType: preset.calculationType,
      value: preset.value,
      isStatutory: false,
    };
    setEditingForm({
      ...editingForm,
      components: [...editingForm.components, newComp],
    });
    showToast(`Added ${preset.name} to template.`);
  };

  // Add Custom Component
  const handleAddNewComponent = () => {
    if (!editingForm || !newCompName.trim()) return;
    const code = newCompName
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_');
    const newComponent: StructureComponentConfig = {
      code,
      name: newCompName.trim(),
      category: addCategory,
      calculationType: newCompCalcType,
      value: newCompValue,
      isStatutory: false,
    };

    setEditingForm({
      ...editingForm,
      components: [...editingForm.components, newComponent],
    });
    setIsAddComponentModalOpen(false);
    setNewCompName('');
    showToast(`Added ${newCompName} to structure.`);
  };

  // Employee Overrides
  const handleSaveOverride = () => {
    if (!selectedEmployeeForOverride) return;
    const updated = assignments.map((a) => {
      if (a.id === selectedEmployeeForOverride.id) {
        return {
          ...a,
          isOverride: true,
          assignmentType: 'EMPLOYEE_SPECIFIC_OVERRIDE' as const,
          overrideReason: overrideReason || 'Executive compensation agreement approved by HR',
          customBasicPct: overrideBasicPct,
          customHraPct: overrideHraPct,
        };
      }
      return a;
    });
    setAssignments(updated);
    emsStorageAdapter.setItem(STORAGE_KEY_ASSIGNMENTS, updated);
    setIsOverrideModalOpen(false);
    showToast(`Custom override applied for ${selectedEmployeeForOverride.employeeName}.`);
  };

  const handleResetToRoleDefault = (assignmentId: string) => {
    const updated = assignments.map((a) => {
      if (a.id === assignmentId) {
        return {
          ...a,
          isOverride: false,
          assignmentType: 'INHERITED_FROM_ROLE' as const,
          overrideReason: undefined,
          customBasicPct: undefined,
          customHraPct: undefined,
        };
      }
      return a;
    });
    setAssignments(updated);
    emsStorageAdapter.setItem(STORAGE_KEY_ASSIGNMENTS, updated);
    showToast('Employee compensation structure reverted to role default template.');
  };

  const getEditingComp = (code: string) => {
    if (!editingForm) return null;
    let comp = editingForm.components.find((c) => c.code === code);
    if (!comp) {
      if (code === 'BASIC') {
        comp = {
          code: 'BASIC',
          name: 'Basic Salary',
          category: 'EARNING',
          calculationType: 'PERCENTAGE_OF_CTC',
          value: 50,
          isStatutory: true,
        };
      } else if (code === 'HRA') {
        comp = {
          code: 'HRA',
          name: 'House Rent Allowance (HRA)',
          category: 'EARNING',
          calculationType: 'PERCENTAGE_OF_BASIC',
          value: 40,
          isStatutory: false,
        };
      }
    }
    return comp;
  };

  // Open Live Payslip Preview Modal
  const handleOpenPayslipPreview = () => {
    if (!breakdown || !selectedStructure) return;
    const payslip: PayslipData = {
      id: `preview-${Date.now()}`,
      payrollRunCode: 'PR-2026-07 (Simulation)',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      payDate: '2026-07-31',
      employeeId: 'EMP-064',
      employeeNumber: 'EMP-064',
      employeeName: 'Mithun Gowda H',
      jobTitle: selectedStructure.targetRole || 'Software Engineer',
      department: selectedStructure.targetDepartment || 'Engineering & Technology',
      branchName: 'HQ – Bengaluru',
      totalWorkingDays: 30,
      paidDays: 30,
      lossOfPayDays: 0,
      earnings: [
        { name: 'Basic Salary', amount: breakdown.basic },
        { name: 'House Rent Allowance (HRA)', amount: breakdown.hra },
        ...breakdown.itemizedEarnings
          .filter((i) => i.code !== 'BASIC' && i.code !== 'HRA')
          .map((i) => ({ name: i.name, amount: i.monthly })),
        { name: 'Special Allowance', amount: breakdown.specialAllowance },
      ],
      deductions: [
        { name: 'Employee Provident Fund (12%)', amount: breakdown.epfEmp },
        { name: 'Professional Tax (PT)', amount: breakdown.pt },
        ...breakdown.itemizedDeductions.map((i) => ({ name: i.name, amount: i.monthly })),
      ],
      employerContributions: [
        { name: 'Employer EPF Contribution', amount: breakdown.epfEmpr },
        { name: 'Gratuity Provision (4.81%)', amount: breakdown.gratuity },
      ],
      grossEarnings: breakdown.grossSalary,
      totalDeductions: breakdown.totalDeductions,
      netPay: breakdown.netTakeHome,
      totalEmployerCost: breakdown.monthlyCtc,
    };
    setPreviewPayslipData(payslip);
  };

  const [previewStructureDocData, setPreviewStructureDocData] =
    useState<SalaryStructureDocumentData | null>(null);

  const handleOpenStructureDocPreview = () => {
    if (!breakdown || !selectedStructure) return;
    const doc: SalaryStructureDocumentData = {
      structureName: selectedStructure.name,
      structureCode: selectedStructure.code,
      effectiveFrom: selectedStructure.effectiveFrom || '2026-04-01',
      employeeName: selectedStructure.targetRole
        ? `Standard ${selectedStructure.targetRole} Benchmark`
        : 'Workforce Baseline Benchmark',
      employeeNumber: selectedStructure.code,
      jobTitle: selectedStructure.targetRole || 'All Roles',
      department: selectedStructure.targetDepartment || 'All Departments',
      annualCtc: simulatedCtc,
      monthlyCtc: Math.round(simulatedCtc / 12),
      earnings: [
        { name: 'Basic Salary', monthly: breakdown.basic, annual: breakdown.basic * 12 },
        { name: 'House Rent Allowance (HRA)', monthly: breakdown.hra, annual: breakdown.hra * 12 },
        ...breakdown.itemizedEarnings
          .filter((i) => i.code !== 'BASIC' && i.code !== 'HRA')
          .map((i) => ({
            name: i.name,
            monthly: i.monthly,
            annual: i.annual,
          })),
        {
          name: 'Special Allowance',
          monthly: breakdown.specialAllowance,
          annual: breakdown.specialAllowance * 12,
        },
      ],
      deductions: [
        {
          name: 'Employee Provident Fund (12%)',
          monthly: breakdown.epfEmp,
          annual: breakdown.epfEmp * 12,
        },
        { name: 'Professional Tax (PT)', monthly: breakdown.pt, annual: breakdown.pt * 12 },
        {
          name: 'Income Tax (TDS 10%)',
          monthly: breakdown.tds || 0,
          annual: (breakdown.tds || 0) * 12,
        },
        ...breakdown.itemizedDeductions.map((i) => ({
          name: i.name,
          monthly: i.monthly,
          annual: i.annual,
        })),
      ],
      employerContributions: [
        {
          name: 'Employer EPF Contribution',
          monthly: breakdown.epfEmpr,
          annual: breakdown.epfEmpr * 12,
        },
        {
          name: 'Gratuity Provision (4.81%)',
          monthly: breakdown.gratuity,
          annual: breakdown.gratuity * 12,
        },
      ],
      grossSalary: breakdown.grossSalary,
      totalDeductions: breakdown.totalDeductions,
      netTakeHome: breakdown.netTakeHome,
    };
    setPreviewStructureDocData(doc);
  };

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-md shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Salary Structure Architect
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure role-based salary templates, custom allowances, statutory rules, and
            individual employee overrides.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleOpenStructureDocPreview}>
            <span>📥</span>
            <span>Download Structure (PDF)</span>
          </Button>

          <Button variant="outline" size="sm" onClick={handleOpenPayslipPreview}>
            <span>👁</span>
            <span>Preview Payslip</span>
          </Button>

          {canManage && !editorMode && (
            <Button onClick={handleOpenCreate} size="sm">
              <span>+</span>
              <span>Create Structure</span>
            </Button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          VIEW 1: ZOHO-GRADE CONFIGURATION EDITOR (Admin Edit / Create Mode)
         ══════════════════════════════════════════════════════════════════════════ */}
      {editorMode && editingForm ? (
        <div className="space-y-4">
          {/* Action Bar */}
          <div className="p-3.5 bg-slate-100 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-slate-900 dark:text-white">
                  {editorMode === 'CREATE' ? 'New Salary Structure Template' : editingForm.name}
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {editingForm.code}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Define calculation rules, allowance components, and statutory formulas. Live
                simulation updates on the right.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditorMode(null);
                  setEditingForm(null);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveStructure}>
                Save Structure
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: Form Controls */}
            <div className="lg:col-span-7 space-y-4">
              {/* 1. Structure Mode & Applies To */}
              <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    1. Structure Scope & Mode
                  </span>
                  <div
                    title="Resolution Priority: Individual Override ↓ Role Structure ↓ Department Structure ↓ Organization Default"
                    className="text-slate-400 text-xs cursor-help flex items-center gap-1"
                  >
                    <span>Priority resolution</span>
                    <span>ⓘ</span>
                  </div>
                </div>

                {/* Structure Mode Switch */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Pay Structure Mode</Label>
                  <RadioGroup
                    value={editingForm.payStructureMode}
                    onValueChange={(value) =>
                      setEditingForm({
                        ...editingForm,
                        payStructureMode: value as SalaryStructure['payStructureMode'],
                      })
                    }
                    className="grid grid-cols-2 gap-2"
                  >
                    <label
                      className={`p-2.5 rounded-lg border text-xs font-semibold cursor-pointer flex items-center gap-2 ${
                        editingForm.payStructureMode === 'DETAILED'
                          ? 'border-primary bg-sky-50 dark:bg-card text-primary dark:text-sky-300'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <RadioGroupItem value="DETAILED" aria-label="Detailed Structure" />
                      <div>
                        <div>Detailed Structure</div>
                        <div className="text-[10px] text-slate-500 font-normal">
                          Basic, HRA, allowances, and statutory breakdown
                        </div>
                      </div>
                    </label>

                    <label
                      className={`p-2.5 rounded-lg border text-xs font-semibold cursor-pointer flex items-center gap-2 ${
                        editingForm.payStructureMode === 'CONSOLIDATED'
                          ? 'border-primary bg-sky-50 dark:bg-card text-primary dark:text-sky-300'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <RadioGroupItem value="CONSOLIDATED" aria-label="Consolidated Pay" />
                      <div>
                        <div>Consolidated Pay</div>
                        <div className="text-[10px] text-slate-500 font-normal">
                          Single fixed monthly pay (support / operations)
                        </div>
                      </div>
                    </label>
                  </RadioGroup>
                </div>

                {editingForm.payStructureMode === 'CONSOLIDATED' ? (
                  <div className="p-3 bg-slate-50 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                    <Label className="text-xs">Fixed Monthly Consolidated Pay (₹)</Label>
                    <Input
                      type="number"
                      value={editingForm.consolidatedMonthlyPay || 10000}
                      onChange={(e) =>
                        setEditingForm({
                          ...editingForm,
                          consolidatedMonthlyPay: Number(e.target.value),
                        })
                      }
                      className="font-mono font-bold"
                    />
                    <p className="text-[11px] text-slate-500">
                      ⓘ Statutory PF & ESI will still be evaluated automatically based on wage
                      thresholds.
                    </p>
                  </div>
                ) : null}

                {/* Identity & Scope */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Structure Name</Label>
                    <Input
                      type="text"
                      value={editingForm.name}
                      onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Structure Code</Label>
                    <Input
                      type="text"
                      value={editingForm.code}
                      onChange={(e) => setEditingForm({ ...editingForm, code: e.target.value })}
                      className="font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Applies To</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { value: 'ORGANIZATION_DEFAULT', label: 'Organization' },
                      { value: 'DEPARTMENT_SPECIFIC', label: 'Department' },
                      { value: 'ROLE_SPECIFIC', label: 'Role' },
                      { value: 'INDIVIDUAL_OVERRIDE', label: 'Individual' },
                    ].map((opt) => (
                      <Button
                        type="button"
                        key={opt.value}
                        onClick={() =>
                          setEditingForm({
                            ...editingForm,
                            level: opt.value as SalaryStructure['level'],
                          })
                        }
                        className={`py-1.5 px-2 text-xs font-semibold rounded-md border transition-all text-center cursor-pointer ${
                          editingForm.level === opt.value
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-2xs'
                            : 'bg-slate-50 dark:bg-card text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {editingForm.level === 'ROLE_SPECIFIC' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs">Role</Label>
                      <Select
                        value={editingForm.targetRole || 'Software Engineer'}
                        onChange={(e) =>
                          setEditingForm({ ...editingForm, targetRole: e.target.value })
                        }
                      >
                        <option value="Software Engineer">Software Engineer</option>
                        <option value="Senior Software Engineer">Senior Software Engineer</option>
                        <option value="Principal Engineer">Principal Engineer</option>
                        <option value="Product Manager">Product Manager</option>
                        <option value="Senior UI/UX Designer">Senior UI/UX Designer</option>
                        <option value="Housekeeping & Support">Housekeeping & Support</option>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Department (Optional)</Label>
                      <Select
                        value={editingForm.targetDepartment || 'Engineering & Technology'}
                        onChange={(e) =>
                          setEditingForm({ ...editingForm, targetDepartment: e.target.value })
                        }
                      >
                        <option value="Engineering & Technology">Engineering & Technology</option>
                        <option value="Product & Design">Product & Design</option>
                        <option value="Operations & Facilities">Operations & Facilities</option>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Location (Optional)</Label>
                      <Select
                        value={editingForm.targetLocation || 'Bangalore HQ'}
                        onChange={(e) =>
                          setEditingForm({ ...editingForm, targetLocation: e.target.value })
                        }
                      >
                        <option value="Bangalore HQ">Bangalore HQ</option>
                        <option value="Mumbai Branch">Mumbai Branch</option>
                        <option value="Hyderabad Branch">Hyderabad Branch</option>
                        <option value="Remote">Remote</option>
                      </Select>
                    </div>
                  </div>
                )}
              </Card>

              {/* 2. Earnings & Allowances (Only in Detailed Mode) */}
              {editingForm.payStructureMode === 'DETAILED' && (
                <Card className="p-4 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        2. Earnings & Allowances
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Base salary percentages and flexible employee allowances
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAddCategory('EARNING');
                        setNewCompName('');
                        setNewCompCalcType('PERCENTAGE_OF_BASIC');
                        setNewCompValue(10);
                        setIsAddComponentModalOpen(true);
                      }}
                      className="text-xs"
                    >
                      + Add Allowance
                    </Button>
                  </div>

                  {/* Quick-Add Bar */}
                  <div className="flex items-center gap-1.5 flex-wrap pb-1">
                    <span className="text-[10px] text-slate-400 font-semibold">Quick add:</span>
                    {PRESET_ALLOWANCES.slice(0, 4).map((p) => (
                      <Button
                        key={p.code}
                        type="button"
                        onClick={() => handleQuickAddPreset(p, 'EARNING')}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                      >
                        + {p.name}
                      </Button>
                    ))}
                  </div>

                  {/* Basic Salary Component Card */}
                  <div className="p-3 bg-slate-50 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Basic Salary
                        </span>
                        <Badge variant="secondary" className="text-[9px]">
                          Required
                        </Badge>
                        <span
                          title="Under the Code on Wages, excluded allowances above the permitted proportion can be added back when determining statutory wages. Configure based on your organization payroll policy."
                          className="text-slate-400 cursor-help text-xs ml-0.5"
                        >
                          ⓘ
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">
                        = {formatINR(breakdown ? breakdown.basic : 50000)} / mo
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500">Calculation Method</Label>
                        <Select
                          value={getEditingComp('BASIC')?.calculationType || 'PERCENTAGE_OF_CTC'}
                          onChange={(e) => {
                            if (!editingForm.components.some((c) => c.code === 'BASIC')) {
                              setEditingForm({
                                ...editingForm,
                                components: [
                                  {
                                    code: 'BASIC',
                                    name: 'Basic Salary',
                                    category: 'EARNING',
                                    calculationType: parseCalculationType(e.target.value),
                                    value: 50,
                                    isStatutory: true,
                                  },
                                  ...editingForm.components,
                                ],
                              });
                            } else {
                              handleUpdateComponent('BASIC', {
                                calculationType: parseCalculationType(e.target.value),
                              });
                            }
                          }}
                        >
                          <option value="PERCENTAGE_OF_CTC">% of Total CTC (Standard)</option>
                          <option value="FIXED">Fixed Monthly Amount (₹)</option>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500">
                          Value (
                          {getEditingComp('BASIC')?.calculationType === 'FIXED'
                            ? '₹ / mo'
                            : '% of CTC'}
                          )
                        </Label>
                        <Input
                          type="number"
                          value={getEditingComp('BASIC')?.value ?? 50}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (!editingForm.components.some((c) => c.code === 'BASIC')) {
                              setEditingForm({
                                ...editingForm,
                                components: [
                                  {
                                    code: 'BASIC',
                                    name: 'Basic Salary',
                                    category: 'EARNING',
                                    calculationType: 'PERCENTAGE_OF_CTC',
                                    value: val,
                                    isStatutory: true,
                                  },
                                  ...editingForm.components,
                                ],
                              });
                            } else {
                              handleUpdateComponent('BASIC', { value: val });
                            }
                          }}
                          className="font-mono font-bold text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* HRA Component Card */}
                  <div className="p-3 bg-slate-50 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          House Rent Allowance (HRA)
                        </span>
                        <span
                          title="HRA is an employer-defined salary component. Tax treatment and exemption depend on applicable tax rules and employee declarations."
                          className="text-slate-400 cursor-help text-xs ml-0.5"
                        >
                          ⓘ
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">
                        = {formatINR(breakdown ? breakdown.hra : 20000)} / mo
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500">Calculation Method</Label>
                        <Select
                          value={getEditingComp('HRA')?.calculationType || 'PERCENTAGE_OF_BASIC'}
                          onChange={(e) => {
                            if (!editingForm.components.some((c) => c.code === 'HRA')) {
                              setEditingForm({
                                ...editingForm,
                                components: [
                                  ...editingForm.components,
                                  {
                                    code: 'HRA',
                                    name: 'House Rent Allowance (HRA)',
                                    category: 'EARNING',
                                    calculationType: parseCalculationType(e.target.value),
                                    value: 40,
                                    isStatutory: false,
                                  },
                                ],
                              });
                            } else {
                              handleUpdateComponent('HRA', {
                                calculationType: parseCalculationType(e.target.value),
                              });
                            }
                          }}
                        >
                          <option value="PERCENTAGE_OF_BASIC">% of Basic Salary (40% / 50%)</option>
                          <option value="PERCENTAGE_OF_CTC">% of Total CTC</option>
                          <option value="FIXED">Fixed Monthly Amount (₹)</option>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500">
                          Value (
                          {getEditingComp('HRA')?.calculationType === 'FIXED' ? '₹ / mo' : '%'})
                        </Label>
                        <Input
                          type="number"
                          value={getEditingComp('HRA')?.value ?? 40}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (!editingForm.components.some((c) => c.code === 'HRA')) {
                              setEditingForm({
                                ...editingForm,
                                components: [
                                  ...editingForm.components,
                                  {
                                    code: 'HRA',
                                    name: 'House Rent Allowance (HRA)',
                                    category: 'EARNING',
                                    calculationType: 'PERCENTAGE_OF_BASIC',
                                    value: val,
                                    isStatutory: false,
                                  },
                                ],
                              });
                            } else {
                              handleUpdateComponent('HRA', { value: val });
                            }
                          }}
                          className="font-mono font-bold text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Additional Allowances */}
                  {editingForm.components
                    .filter(
                      (c) =>
                        c.code !== 'BASIC' &&
                        c.code !== 'HRA' &&
                        c.code !== 'SPECIAL_ALLOWANCE' &&
                        c.category === 'EARNING',
                    )
                    .map((comp) => (
                      <div
                        key={comp.code}
                        className="p-3 bg-slate-50 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 space-y-2 relative"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {comp.name}
                          </span>
                          <Button
                            type="button"
                            onClick={() => handleRemoveComponent(comp.code)}
                            className="text-slate-400 hover:text-rose-600 p-1 text-xs cursor-pointer"
                          >
                            ✕
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-500">Method</Label>
                            <Select
                              value={comp.calculationType}
                              onChange={(e) =>
                                handleUpdateComponent(comp.code, {
                                  calculationType: parseCalculationType(e.target.value),
                                })
                              }
                            >
                              <option value="PERCENTAGE_OF_BASIC">% of Basic Salary</option>
                              <option value="PERCENTAGE_OF_CTC">% of Total CTC</option>
                              <option value="FIXED">Fixed Monthly Amount (₹)</option>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-500">
                              Value ({comp.calculationType === 'FIXED' ? '₹' : '%'})
                            </Label>
                            <Input
                              type="number"
                              value={comp.value}
                              onChange={(e) =>
                                handleUpdateComponent(comp.code, { value: Number(e.target.value) })
                              }
                              className="font-mono font-bold text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                  {/* Special Allowance (Balancing Residual) */}
                  <div className="p-3 bg-sky-50/70 dark:bg-card/70 rounded-lg border border-sky-200 dark:border-sky-800/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-sky-900 dark:text-sky-300">
                          Special Allowance
                        </span>
                        <span
                          title="Residual balancing component that absorbs the remainder of total CTC."
                          className="text-slate-400 cursor-help text-xs"
                        >
                          ⓘ
                        </span>
                      </div>
                      <span className="text-xs font-bold font-mono text-sky-800 dark:text-sky-300">
                        = {formatINR(breakdown ? breakdown.specialAllowance : 41596)} / mo
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Automatically calculated to balance total monthly CTC.
                    </p>
                  </div>
                </Card>
              )}

              {/* 3. Deductions & Statutory Rules */}
              <Card className="p-4 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      3. Statutory & Custom Deductions
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Statutory EPF, Professional Tax, and voluntary employee deductions
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAddCategory('DEDUCTION');
                      setNewCompName('');
                      setNewCompCalcType('FIXED');
                      setNewCompValue(750);
                      setIsAddComponentModalOpen(true);
                    }}
                    className="text-xs"
                  >
                    + Add Deduction
                  </Button>
                </div>

                {/* Quick Add Deductions */}
                <div className="flex items-center gap-1.5 flex-wrap pb-1">
                  <span className="text-[10px] text-slate-400 font-semibold">Quick add:</span>
                  {PRESET_DEDUCTIONS.map((p) => (
                    <Button
                      key={p.code}
                      type="button"
                      onClick={() => handleQuickAddPreset(p, 'DEDUCTION')}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      + {p.name}
                    </Button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Employee PF (12%)
                      </span>
                      <span
                        title="Standard statutory 12% contribution framework."
                        className="text-slate-400 text-xs cursor-help"
                      >
                        ⓘ
                      </span>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <Checkbox
                        checked={editingForm.epfCapEnabled}
                        onCheckedChange={(checked) =>
                          setEditingForm({ ...editingForm, epfCapEnabled: checked === true })
                        }
                        className="accent-primary"
                      />
                      <span>₹15,000 wage ceiling (₹1,800/mo cap)</span>
                    </label>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Professional Tax (PT)
                        </span>
                        <span
                          title="Standard statutory employee deduction (₹200/mo)."
                          className="text-slate-400 text-xs cursor-help"
                        >
                          ⓘ
                        </span>
                      </div>
                      <Badge
                        variant={editingForm.ptEnabled !== false ? 'sky' : 'secondary'}
                        className="text-[10px]"
                      >
                        {editingForm.ptEnabled !== false ? '₹200/mo' : 'Disabled'}
                      </Badge>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <Checkbox
                        checked={editingForm.ptEnabled !== false}
                        onCheckedChange={(checked) =>
                          setEditingForm({ ...editingForm, ptEnabled: checked === true })
                        }
                        className="accent-primary"
                      />
                      <span>Enable PT deduction (₹200 / month)</span>
                    </label>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Income Tax (TDS)
                        </span>
                        <span
                          title="Tax deduction at source under Section 392."
                          className="text-slate-400 text-xs cursor-help"
                        >
                          ⓘ
                        </span>
                      </div>
                      <Badge
                        variant={editingForm.tdsEnabled !== false ? 'sky' : 'secondary'}
                        className="text-[10px]"
                      >
                        {editingForm.tdsEnabled !== false ? '10% Gross' : 'Disabled'}
                      </Badge>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <Checkbox
                        checked={editingForm.tdsEnabled !== false}
                        onCheckedChange={(checked) =>
                          setEditingForm({ ...editingForm, tdsEnabled: checked === true })
                        }
                        className="accent-primary"
                      />
                      <span>Enable TDS withholding (10% of Gross)</span>
                    </label>
                  </div>
                </div>

                {/* Custom Deductions */}
                {editingForm.components
                  .filter(
                    (c) =>
                      c.category === 'DEDUCTION' &&
                      c.code !== 'EPF_EMP' &&
                      c.code !== 'PROFESSIONAL_TAX',
                  )
                  .map((comp) => (
                    <div
                      key={comp.code}
                      className="p-3 bg-rose-50/50 dark:bg-rose-950/20 rounded-lg border border-rose-200 dark:border-rose-800/50 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {comp.name}
                        </span>
                        <Button
                          type="button"
                          onClick={() => handleRemoveComponent(comp.code)}
                          className="text-slate-400 hover:text-rose-600 p-1 text-xs cursor-pointer"
                        >
                          ✕
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-500">Method</Label>
                          <Select
                            value={comp.calculationType}
                            onChange={(e) =>
                              handleUpdateComponent(comp.code, {
                                calculationType: parseCalculationType(e.target.value),
                              })
                            }
                          >
                            <option value="FIXED">Fixed Monthly Amount (₹)</option>
                            <option value="PERCENTAGE_OF_BASIC">% of Basic Salary</option>
                            <option value="PERCENTAGE_OF_CTC">% of Total CTC</option>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-500">
                            Amount ({comp.calculationType === 'FIXED' ? '₹' : '%'})
                          </Label>
                          <Input
                            type="number"
                            value={comp.value}
                            onChange={(e) =>
                              handleUpdateComponent(comp.code, { value: Number(e.target.value) })
                            }
                            className="font-mono font-bold text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
              </Card>
            </div>

            {/* Right Column: Live Compact Synchronized Simulator */}
            <div className="lg:col-span-5 space-y-4">
              <Card className="p-4 sticky top-4 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Salary Preview
                    </h4>
                    <p className="text-[11px] text-slate-500">Live synchronized calculation</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenPayslipPreview}
                    className="text-xs"
                  >
                    👁 View Payslip
                  </Button>
                </div>

                {/* Synced CTC Number Input & Range Slider */}
                <div className="space-y-2 p-3 bg-slate-50 dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Annual CTC (₹):</Label>
                    <Input
                      type="number"
                      value={simulatedCtc}
                      onChange={(e) => setSimulatedCtc(Number(e.target.value))}
                      className="w-36 h-7 text-xs font-mono font-bold text-right"
                    />
                  </div>

                  <input
                    type="range"
                    min={300000}
                    max={6000000}
                    step={50000}
                    value={simulatedCtc}
                    onChange={(e) => setSimulatedCtc(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"
                  />

                  <div className="flex justify-between text-[11px] font-mono text-slate-500">
                    <span>Monthly CTC:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatINR(Math.round(simulatedCtc / 12))}
                    </span>
                  </div>
                </div>

                {/* Compact Calculation Table */}
                {breakdown && (
                  <div className="space-y-2.5 text-xs font-mono">
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                      {/* Earnings */}
                      <div className="p-2.5 bg-slate-50/50 dark:bg-card/50 space-y-1">
                        <div className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">
                          Earnings
                        </div>
                        <div className="flex justify-between text-slate-700 dark:text-slate-300">
                          <span className="font-sans">Basic Salary:</span>
                          <span>{formatINR(breakdown.basic)}</span>
                        </div>
                        <div className="flex justify-between text-slate-700 dark:text-slate-300">
                          <span className="font-sans">HRA:</span>
                          <span>{formatINR(breakdown.hra)}</span>
                        </div>
                        {breakdown.itemizedEarnings
                          .filter(
                            (i) =>
                              i.code !== 'BASIC' &&
                              i.code !== 'HRA' &&
                              i.code !== 'CONSOLIDATED_PAY',
                          )
                          .map((i) => (
                            <div
                              key={i.code}
                              className="flex justify-between text-slate-700 dark:text-slate-300"
                            >
                              <span className="font-sans">{i.name}:</span>
                              <span>{formatINR(i.monthly)}</span>
                            </div>
                          ))}
                        <div className="flex justify-between text-slate-700 dark:text-slate-300">
                          <span className="font-sans">Special Allowance:</span>
                          <span>{formatINR(breakdown.specialAllowance)}</span>
                        </div>
                        <div className="pt-1 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-slate-900 dark:text-white">
                          <span className="font-sans">Gross Pay:</span>
                          <span>{formatINR(breakdown.grossSalary)}</span>
                        </div>
                      </div>

                      {/* Employee Deductions */}
                      <div className="p-2.5 bg-slate-50/50 dark:bg-card/50 space-y-1">
                        <div className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">
                          Employee Deductions
                        </div>
                        <div className="flex justify-between text-rose-600 dark:text-rose-400">
                          <span className="font-sans">Employee EPF:</span>
                          <span>-{formatINR(breakdown.epfEmp)}</span>
                        </div>
                        <div className="flex justify-between text-rose-600 dark:text-rose-400">
                          <span className="font-sans">Professional Tax:</span>
                          <span>-{formatINR(breakdown.pt)}</span>
                        </div>
                        <div className="flex justify-between text-rose-600 dark:text-rose-400">
                          <span className="font-sans">Income Tax (TDS 10%):</span>
                          <span>-{formatINR(breakdown.tds || 0)}</span>
                        </div>
                        {breakdown.itemizedDeductions.map((i) => (
                          <div
                            key={i.code}
                            className="flex justify-between text-rose-600 dark:text-rose-400"
                          >
                            <span className="font-sans">{i.name}:</span>
                            <span>-{formatINR(i.monthly)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Estimated Take-Home Highlight */}
                      <div className="p-2.5 bg-emerald-50/70 dark:bg-emerald-950/30 flex justify-between font-bold text-emerald-800 dark:text-emerald-300">
                        <span className="font-sans">Estimated Take-Home:</span>
                        <span>{formatINR(breakdown.netTakeHome)}</span>
                      </div>

                      {/* Employer Costs */}
                      <div className="p-2.5 bg-slate-50/50 dark:bg-card/50 space-y-1">
                        <div className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">
                          Employer Costs (CTC)
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                          <span className="font-sans">Employer EPF:</span>
                          <span>{formatINR(breakdown.epfEmpr)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                          <span className="font-sans">Gratuity Provision:</span>
                          <span>{formatINR(breakdown.gratuity)}</span>
                        </div>
                        <div className="pt-1 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-slate-900 dark:text-white">
                          <span className="font-sans">Total Monthly CTC:</span>
                          <span>{formatINR(breakdown.monthlyCtc)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════════
            MAIN TABBED VIEW
           ══════════════════════════════════════════════════════════════════════════ */
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-xl">
            <TabsTrigger value="structures">Structure Templates ({structures.length})</TabsTrigger>
            <TabsTrigger value="assignments">
              Assignments & Overrides ({assignments.length})
            </TabsTrigger>
            <TabsTrigger value="components_catalog">
              Pay Components ({componentsFixture.statutoryComponents.length})
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: SALARY STRUCTURE TEMPLATES */}
          <TabsContent value="structures" className="space-y-4 mt-3">
            <Card>
              <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-bold">
                    Configured Salary Structure Matrix
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    Templates defining component calculation formulas and statutory rules across
                    organizational levels.
                  </CardDescription>
                </div>
                <Badge variant="secondary">{structures.length} templates</Badge>
              </CardHeader>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Scope</TableHead>
                    <TableHead>Target / Role</TableHead>
                    <TableHead>Structure Name & Code</TableHead>
                    <TableHead>Mode / Basic Rule</TableHead>
                    <TableHead>Take-Home (@ ₹12L)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {structures.map((s) => {
                    const isSelected = selectedStructureId === s.id;
                    const basicVal = s.components.find((c) => c.code === 'BASIC')?.value || 50;

                    return (
                      <TableRow
                        key={s.id}
                        className={isSelected ? 'bg-sky-50/50 dark:bg-card/50' : ''}
                      >
                        <TableCell className="px-4">
                          <Badge
                            variant={
                              s.level === 'ORGANIZATION_DEFAULT'
                                ? 'purple'
                                : s.level === 'DEPARTMENT_SPECIFIC'
                                  ? 'warning'
                                  : 'sky'
                            }
                          >
                            {s.level.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">
                          {s.targetRole || s.targetDepartment || 'All Workforce (Org Default)'}
                        </TableCell>
                        <TableCell>
                          <div className="font-bold">{s.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{s.code}</div>
                        </TableCell>
                        <TableCell className="font-mono">
                          {s.payStructureMode === 'CONSOLIDATED'
                            ? `Consolidated (₹${s.consolidatedMonthlyPay || 10000}/mo)`
                            : `${basicVal}% of CTC`}
                        </TableCell>
                        <TableCell className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {formatINR(
                            Math.round(
                              (1200000 / 12) * 0.5 + (1200000 / 12) * 0.5 * 0.4 - 1800 - 200,
                            ),
                          )}{' '}
                          / mo
                        </TableCell>
                        <TableCell>
                          <Badge variant="success">{s.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedStructureId(s.id);
                                handleOpenPayslipPreview();
                              }}
                            >
                              Preview
                            </Button>
                            {canManage && (
                              <Button size="sm" onClick={() => handleOpenEdit(s)}>
                                ⚙ Configure
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* TAB 2: EMPLOYEE ASSIGNMENTS & OVERRIDES */}
          <TabsContent value="assignments" className="space-y-4 mt-3">
            <Card>
              <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-bold">
                    Workforce Structure Assignment & Override Ledger
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    Shows inherited role templates versus individualized executive overrides with
                    audit trails.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="sky">Inherited from Role</Badge>
                  <Badge variant="warning">★ Individual Override</Badge>
                </div>
              </CardHeader>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Employee</TableHead>
                    <TableHead>Annual CTC</TableHead>
                    <TableHead>Assigned Structure</TableHead>
                    <TableHead>Hierarchy / Status</TableHead>
                    <TableHead>Override Customizations</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="px-4">
                        <div className="font-bold">{a.employeeName}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {a.employeeNumber} · {a.jobTitle}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono font-bold text-sky-700 dark:text-sky-400">
                        {formatINR(a.annualCtc)}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold">{a.structureName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Effective: {a.effectiveDate}
                        </div>
                      </TableCell>
                      <TableCell>
                        {a.isOverride ? (
                          <Badge variant="warning">★ Individual Override</Badge>
                        ) : (
                          <Badge variant="sky">↓ Inherited from {a.jobTitle}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {a.isOverride ? (
                          <div className="font-mono text-[10px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-1 rounded border border-amber-200 dark:border-amber-800/50">
                            Basic: {a.customBasicPct || 55}% · HRA: {a.customHraPct || 45}%
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Standard Role Structure</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <div className="flex items-center justify-end gap-1.5">
                            {a.isOverride ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleResetToRoleDefault(a.id)}
                              >
                                Reset
                              </Button>
                            ) : null}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedEmployeeForOverride(a);
                                setOverrideBasicPct(a.customBasicPct || 55);
                                setOverrideHraPct(a.customHraPct || 45);
                                setOverrideReason(a.overrideReason || '');
                                setIsOverrideModalOpen(true);
                              }}
                            >
                              {a.isOverride ? 'Edit Override' : 'Customize Override'}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* TAB 3: PAY COMPONENT DIRECTORY */}
          <TabsContent value="components_catalog" className="space-y-4 mt-3">
            <Card>
              <CardHeader className="p-4">
                <CardTitle className="text-xs font-bold">
                  Statutory & Enterprise Salary Component Master Registry
                </CardTitle>
                <CardDescription className="mt-0.5">
                  Defines taxable status, calculation mechanisms, and statutory legal backing under
                  Indian Labour Acts.
                </CardDescription>
              </CardHeader>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {componentsFixture.statutoryComponents.map((comp) => (
                <Card key={comp.id} className="flex flex-col justify-between">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{comp.name}</span>
                      <Badge variant="success">STATUTORY</Badge>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{comp.code}</div>
                    <CardDescription className="mt-2 text-xs">{comp.description}</CardDescription>
                  </CardHeader>

                  <div className="p-4 pt-2">
                    <div className="text-[10px] space-y-1">
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Legal Act:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {comp.statutoryActs[0] || 'Code on Wages, 2019'}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Tax Treatment:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {comp.taxability}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: ADD CUSTOM ALLOWANCE / DEDUCTION (Shadcn Dialog)
         ══════════════════════════════════════════════════════════════════════════ */}
      {isAddComponentModalOpen && (
        <Dialog open={isAddComponentModalOpen} onOpenChange={setIsAddComponentModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Add {addCategory === 'EARNING' ? 'Allowance / Pay Component' : 'Custom Deduction'}
              </DialogTitle>
              <DialogDescription>
                Define calculation method and value for this salary component.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-3">
              <div className="space-y-1">
                <Label>Component Name</Label>
                <Input
                  type="text"
                  placeholder={
                    addCategory === 'EARNING'
                      ? 'e.g. Shift Allowance'
                      : 'e.g. Health Insurance Premium'
                  }
                  value={newCompName}
                  onChange={(e) => setNewCompName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Calculation Method</Label>
                  <Select
                    value={newCompCalcType}
                    onChange={(e) => setNewCompCalcType(parseCalculationType(e.target.value))}
                  >
                    <option value="PERCENTAGE_OF_BASIC">% of Basic Salary</option>
                    <option value="PERCENTAGE_OF_CTC">% of Total CTC</option>
                    <option value="FIXED">Fixed Monthly Amount (₹)</option>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Value ({newCompCalcType === 'FIXED' ? '₹ / mo' : '%'})</Label>
                  <Input
                    type="number"
                    value={newCompValue}
                    onChange={(e) => setNewCompValue(Number(e.target.value))}
                    className="font-mono font-bold text-xs"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsAddComponentModalOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddNewComponent} disabled={!newCompName.trim()}>
                Add Component
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: CUSTOMIZE INDIVIDUAL EMPLOYEE OVERRIDE (Shadcn Dialog)
         ══════════════════════════════════════════════════════════════════════════ */}
      {isOverrideModalOpen && selectedEmployeeForOverride && (
        <Dialog open={isOverrideModalOpen} onOpenChange={setIsOverrideModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Customize Compensation Override</DialogTitle>
              <DialogDescription>
                {selectedEmployeeForOverride.employeeName} (
                {selectedEmployeeForOverride.employeeNumber})
              </DialogDescription>
            </DialogHeader>

            {/* Inheritance Badge */}
            <div className="p-2.5 bg-sky-50 dark:bg-card rounded-md border border-sky-200 dark:border-sky-800/60 text-xs text-sky-900 dark:text-sky-300">
              <span className="font-bold">Inherited Base Template: </span>
              <span>
                {selectedEmployeeForOverride.jobTitle} Standard Structure (50% Basic / 40% HRA)
              </span>
            </div>

            {/* Override Inputs */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Custom Basic Salary (% of CTC)</Label>
                  <Input
                    type="number"
                    value={overrideBasicPct}
                    onChange={(e) => setOverrideBasicPct(Number(e.target.value))}
                    className="font-mono font-bold text-xs"
                  />
                  <span className="text-[10px] text-slate-400">Standard: 50%</span>
                </div>
                <div className="space-y-1">
                  <Label>Custom HRA (% of Basic)</Label>
                  <Input
                    type="number"
                    value={overrideHraPct}
                    onChange={(e) => setOverrideHraPct(Number(e.target.value))}
                    className="font-mono font-bold text-xs"
                  />
                  <span className="text-[10px] text-slate-400">Standard: 40%</span>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Reason for Individual Override (Audit Trail)</Label>
                <Textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Executive compensation agreement approved by VP of HR"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOverrideModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveOverride}>Apply Custom Override</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: OFFICIAL PAYSLIP PREVIEW & DOCUMENT STATEMENT
         ══════════════════════════════════════════════════════════════════════════ */}
      {previewPayslipData && (
        <PayslipDocumentModal
          isOpen={Boolean(previewPayslipData)}
          onClose={() => setPreviewPayslipData(null)}
          payslip={previewPayslipData}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: OFFICIAL SALARY STRUCTURE STATEMENT / ANNEXURE
         ══════════════════════════════════════════════════════════════════════════ */}
      {previewStructureDocData && (
        <SalaryStructureDocumentModal
          isOpen={Boolean(previewStructureDocData)}
          onClose={() => setPreviewStructureDocData(null)}
          data={previewStructureDocData}
        />
      )}
    </div>
  );
}
