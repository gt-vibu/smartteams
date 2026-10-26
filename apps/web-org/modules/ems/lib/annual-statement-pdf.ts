import { formatDateRange } from '@smarteam/contracts';
import {
  BRAND,
  INK,
  MUTED,
  fileSafe,
  label,
  newDocument,
  pdfMoney,
  rule,
  saveDocument,
  value,
} from './pdf-kit';

export type AnnualStatement = {
  employee: { name: string; employeeNumber: string; pan: string | null };
  financialYear: string;
  months: Array<{
    periodStart: string;
    periodEnd: string;
    gross: number;
    providentFund: number;
    esic: number;
    professionalTax: number;
    taxDeducted: number;
    totalDeductions: number;
    net: number;
  }>;
  totals: Record<
    | 'gross'
    | 'providentFund'
    | 'esic'
    | 'professionalTax'
    | 'taxDeducted'
    | 'totalDeductions'
    | 'net',
    number
  >;
};

type Figures = Omit<AnnualStatement['months'][number], 'periodStart' | 'periodEnd'>;

const COLUMNS: Array<[string, keyof Figures]> = [
  ['Gross', 'gross'],
  ['PF', 'providentFund'],
  ['ESIC', 'esic'],
  ['Prof. tax', 'professionalTax'],
  ['TDS', 'taxDeducted'],
  ['Net', 'net'],
];

/**
 * A year's salary and deductions on landscape A4 — what Part B of Form 16 is prepared from.
 * It says plainly that Part A, the TDS certificate, comes from the income-tax portal.
 */
export async function annualStatementPdf(statement: AnnualStatement, employer: string) {
  const doc = await newDocument('landscape');
  const left = 40;
  const right = 802;
  const bottomMargin = 555;
  const first = 200;
  const step = (right - left - first) / COLUMNS.length;
  const columnEnd = (index: number) => left + first + step * (index + 1);
  let y = 46;

  label(doc, employer || 'Annual salary statement', left, y);
  y += 20;
  value(doc, `Annual salary statement · FY ${statement.financialYear}`, left, y, {
    bold: true,
    size: 16,
  });
  y += 12;
  rule(doc, left, y, right, BRAND, 1.5);
  y += 22;

  const meta: Array<[string, string]> = [
    ['Employee', statement.employee.name],
    ['Employee no.', statement.employee.employeeNumber],
    ['PAN', statement.employee.pan ?? 'Not recorded'],
  ];
  meta.forEach(([name, text], index) => {
    label(doc, name, left + index * 200, y);
    value(doc, text, left + index * 200, y + 14, { bold: true, maxWidth: 190 });
  });
  y += 42;

  const header = () => {
    label(doc, 'Month', left, y);
    COLUMNS.forEach(([name], index) => label(doc, name, columnEnd(index), y, 'right'));
    y += 6;
    rule(doc, left, y, right);
    y += 15;
  };
  const row = (name: string, figures: Figures, bold = false) => {
    value(doc, name, left, y, { bold, size: 9 });
    COLUMNS.forEach(([, key], index) =>
      value(doc, pdfMoney(figures[key]), columnEnd(index), y, { bold, size: 9, align: 'right' }),
    );
  };

  if (statement.months.length === 0) {
    value(doc, 'No released payslips in this financial year.', left, y);
    y += 24;
  } else {
    header();
    for (const month of statement.months) {
      if (y > bottomMargin - 60) {
        doc.addPage();
        y = 46;
        header();
      }
      row(formatDateRange(month.periodStart, month.periodEnd), month);
      y += 6;
      rule(doc, left, y, right);
      y += 15;
    }
    rule(doc, left, y - 15, right, INK, 0.9);
    row('Total', statement.totals, true);
    y += 30;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    doc.splitTextToSize(
      "Prepared from released payslips, for Part B of Form 16. Part A — the certificate of tax deducted — is issued through the income-tax department's TRACES portal.",
      right - left,
    ) as string[],
    left,
    Math.min(y, bottomMargin),
  );
  return doc;
}

/** Saves the statement to the device as a PDF file. */
export async function downloadAnnualStatementPdf(statement: AnnualStatement, employer: string) {
  const doc = await annualStatementPdf(statement, employer);
  saveDocument(
    doc,
    `Annual_statement_FY${fileSafe(statement.financialYear)}_${fileSafe(statement.employee.employeeNumber)}.pdf`,
  );
}
