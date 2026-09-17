import type { Employee, SalaryProfile } from '@smarteam/contracts';

export interface SalaryStructureExportOptions {
  orgName?: string;
  organizationName?: string;
  organizationSlug?: string;
  branchName?: string;
  employee?: Employee | null;
  profile: SalaryProfile;
}

const formatPdfMoney = (amount: number) => {
  return `INR ${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/** Printed wherever a value was never recorded, instead of a plausible-looking invented one. */
const NOT_RECORDED = 'Not recorded';

/**
 * Directly downloads the official Compensation & Salary Structure Annexure as a PDF file,
 * without any print preview or popup windows.
 *
 * jsPDF is loaded on first use, so the payroll screen does not carry a PDF library for people
 * who never download one. Anything the record does not hold prints as "Not recorded": this is an
 * official document, and a made-up company, branch or employee number on it would be a false one.
 */
export async function downloadSalaryStructurePdf(options: SalaryStructureExportOptions) {
  const { jsPDF } = await import('jspdf');
  const { orgName, organizationName, branchName, employee, profile } = options;
  const resolvedOrgName = orgName || organizationName || NOT_RECORDED;
  const { salaryBreakdown, compensation, employeePolicy } = profile;

  const employeeName = employee ? `${employee.firstName} ${employee.lastName}`.trim() : 'Employee';
  const employeeId = employee?.employeeNumber || NOT_RECORDED;
  const email = employee?.workEmail || '—';
  const designation = employee?.employmentType
    ? employee.employmentType.replace(/_/g, ' ')
    : NOT_RECORDED;
  const effectiveDate = compensation?.effectiveFrom
    ? compensation.effectiveFrom.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const generationDate = new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const monthlyGross = salaryBreakdown.gross;
  const monthlyBenefits = salaryBreakdown.totalEmployerBenefits;
  const monthlyCtc = monthlyGross + monthlyBenefits;
  const annualCtc = monthlyCtc * 12;
  const monthlyDeductions = salaryBreakdown.totalDeductions;
  const netTakeHome = salaryBreakdown.netPay;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = 38;

  // 1. Top Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(resolvedOrgName.toUpperCase(), 40, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('COMPENSATION & SALARY STRUCTURE ANNEXURE', 40, y + 14);
  doc.text(`Date: ${generationDate}`, 555, y, { align: 'right' });
  doc.text(
    `Branch: ${branchName || NOT_RECORDED} · Jurisdiction: ${employeePolicy?.statutoryJurisdiction || NOT_RECORDED}`,
    555,
    y + 12,
    { align: 'right' },
  );
  y += 24;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.5);
  doc.line(40, y, 555, y);
  y += 12;

  // 2. Employee Metadata Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.75);
  doc.roundedRect(40, y, 515, 46, 4, 4, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Employee Name: ${employeeName}`, 50, y + 14);
  doc.text(`Employee ID: ${employeeId}`, 50, y + 27);
  doc.text(`Email: ${email}`, 50, y + 40);

  doc.text(`Employment Type: ${designation}`, 310, y + 14);
  doc.text(`Effective From: ${effectiveDate}`, 310, y + 27);
  doc.text('Currency: INR (₹)', 310, y + 40);
  y += 56;

  // 3. KPI Summary Cards (Annual CTC, Monthly CTC, Monthly Gross, Net Take-Home)
  const kpis = [
    {
      label: 'ANNUAL CTC',
      val: formatPdfMoney(annualCtc),
      bg: [239, 246, 255] as const,
      border: [191, 219, 254] as const,
      txt: [30, 64, 175] as const,
    },
    {
      label: 'MONTHLY CTC',
      val: formatPdfMoney(monthlyCtc),
      bg: [241, 245, 249] as const,
      border: [203, 213, 225] as const,
      txt: [15, 23, 42] as const,
    },
    {
      label: 'MONTHLY GROSS',
      val: formatPdfMoney(monthlyGross),
      bg: [241, 245, 249] as const,
      border: [203, 213, 225] as const,
      txt: [15, 23, 42] as const,
    },
    {
      label: 'NET TAKE-HOME',
      val: formatPdfMoney(netTakeHome),
      bg: [236, 253, 245] as const,
      border: [167, 243, 208] as const,
      txt: [6, 95, 70] as const,
    },
  ];
  const cardW = (515 - 3 * 8) / 4;
  kpis.forEach((kpi, i) => {
    const x = 40 + i * (cardW + 8);
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.setDrawColor(kpi.border[0], kpi.border[1], kpi.border[2]);
    doc.roundedRect(x, y, cardW, 34, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(kpi.txt[0], kpi.txt[1], kpi.txt[2]);
    doc.text(kpi.label, x + cardW / 2, y + 11, { align: 'center' });
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.val, x + cardW / 2, y + 25, { align: 'center' });
  });
  y += 44;

  // Helper to render tabular breakdown
  const renderTableSection = (
    title: string,
    items: Array<{ name: string; amount: number; reason?: string | null }>,
    totalLabel: string,
    totalMonthly: number,
    totalAnnual: number,
    isDeduction = false,
  ) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(title, 40, y);
    y += 5;

    // Header
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.rect(40, y, 515, 16, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('COMPONENT NAME', 48, y + 11);
    doc.text('MONTHLY', 420, y + 11, { align: 'right' });
    doc.text('ANNUAL', 545, y + 11, { align: 'right' });
    y += 16;

    // Rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (items.length === 0) {
      doc.setDrawColor(226, 232, 240);
      doc.line(40, y + 15, 555, y + 15);
      doc.setTextColor(100, 116, 139);
      doc.text('None applicable.', 48, y + 11);
      y += 15;
    } else {
      items.forEach((item) => {
        doc.setDrawColor(226, 232, 240);
        doc.line(40, y + 15, 555, y + 15);
        doc.setTextColor(30, 41, 59);
        const nameText = item.reason ? `${item.name} (${item.reason})` : item.name;
        doc.text(nameText, 48, y + 11);
        doc.setTextColor(isDeduction ? 185 : 30, isDeduction ? 28 : 41, isDeduction ? 28 : 59);
        const prefix = isDeduction ? '-' : '';
        doc.text(`${prefix}${formatPdfMoney(item.amount)}`, 420, y + 11, { align: 'right' });
        doc.text(`${prefix}${formatPdfMoney(item.amount * 12)}`, 545, y + 11, { align: 'right' });
        y += 15;
      });
    }

    // Total Row
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.rect(40, y, 515, 16, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isDeduction ? 185 : 15, isDeduction ? 28 : 23, isDeduction ? 28 : 42);
    doc.text(totalLabel, 48, y + 11);
    const totalPrefix = isDeduction ? '-' : '';
    doc.text(`${totalPrefix}${formatPdfMoney(totalMonthly)}`, 420, y + 11, { align: 'right' });
    doc.text(`${totalPrefix}${formatPdfMoney(totalAnnual)}`, 545, y + 11, { align: 'right' });
    y += 24;
  };

  // Section 1: Earnings Components
  renderTableSection(
    '1. Earnings Components',
    salaryBreakdown.earnings,
    'Total Gross Earnings (A)',
    monthlyGross,
    monthlyGross * 12,
  );

  // Section 2: Employee Deductions
  renderTableSection(
    '2. Employee Statutory Deductions',
    salaryBreakdown.deductions.map((d) => ({
      name: d.name,
      amount: d.amount,
      reason: d.eligible === false ? d.reason : null,
    })),
    'Total Deductions (B)',
    monthlyDeductions,
    monthlyDeductions * 12,
    true,
  );

  // Section 3: Employer Contributions & Retirals
  renderTableSection(
    '3. Employer Contributions & Retirals',
    salaryBreakdown.employerBenefits,
    'Total Employer Contributions (C)',
    monthlyBenefits,
    monthlyBenefits * 12,
  );

  // Net Take-Home Highlight
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1);
  doc.roundedRect(40, y, 515, 32, 4, 4, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('NET MONTHLY IN-HAND / TAKE-HOME PAY (A - B)', 50, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Subject to applicable income tax (TDS) and individual declarations', 50, y + 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(formatPdfMoney(netTakeHome), 545, y + 20, { align: 'right' });
  y += 42;

  // Footer
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(40, y, 555, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `This is an official system-generated compensation schedule issued by ${resolvedOrgName}. Confidential · Smarteam`,
    40,
    y + 10,
  );

  // Direct download
  const safeEmployeeName = employeeName.replace(/\s+/g, '_');
  doc.save(`Salary_Structure_${employee?.employeeNumber || 'employee'}_${safeEmployeeName}.pdf`);
}

/** Legacy alias for backwards compatibility */
export const openSalaryStructurePrintView = downloadSalaryStructurePdf;

/**
 * Downloads a structured CSV spreadsheet of the complete salary structure.
 */
export function downloadSalaryStructureCsv(options: SalaryStructureExportOptions) {
  const { employee, profile } = options;
  const { salaryBreakdown } = profile;

  const employeeName = employee ? `${employee.firstName} ${employee.lastName}`.trim() : 'Employee';
  const employeeId = employee?.employeeNumber || 'employee';

  const rows: string[][] = [
    ['Category', 'Component Code', 'Component Name', 'Monthly Amount (INR)', 'Annual Amount (INR)'],
  ];

  salaryBreakdown.earnings.forEach((e) => {
    rows.push(['Earnings', e.code, `"${e.name}"`, String(e.amount), String(e.amount * 12)]);
  });
  rows.push([
    'Total Gross',
    'GROSS',
    '"Gross Salary"',
    String(salaryBreakdown.gross),
    String(salaryBreakdown.gross * 12),
  ]);

  salaryBreakdown.deductions.forEach((d) => {
    rows.push(['Deduction', d.code, `"${d.name}"`, String(-d.amount), String(-d.amount * 12)]);
  });
  rows.push([
    'Total Deductions',
    'DEDUCTIONS',
    '"Total Deductions"',
    String(-salaryBreakdown.totalDeductions),
    String(-salaryBreakdown.totalDeductions * 12),
  ]);

  salaryBreakdown.employerBenefits.forEach((b) => {
    rows.push(['Employer Benefit', b.code, `"${b.name}"`, String(b.amount), String(b.amount * 12)]);
  });
  rows.push([
    'Total Employer Benefits',
    'BENEFITS',
    '"Employer Retirals"',
    String(salaryBreakdown.totalEmployerBenefits),
    String(salaryBreakdown.totalEmployerBenefits * 12),
  ]);

  const monthlyCtc = salaryBreakdown.gross + salaryBreakdown.totalEmployerBenefits;
  rows.push([
    'Cost to Company',
    'CTC',
    '"Total Cost to Company (CTC)"',
    String(monthlyCtc),
    String(monthlyCtc * 12),
  ]);
  rows.push([
    'Net Pay',
    'NET_PAY',
    '"Net In-Hand Take-Home"',
    String(salaryBreakdown.netPay),
    String(salaryBreakdown.netPay * 12),
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute(
    'download',
    `Salary_Structure_${employeeId}_${employeeName.replace(/\s+/g, '_')}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
