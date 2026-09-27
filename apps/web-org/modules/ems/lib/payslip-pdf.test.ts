import { describe, expect, it } from 'vitest';
import type { Payslip } from '@smarteam/contracts';
import { payslipPdf } from './payslip-pdf';
import { annualStatementPdf } from './annual-statement-pdf';
import { fileSafe, pdfMoney } from './pdf-kit';

const slip: Payslip = {
  id: '00000000-0000-4000-8000-000000000001',
  employeeId: '00000000-0000-4000-8000-000000000002',
  employeeNumber: 'EMP-001',
  employeeName: 'Asha Rao',
  organizationName: 'Northwind Traders',
  status: 'ISSUED',
  issuedAt: '2026-09-21T10:00:00.000Z',
  run: {
    id: '00000000-0000-4000-8000-000000000003',
    periodStart: '2026-09-01T00:00:00.000Z',
    periodEnd: '2026-09-30T00:00:00.000Z',
    status: 'RELEASED',
    currencyCode: 'INR',
  },
  totals: { grossAmount: 40000, deductionAmount: 1800, netAmount: 38200 },
  components: [
    { componentCode: 'BASIC', componentName: 'Basic', componentType: 'EARNING', amount: 25000 },
    { componentCode: 'HRA', componentName: 'House rent', componentType: 'EARNING', amount: 15000 },
    {
      componentCode: 'PF',
      componentName: 'Provident fund',
      componentType: 'DEDUCTION',
      amount: 1800,
    },
  ],
};

/** The PDF's drawn text, as jsPDF writes it uncompressed into the page streams. */
const textOf = async (made: Promise<{ output: (type: 'arraybuffer') => ArrayBuffer }>) =>
  new TextDecoder('latin1').decode((await made).output('arraybuffer'));

describe('payslip PDF', () => {
  it('is a real PDF naming the employer, the person and the period', async () => {
    const pdf = await textOf(payslipPdf(slip));
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toContain('Northwind Traders');
    expect(pdf).toContain('Asha Rao');
    expect(pdf).toContain('EMP-001');
  });
  it('lists earnings, deductions and net pay with the currency written out', async () => {
    const pdf = await textOf(payslipPdf(slip));
    expect(pdf).toContain('House rent');
    expect(pdf).toContain('Provident fund');
    expect(pdf).toContain('Net pay');
    expect(pdf).toContain('INR 38,200.00');
  });
  it('says so when the breakdown is withheld', async () => {
    expect(await textOf(payslipPdf({ ...slip, components: [] }))).toContain('does not publish');
  });
});

describe('annual statement PDF', () => {
  const statement = {
    employee: { name: 'Asha Rao', employeeNumber: 'EMP-001', pan: null },
    financialYear: '2026-27',
    months: [
      {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        gross: 40000,
        providentFund: 1800,
        esic: 0,
        professionalTax: 200,
        taxDeducted: 0,
        totalDeductions: 2000,
        net: 38000,
      },
    ],
    totals: {
      gross: 40000,
      providentFund: 1800,
      esic: 0,
      professionalTax: 200,
      taxDeducted: 0,
      totalDeductions: 2000,
      net: 38000,
    },
  };
  it('carries the year, the person and the totals', async () => {
    const pdf = await textOf(annualStatementPdf(statement, 'Northwind Traders'));
    expect(pdf).toContain('FY 2026-27');
    expect(pdf).toContain('Not recorded');
    expect(pdf).toContain('INR 40,000.00');
  });
  it('says when the year has no released payslips', async () => {
    const pdf = await textOf(annualStatementPdf({ ...statement, months: [] }, 'Northwind Traders'));
    expect(pdf).toContain('No released payslips');
  });
});

describe('pdf helpers', () => {
  it('writes money with the currency code the PDF font can print', () => {
    expect(pdfMoney(38200)).toBe('INR 38,200.00');
  });
  it('makes file names every device accepts', () => {
    expect(fileSafe('2026-09 Asha Rao/EMP 1')).toBe('2026-09_Asha_Rao_EMP_1');
  });
});
