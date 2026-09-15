import { formatMoney, type Employee, type SalaryProfile } from '@smarteam/contracts';

export interface SalaryStructureExportOptions {
  orgName?: string;
  organizationName?: string;
  organizationSlug?: string;
  branchName?: string;
  employee?: Employee | null;
  profile: SalaryProfile;
}

/**
 * Generates an official, printable Compensation & Salary Structure Annexure (PDF / Print view).
 */
export function openSalaryStructurePrintView(options: SalaryStructureExportOptions) {
  const { orgName, organizationName, branchName = 'Corporate HQ', employee, profile } = options;
  const resolvedOrgName = orgName || organizationName || 'SmarTeam Technologies';
  const { salaryBreakdown, compensation, employeePolicy } = profile;

  const employeeName = employee ? `${employee.firstName} ${employee.lastName}`.trim() : 'Employee';
  const employeeId = employee?.employeeNumber || '—';
  const email = employee?.workEmail || '—';
  const designation = employee?.employmentType
    ? employee.employmentType.replace(/_/g, ' ')
    : 'Full Time Employee';
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

  const earningsRows = salaryBreakdown.earnings
    .map(
      (e) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${e.name}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace;">${formatMoney(e.amount)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace;">${formatMoney(e.amount * 12)}</td>
      </tr>
    `,
    )
    .join('');

  const deductionRows = salaryBreakdown.deductions
    .map(
      (d) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${d.name} ${d.eligible === false && d.reason ? `<span style="font-size: 10px; color: #64748b;">(${d.reason})</span>` : ''}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; color: #b91c1c;">-${formatMoney(d.amount)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; color: #b91c1c;">-${formatMoney(d.amount * 12)}</td>
      </tr>
    `,
    )
    .join('');

  const employerRows = salaryBreakdown.employerBenefits
    .map(
      (b) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${b.name}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace;">${formatMoney(b.amount)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace;">${formatMoney(b.amount * 12)}</td>
      </tr>
    `,
    )
    .join('');

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Salary Structure - ${employeeName} (${employeeId})</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; line-height: 1.4; }
    .container { max-width: 800px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
    .org-title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .doc-title { font-size: 13px; font-weight: 700; color: #475569; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
    .meta-grid { display: grid; grid-template-cols: 1fr 1fr; grid-gap: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px; font-size: 12px; }
    .kpi-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
    .kpi-card { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; text-align: center; }
    .kpi-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
    .kpi-value { font-size: 14px; font-weight: 800; font-family: monospace; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
    th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 2px solid #cbd5e1; }
    .section-title { font-size: 13px; font-weight: 700; color: #0f172a; margin: 16px 0 8px 0; display: flex; justify-content: space-between; align-items: center; }
    .total-row { background: #f8fafc; font-weight: 700; border-top: 2px solid #cbd5e1; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 0; }
      .container { border: none; box-shadow: none; padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="max-width: 800px; margin: 0 auto 16px auto; display: flex; justify-content: flex-end; gap: 8px;">
    <button onclick="window.print()" style="background: #0f172a; color: #fff; border: none; padding: 8px 16px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer;">Print / Save as PDF</button>
    <button onclick="window.close()" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 8px 16px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer;">Close</button>
  </div>

  <div class="container">
    <div class="header">
      <div>
        <h1 class="org-title">${resolvedOrgName}</h1>
        <div class="doc-title">Compensation & Salary Structure Annexure</div>
      </div>
      <div style="text-align: right; font-size: 11px; color: #64748b;">
        <div>Branch: <strong>${branchName}</strong></div>
        <div>Date Generated: <strong>${generationDate}</strong></div>
        <div>Jurisdiction: <strong>${employeePolicy?.statutoryJurisdiction || 'India'}</strong></div>
      </div>
    </div>

    <div class="meta-grid">
      <div>
        <div>Employee Name: <strong>${employeeName}</strong></div>
        <div>Employee ID: <strong>${employeeId}</strong></div>
        <div>Email: <strong>${email}</strong></div>
      </div>
      <div>
        <div>Employment Type: <strong style="text-transform: capitalize;">${designation}</strong></div>
        <div>Effective From: <strong>${effectiveDate}</strong></div>
        <div>Currency: <strong>INR (₹)</strong></div>
      </div>
    </div>

    <div class="kpi-cards">
      <div class="kpi-card" style="background: #eff6ff; border-color: #bfdbfe;">
        <div class="kpi-title" style="color: #1e40af;">Annual CTC</div>
        <div class="kpi-value" style="color: #1e3a8a;">${formatMoney(annualCtc)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Monthly CTC</div>
        <div class="kpi-value">${formatMoney(monthlyCtc)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Monthly Gross</div>
        <div class="kpi-value">${formatMoney(monthlyGross)}</div>
      </div>
      <div class="kpi-card" style="background: #ecfdf5; border-color: #a7f3d0;">
        <div class="kpi-title" style="color: #065f46;">Net Take-Home</div>
        <div class="kpi-value" style="color: #064e3b;">${formatMoney(netTakeHome)}</div>
      </div>
    </div>

    <!-- 1. Earnings Breakdown -->
    <div class="section-title">
      <span>1. Earnings Components</span>
      <span style="font-size: 11px; font-family: monospace;">Monthly: ${formatMoney(monthlyGross)} | Annual: ${formatMoney(monthlyGross * 12)}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Component Name</th>
          <th style="text-align: right;">Monthly (₹)</th>
          <th style="text-align: right;">Annual (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${earningsRows}
        <tr class="total-row">
          <td style="padding: 8px 12px;">Total Gross Earnings (A)</td>
          <td style="padding: 8px 12px; text-align: right; font-family: monospace;">${formatMoney(monthlyGross)}</td>
          <td style="padding: 8px 12px; text-align: right; font-family: monospace;">${formatMoney(monthlyGross * 12)}</td>
        </tr>
      </tbody>
    </table>

    <!-- 2. Employee Deductions -->
    <div class="section-title">
      <span>2. Employee Statutory Deductions</span>
      <span style="font-size: 11px; font-family: monospace; color: #b91c1c;">Monthly: -${formatMoney(monthlyDeductions)} | Annual: -${formatMoney(monthlyDeductions * 12)}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Deduction Item</th>
          <th style="text-align: right;">Monthly (₹)</th>
          <th style="text-align: right;">Annual (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${deductionRows || '<tr><td colspan="3" style="padding: 8px 12px; color: #64748b;">No employee deductions applicable.</td></tr>'}
        <tr class="total-row">
          <td style="padding: 8px 12px;">Total Deductions (B)</td>
          <td style="padding: 8px 12px; text-align: right; font-family: monospace; color: #b91c1c;">-${formatMoney(monthlyDeductions)}</td>
          <td style="padding: 8px 12px; text-align: right; font-family: monospace; color: #b91c1c;">-${formatMoney(monthlyDeductions * 12)}</td>
        </tr>
      </tbody>
    </table>

    <!-- 3. Employer Benefits & CTC -->
    <div class="section-title">
      <span>3. Employer Contributions & Retirals (CTC Components)</span>
      <span style="font-size: 11px; font-family: monospace;">Monthly: ${formatMoney(monthlyBenefits)} | Annual: ${formatMoney(monthlyBenefits * 12)}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Employer Contribution</th>
          <th style="text-align: right;">Monthly (₹)</th>
          <th style="text-align: right;">Annual (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${employerRows || '<tr><td colspan="3" style="padding: 8px 12px; color: #64748b;">No employer contributions applicable.</td></tr>'}
        <tr class="total-row">
          <td style="padding: 8px 12px;">Total Employer Contributions (C)</td>
          <td style="padding: 8px 12px; text-align: right; font-family: monospace;">${formatMoney(monthlyBenefits)}</td>
          <td style="padding: 8px 12px; text-align: right; font-family: monospace;">${formatMoney(monthlyBenefits * 12)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Net In-Hand Summary -->
    <div style="background: #f8fafc; border: 2px solid #0f172a; border-radius: 6px; padding: 12px 16px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-size: 13px; font-weight: 800; text-transform: uppercase;">Net Monthly In-Hand / Take-Home Pay (A - B)</div>
        <div style="font-size: 11px; color: #64748b;">Subject to applicable income tax (TDS) and individual investment declarations.</div>
      </div>
      <div style="font-size: 18px; font-weight: 900; font-family: monospace; color: #0f172a;">${formatMoney(netTakeHome)}</div>
    </div>

    <div class="footer">
      <div>This is a system-generated compensation schedule issued by ${resolvedOrgName}.</div>
      <div>Confidential · SmarTeam HRMS</div>
    </div>
  </div>
</body>
</html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
}

/**
 * Downloads a structured CSV spreadsheet of the complete salary structure.
 */
export function downloadSalaryStructureCsv(options: SalaryStructureExportOptions) {
  const { employee, profile } = options;
  const { salaryBreakdown } = profile;

  const employeeName = employee ? `${employee.firstName} ${employee.lastName}`.trim() : 'Employee';
  const employeeId = employee?.employeeNumber || 'EMP';

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
