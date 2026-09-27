import { formatDate, formatDateRange, type Payslip } from '@smarteam/contracts';
import {
  BRAND,
  INK,
  MUTED,
  RULE,
  TINT,
  fileSafe,
  label,
  newDocument,
  pdfMoney,
  rule,
  saveDocument,
  value,
} from './pdf-kit';

/** One A4 payslip, drawn from the released payroll run's line item and nothing else. */
export async function payslipPdf(payslip: Payslip) {
  const doc = await newDocument();
  const currency = payslip.run.currencyCode ?? 'INR';
  const money = (amount: number) => pdfMoney(amount, currency);
  const left = 40;
  const right = 555;
  let y = 48;

  // Header: who pays, and for which period.
  label(doc, 'Payslip', left, y);
  label(doc, 'Pay period', right, y, 'right');
  y += 18;
  value(doc, payslip.organizationName || 'Payslip', left, y, {
    bold: true,
    size: 16,
    maxWidth: 300,
  });
  value(doc, formatDateRange(payslip.run.periodStart, payslip.run.periodEnd), right, y, {
    bold: true,
    size: 11,
    align: 'right',
  });
  y += 14;
  rule(doc, left, y, right, BRAND, 1.5);
  y += 24;

  // Who it is for.
  const meta: Array<[string, string]> = [
    ['Employee', payslip.employeeName ?? '—'],
    ['Employee no.', payslip.employeeNumber ?? '—'],
    ['Issued', formatDate(payslip.issuedAt) || '—'],
  ];
  const cell = (right - left - 16) / 3;
  meta.forEach(([name, text], index) => {
    const x = left + index * (cell + 8);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y - 14, cell, 38, 4, 4, 'S');
    label(doc, name, x + 10, y);
    value(doc, text, x + 10, y + 14, { bold: true, maxWidth: cell - 20 });
  });
  y += 50;

  if (payslip.components.length === 0) {
    value(
      doc,
      'Your organisation does not publish the line-by-line breakdown on payslips.',
      left,
      y,
    );
    y += 24;
  } else {
    const earnings = payslip.components.filter((item) => item.componentType === 'EARNING');
    const deductions = payslip.components.filter((item) => item.componentType === 'DEDUCTION');
    const width = (right - left - 20) / 2;
    const bottom = Math.max(
      table(
        doc,
        left,
        y,
        width,
        'Earnings',
        earnings,
        'Gross earnings',
        payslip.totals.grossAmount,
        money,
      ),
      table(
        doc,
        left + width + 20,
        y,
        width,
        'Deductions',
        deductions,
        'Total deductions',
        payslip.totals.deductionAmount,
        money,
      ),
    );
    y = bottom + 20;
  }

  // Net pay, the figure people look for first.
  doc.setFillColor(...TINT);
  doc.roundedRect(left, y, right - left, 40, 4, 4, 'F');
  value(doc, 'Net pay', left + 14, y + 25, { size: 11 });
  value(doc, money(payslip.totals.netAmount), right - 14, y + 26, {
    bold: true,
    size: 15,
    align: 'right',
  });
  y += 64;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    'This payslip is generated from the released payroll run and needs no signature.',
    left,
    y,
  );
  return doc;
}

type Line = Payslip['components'][number];

/** One column of the payslip; returns where it ends. */
function table(
  doc: Awaited<ReturnType<typeof newDocument>>,
  x: number,
  top: number,
  width: number,
  title: string,
  items: Line[],
  totalLabel: string,
  total: number,
  money: (amount: number) => string,
) {
  const end = x + width;
  let y = top;
  label(doc, title, x, y);
  label(doc, 'Amount', end, y, 'right');
  y += 6;
  rule(doc, x, y, end);
  y += 14;
  if (items.length === 0) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(9.5);
    doc.text('None', x, y);
    y += 8;
    rule(doc, x, y, end);
    y += 14;
  }
  for (const item of items) {
    const amount = money(item.amount);
    doc.setFontSize(9.5);
    const nameWidth = width - doc.getTextWidth(amount) - 12;
    const lines = doc.splitTextToSize(item.componentName, nameWidth) as string[];
    value(doc, lines.join('\n'), x, y);
    value(doc, amount, end, y, { align: 'right' });
    y += lines.length * 11.5 - 3.5;
    rule(doc, x, y, end);
    y += 14;
  }
  rule(doc, x, y - 14, end, INK, 0.9);
  value(doc, totalLabel, x, y + 2, { bold: true });
  value(doc, money(total), end, y + 2, { bold: true, align: 'right' });
  return y + 2;
}

/** Saves the payslip to the device as a PDF file. */
export async function downloadPayslipPdf(payslip: Payslip) {
  const doc = await payslipPdf(payslip);
  const month = payslip.run.periodStart.slice(0, 7);
  saveDocument(
    doc,
    `Payslip_${fileSafe([month, payslip.employeeNumber ?? payslip.employeeName ?? ''].join('_'))}.pdf`,
  );
}
