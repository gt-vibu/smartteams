import type { StatutoryRule } from '@smarteam/contracts';

export type StatutoryPreset = {
  key: string;
  label: string;
  jurisdiction: string;
  effectiveFrom: string;
  employeeRate?: number;
  employerRate?: number;
  wageCeiling?: number;
  employeeThreshold?: number;
  slabs?: Array<{
    min: number;
    max: number | null;
    amount: number;
    monthOverrides?: Record<string, number>;
  }>;
  salaryBasis?: 'MONTHLY' | 'ANNUAL' | 'HALF_YEARLY';
  amountBasis?: 'MONTHLY' | 'ANNUAL' | 'HALF_YEARLY';
  sourceLabel: string;
  sourceUrl: string;
  note: string;
};

export type ProfessionalTaxCoverage = {
  jurisdiction: (typeof INDIA_PAYROLL_JURISDICTIONS)[number];
  status: 'AUTO_SCHEDULE' | 'LOCAL_BODY_REQUIRED' | 'ADMIN_REVIEW_REQUIRED';
  detail: string;
  sourceUrl?: string;
};

/** India payroll jurisdictions offered by the organization defaults selector. */
export const INDIA_PAYROLL_JURISDICTIONS = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

/**
 * State PT presets transcribed from government schedules. Where a law defines annual income/tax,
 * the calculator stores the statutory annual bands and accrues the tax over 12 payroll periods.
 * Always show the cited source and effective date so an administrator can verify before saving.
 */
export const PROFESSIONAL_TAX_PRESETS: StatutoryPreset[] = [
  {
    key: 'andhra-pradesh',
    label: 'Andhra Pradesh',
    jurisdiction: 'ANDHRA PRADESH',
    effectiveFrom: '2013-02-01',
    salaryBasis: 'MONTHLY',
    amountBasis: 'MONTHLY',
    slabs: [
      { min: 0, max: 15000, amount: 0 },
      { min: 15000.01, max: 20000, amount: 150 },
      { min: 20000.01, max: null, amount: 200 },
    ],
    sourceLabel: 'Andhra Pradesh Finance Department, Profession Tax service listing',
    sourceUrl: 'https://apfinance.gov.in/EODB.html',
    note: 'Monthly salary bands last amended by the 2013 First Schedule substitution. A current Andhra Pradesh government rate page was not found; confirm the operative Gazette and exemptions before applying.',
  },
  {
    key: 'assam',
    label: 'Assam',
    jurisdiction: 'ASSAM',
    effectiveFrom: '2025-04-02',
    salaryBasis: 'MONTHLY',
    amountBasis: 'MONTHLY',
    slabs: [
      { min: 0, max: 15000, amount: 0 },
      { min: 15000.01, max: 24999.99, amount: 180 },
      { min: 25000, max: null, amount: 208 },
    ],
    sourceLabel: 'Assam Finance (Taxation) Department, Gazette eCF 169350/124',
    sourceUrl: 'https://www.tax.assam.gov.in/AssamTimsInfo/content/assam_professional_tax.html',
    note: 'Monthly salary rates effective 2 April 2025: nil through ₹15,000; ₹180 through ₹24,999.99; ₹208 from ₹25,000. Age exemptions may apply.',
  },
  {
    key: 'bihar',
    label: 'Bihar',
    jurisdiction: 'BIHAR',
    effectiveFrom: '2016-02-02',
    salaryBasis: 'ANNUAL',
    amountBasis: 'ANNUAL',
    slabs: [
      { min: 0, max: 300000, amount: 0 },
      { min: 300000.01, max: 500000, amount: 1000 },
      { min: 500000.01, max: 1000000, amount: 2000 },
      { min: 1000000.01, max: null, amount: 2500 },
    ],
    sourceLabel: 'Bihar Commercial Taxes schedule (S.O. 28, 2 February 2016)',
    sourceUrl:
      'https://state.bihar.gov.in/cache/13/Tax%20Schedule/Professional%20Tax%20Schedules/PT_Schedule.pdf',
    note: 'The Act states annual tax amounts. The monthly profile preview accrues one twelfth; verify remittance timing and exemptions.',
  },
  {
    key: 'gujarat',
    label: 'Gujarat',
    jurisdiction: 'GUJARAT',
    effectiveFrom: '2022-04-01',
    salaryBasis: 'MONTHLY',
    slabs: [
      { min: 0, max: 12000, amount: 0 },
      { min: 12000.01, max: null, amount: 200 },
    ],
    sourceLabel: 'Gujarat Commercial Tax Department rate schedule',
    sourceUrl:
      'https://commercialtax.gujarat.gov.in/vatwebsite/download/schedule/Rate_of_Profession_Tax.pdf',
    note: 'Monthly salary schedule effective 1 April 2022.',
  },
  {
    key: 'jharkhand',
    label: 'Jharkhand',
    jurisdiction: 'JHARKHAND',
    effectiveFrom: '2011-09-01',
    salaryBasis: 'ANNUAL',
    amountBasis: 'ANNUAL',
    slabs: [
      { min: 0, max: 300000, amount: 0 },
      { min: 300000.01, max: 500000, amount: 1200 },
      { min: 500000.01, max: 800000, amount: 1800 },
      { min: 800000.01, max: 1000000, amount: 2100 },
      { min: 1000000.01, max: null, amount: 2500 },
    ],
    sourceLabel: 'Jharkhand Commercial Taxes Department schedule',
    sourceUrl:
      'https://ctax.jharkhand.gov.in/documents/10231/16291/Other%2BActs%2Band%2BRules/4191b34f-315c-43c9-9ceb-628d3c2cb46a?version=1.2',
    note: 'The statute lists annual income bands and annual amounts. Monthly profile preview accrues one twelfth; verify current filing and remittance rules.',
  },
  {
    key: 'karnataka',
    label: 'Karnataka',
    jurisdiction: 'KARNATAKA',
    effectiveFrom: '2025-04-01',
    salaryBasis: 'MONTHLY',
    amountBasis: 'MONTHLY',
    slabs: [
      { min: 0, max: 24999.99, amount: 0 },
      { min: 25000, max: null, amount: 200, monthOverrides: { '2': 300 } },
    ],
    sourceLabel: 'Karnataka Commercial Taxes Department (2025 amendment)',
    sourceUrl: 'https://ptax.karnataka.gov.in/ptemployer/FAQ',
    note: 'No salaried PT below ₹25,000/month; ₹200/month above that, except ₹300 in February. Exemptions may apply.',
  },
  {
    key: 'mizoram',
    label: 'Mizoram',
    jurisdiction: 'MIZORAM',
    effectiveFrom: '2024-07-11',
    salaryBasis: 'MONTHLY',
    amountBasis: 'MONTHLY',
    slabs: [
      { min: 0, max: 5000, amount: 0 },
      { min: 5000.01, max: 8000, amount: 75 },
      { min: 8000.01, max: 10000, amount: 120 },
      { min: 10000.01, max: 12000, amount: 150 },
      { min: 12000.01, max: 15000, amount: 180 },
      { min: 15000.01, max: 20000, amount: 195 },
      { min: 20000.01, max: null, amount: 208 },
    ],
    sourceLabel: 'Mizoram Taxation Department, Final Profession Tax Slab 2024',
    sourceUrl:
      'https://zotax.nic.in/files/tax_schedules/Final%20Profession%20Tax%20Slab%202024.pdf',
    note: 'The 11 July 2024 notification supersedes the 2013 schedule. Monthly gross-income bands: nil through ₹5,000; ₹75 through ₹8,000; ₹120 through ₹10,000; ₹150 through ₹12,000; ₹180 through ₹15,000; ₹195 through ₹20,000; ₹208 above. Statutory exemptions and the notification effective period still require review.',
  },
  {
    key: 'manipur',
    label: 'Manipur',
    jurisdiction: 'MANIPUR',
    effectiveFrom: '2000-08-30',
    salaryBasis: 'ANNUAL',
    amountBasis: 'ANNUAL',
    slabs: [
      { min: 0, max: 15000, amount: 0 },
      { min: 15000.01, max: 20000, amount: 300 },
      { min: 20000.01, max: 30000, amount: 450 },
      { min: 30000.01, max: 40000, amount: 600 },
      { min: 40000.01, max: 50000, amount: 750 },
      { min: 50000.01, max: 60000, amount: 900 },
      { min: 60000.01, max: 75000, amount: 1100 },
      { min: 75000.01, max: 100000, amount: 1600 },
      { min: 100000.01, max: 125000, amount: 2200 },
      { min: 125000.01, max: null, amount: 2500 },
    ],
    sourceLabel: 'Manipur Department of Taxes salary schedule',
    sourceUrl:
      'https://manipurtaxes.gov.in/media/filer_public/39/cb/39cb5f16-a9c7-4a0f-9385-203497c8f9c4/3_pt_7th_amendment.pdf',
    note: 'Annual gross income bands and annual tax amounts; monthly profile preview accrues one twelfth. Confirm later amendments and applicable exemptions.',
  },
  {
    key: 'maharashtra',
    label: 'Maharashtra',
    jurisdiction: 'MAHARASHTRA',
    effectiveFrom: '2023-04-01',
    salaryBasis: 'MONTHLY',
    amountBasis: 'MONTHLY',
    slabs: [
      { min: 0, max: 2500, amount: 0 },
      { min: 2500.01, max: 3500, amount: 60 },
      { min: 3500.01, max: 5000, amount: 120 },
      { min: 5000.01, max: 10000, amount: 175 },
      { min: 10000.01, max: null, amount: 200, monthOverrides: { '2': 300 } },
    ],
    sourceLabel: 'Maharashtra GST Department PT rate schedule (as on 31 March 2025)',
    sourceUrl:
      'https://mahagst.gov.in/public/uploads/menufiles/PT%20Rate%20Schedule%20updated%20upto%2031.03.2025%20%281%29%20%281%29.pdf',
    note: 'Monthly salary slabs: nil through ₹2,500; ₹60 through ₹3,500; ₹120 through ₹5,000; ₹175 through ₹10,000; above that ₹200 monthly and ₹300 in February. Gender and other statutory exemptions are not modeled.',
  },
  {
    key: 'telangana',
    label: 'Telangana',
    jurisdiction: 'TELANGANA',
    effectiveFrom: '2025-04-01',
    salaryBasis: 'MONTHLY',
    amountBasis: 'MONTHLY',
    slabs: [
      { min: 0, max: 15000, amount: 0 },
      { min: 15000.01, max: 20000, amount: 150 },
      { min: 20000.01, max: null, amount: 200 },
    ],
    sourceLabel: 'Telangana Commercial Taxes Department PT Schedule',
    sourceUrl: 'https://www.tgct.gov.in/tgportal/AllActs/APPT/APPTSchedule.aspx',
    note: 'Monthly salary schedule. Check applicable exemptions and any later amendment before use.',
  },
  {
    key: 'madhya-pradesh',
    label: 'Madhya Pradesh',
    jurisdiction: 'MADHYA PRADESH',
    effectiveFrom: '2026-04-01',
    salaryBasis: 'ANNUAL',
    amountBasis: 'MONTHLY',
    slabs: [
      { min: 0, max: 225000, amount: 0 },
      { min: 225000.01, max: 300000, amount: 125 },
      { min: 300000.01, max: 400000, amount: 166, monthOverrides: { '2': 174 } },
      { min: 400000.01, max: null, amount: 208, monthOverrides: { '2': 212 } },
    ],
    sourceLabel: 'Madhya Pradesh Commercial Tax Department — professional tax rates',
    sourceUrl:
      'https://mptax.mp.gov.in/mpvatweb/download/home/MPCTD_Registration_Checklist%26_Rates.pdf',
    note: 'The department schedule lists annual salary bands. Payroll uses the monthly equivalent and February catch-up (₹174 or ₹212) shown in the schedule. Confirm applicability and exemptions before use.',
  },
  {
    key: 'sikkim',
    label: 'Sikkim',
    jurisdiction: 'SIKKIM',
    effectiveFrom: '2006-04-01',
    salaryBasis: 'MONTHLY',
    amountBasis: 'MONTHLY',
    slabs: [
      { min: 0, max: 20000, amount: 0 },
      { min: 20000.01, max: 30000, amount: 125 },
      { min: 30000.01, max: 40000, amount: 150 },
      { min: 40000.01, max: null, amount: 200 },
    ],
    sourceLabel: 'Government of Sikkim Finance Department — PT Act 2006 schedule',
    sourceUrl: 'https://www.sikkimfred.gov.in/FCD/DOCUMENTS15th_FC/SFTopicNote.pdf',
    note: 'Monthly wage schedule: nil through ₹20,000; ₹125 through ₹30,000; ₹150 through ₹40,000; ₹200 above. The official Finance Department compilation reproduces the 2006 Act schedule; confirm later amendments and employee exemptions before use.',
  },
  {
    key: 'west-bengal',
    label: 'West Bengal',
    jurisdiction: 'WEST BENGAL',
    effectiveFrom: '2026-10-01',
    salaryBasis: 'MONTHLY',
    amountBasis: 'MONTHLY',
    slabs: [
      { min: 0, max: 20000, amount: 0 },
      { min: 20000.01, max: 30000, amount: 100 },
      { min: 30000.01, max: 50000, amount: 140 },
      { min: 50000.01, max: 100000, amount: 170 },
      { min: 100000.01, max: null, amount: 208 },
    ],
    sourceLabel:
      'West Bengal Directorate of Commercial Taxes, Kolkata Gazette notification 1407-F.T. (18 August 2026)',
    sourceUrl: 'https://professiontax.wb.gov.in/',
    note: 'Employee rates effective 1 October 2026 under the replacement schedule. Confirm current exemption classes with the department before applying.',
  },
  {
    key: 'meghalaya',
    label: 'Meghalaya',
    jurisdiction: 'MEGHALAYA',
    effectiveFrom: '1991-04-01',
    salaryBasis: 'ANNUAL',
    amountBasis: 'ANNUAL',
    slabs: [
      { min: 0, max: 25000, amount: 0 },
      { min: 25000.01, max: 30000, amount: 50 },
      { min: 30000.01, max: 35000, amount: 80 },
      { min: 35000.01, max: 40000, amount: 120 },
      { min: 40000.01, max: 45000, amount: 150 },
      { min: 45000.01, max: 50000, amount: 200 },
      { min: 50000.01, max: 55000, amount: 230 },
      { min: 55000.01, max: 60000, amount: 250 },
      { min: 60000.01, max: 65000, amount: 280 },
      { min: 65000.01, max: 70000, amount: 300 },
      { min: 70000.01, max: 75000, amount: 350 },
      { min: 75000.01, max: 80000, amount: 380 },
      { min: 80000.01, max: 90000, amount: 400 },
      { min: 90000.01, max: 100000, amount: 425 },
      { min: 100000.01, max: 120000, amount: 450 },
      { min: 120000.01, max: 150000, amount: 500 },
      { min: 150000.01, max: 200000, amount: 1500 },
      { min: 200000.01, max: 250000, amount: 2000 },
      { min: 250000.01, max: null, amount: 2500 },
    ],
    sourceLabel: 'Government of Meghalaya, Professions Taxation Amendment Act 4 of 1991',
    sourceUrl: 'https://meggst.gov.in/ActsRules/PTaxAmendment1991.pdf',
    note: 'Annual gross-income bands and annual tax amounts, accrued across the 12 monthly payroll periods. This is the latest state schedule located; confirm subsequent amendments and employee exemptions before applying.',
  },
  {
    key: 'nagaland',
    label: 'Nagaland',
    jurisdiction: 'NAGALAND',
    effectiveFrom: '2025-09-25',
    salaryBasis: 'MONTHLY',
    amountBasis: 'MONTHLY',
    slabs: [
      { min: 0, max: 3999.99, amount: 0 },
      { min: 4000, max: 4999.99, amount: 35 },
      { min: 5000, max: 6999.99, amount: 75 },
      { min: 7000, max: 8999.99, amount: 110 },
      { min: 9000, max: 11999.99, amount: 180 },
      { min: 12000, max: null, amount: 208 },
    ],
    sourceLabel: 'Nagaland Department of State Taxes, PT schedule and 25 September 2025 notice',
    sourceUrl: 'https://taxsoft-ngl.nic.in/Ptaxnagaland/TaxPayer/Schedule',
    note: 'Monthly salary schedule. The Department portal also publishes the 2025 revised schedule; personal exemptions and eligibility rules are not modeled.',
  },
  {
    key: 'tripura',
    label: 'Tripura',
    jurisdiction: 'TRIPURA',
    effectiveFrom: '2018-07-25',
    salaryBasis: 'MONTHLY',
    amountBasis: 'MONTHLY',
    slabs: [
      { min: 0, max: 7500, amount: 0 },
      { min: 7500.01, max: 15000, amount: 150 },
      { min: 15000.01, max: null, amount: 208 },
    ],
    sourceLabel: 'Tripura Finance Department (Taxes & Excise), Gazette notification 25 July 2018',
    sourceUrl: 'https://taxes.tripura.gov.in/sites/default/files/2024-04/PTAX_NOTF_2_up.pdf',
    note: 'Monthly gross-salary slabs. The Gazette lists annual totals of ₹1,800 and ₹2,496, normalized here to ₹150 and ₹208 per month. Confirm later amendments and employee exemptions before applying.',
  },
];

const PT_STATEWIDE_SCHEDULES = new Set([
  'ANDHRA PRADESH',
  'ASSAM',
  'GUJARAT',
  'JHARKHAND',
  'KARNATAKA',
  'MAHARASHTRA',
  'MADHYA PRADESH',
  'MIZORAM',
  'NAGALAND',
  'SIKKIM',
  'TELANGANA',
  'TRIPURA',
  'WEST BENGAL',
]);

export function professionalTaxPresetForAutoApply(jurisdiction: string) {
  const key = jurisdiction.trim().toUpperCase();
  if (!PT_STATEWIDE_SCHEDULES.has(key)) return null;
  return PROFESSIONAL_TAX_PRESETS.find((item) => item.jurisdiction === key) ?? null;
}

/** Full state and UT coverage. Unknown means "not verified", never "no tax". */
export const PROFESSIONAL_TAX_COVERAGE: ProfessionalTaxCoverage[] = INDIA_PAYROLL_JURISDICTIONS.map(
  (jurisdiction) => {
    const key = jurisdiction.toUpperCase();
    const preset = PROFESSIONAL_TAX_PRESETS.find((item) => item.jurisdiction === key);
    if (key === 'KERALA' || key === 'TAMIL NADU') {
      return {
        jurisdiction,
        status: 'LOCAL_BODY_REQUIRED',
        detail:
          'Rates and assessment depend on the employee’s municipality or panchayat. Confirm the work locality and its current schedule.',
        sourceUrl:
          key === 'KERALA'
            ? 'https://www.professiontax.lsgkerala.gov.in/faq.php'
            : 'https://tnsfc.tn.gov.in/assets/pdf/TNULB-RULES-2023.pdf',
      };
    }
    if (key === 'ODISHA') {
      return {
        jurisdiction,
        status: 'ADMIN_REVIEW_REQUIRED',
        detail:
          'A repeal ordinance says it took effect 1 April 2026. Confirm its present legal status before changing deductions.',
        sourceUrl: 'https://finance.odisha.gov.in/en/notification/tax-profession',
      };
    }
    if (key === 'PUNJAB') {
      return {
        jurisdiction,
        status: 'ADMIN_REVIEW_REQUIRED',
        detail:
          'Punjab uses State Development Tax. Employee liability depends on income-tax assessability and current amendments, not a simple gross-salary slab; verify eligibility before configuring a rule.',
        sourceUrl: 'https://psdt.punjab.gov.in/',
      };
    }
    if (key === 'BIHAR') {
      return {
        jurisdiction,
        status: 'ADMIN_REVIEW_REQUIRED',
        detail:
          'Bihar’s schedule is annual, but employers normally deduct the annual amount in September, with a February catch-up for employees who become newly liable. The payroll rule needs that timing before it can auto-deduct safely.',
        sourceUrl:
          'https://www.biharcommercialtax.gov.in/bweb/topmenu/topmenuMain.jsp?viewPageNo=102',
      };
    }
    if (key === 'MEGHALAYA') {
      return {
        jurisdiction,
        status: 'ADMIN_REVIEW_REQUIRED',
        detail:
          'The 2022 amendment removed the Act schedule and allows rates to be notified separately. The applicable current rate notification must be verified before payroll uses a value.',
        sourceUrl:
          'https://meggst.gov.in/ActsRules/Meghalaya%20professional%20amendment%20act%202022.pdf',
      };
    }
    if (key === 'MANIPUR') {
      return {
        jurisdiction,
        status: 'ADMIN_REVIEW_REQUIRED',
        detail:
          'The published schedule is annual, and its taxable salary definition excludes specified allowances. Confirm the employee tax base and later amendments before automatic deduction.',
        sourceUrl:
          'https://manipurtaxes.gov.in/media/filer_public/39/cb/39cb5f16-a9c7-4a0f-9385-203497c8f9c4/3_pt_7th_amendment.pdf',
      };
    }
    if (!preset || !PT_STATEWIDE_SCHEDULES.has(key)) {
      return {
        jurisdiction,
        status: 'ADMIN_REVIEW_REQUIRED',
        detail: preset
          ? 'A published schedule is available, but current applicability or amendments need confirmation before payroll uses it.'
          : 'No verified employee PT schedule is in the catalogue. Confirm whether PT applies and add the official schedule before payroll.',
        ...(preset ? { sourceUrl: preset.sourceUrl } : {}),
      };
    }
    return {
      jurisdiction,
      status: 'AUTO_SCHEDULE',
      detail:
        'A state schedule is available. Employee exemptions and applicability still need review.',
      sourceUrl: preset.sourceUrl,
    };
  },
);

export const EPF_INDIA_PRESET = {
  effectiveFrom: '2026-09-17',
  employeeRate: 12,
  employerRate: 12,
  wageCeiling: 25000,
  sourceLabel: 'EPFO / Ministry of Labour and Employment',
  sourceUrl: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2310973&lang=1&reg=3',
  note: 'EPFO currently links FAQs for the revised ₹25,000 wage ceiling. 12% is the common contribution rate; eligibility, exceptions and employer EPS/EPF allocation need review.',
};

export const ESIC_INDIA_PRESET = {
  effectiveFrom: '2019-07-01',
  employeeRate: 0.75,
  employerRate: 3.25,
  wageCeiling: 21000,
  employeeThreshold: 21000,
  sourceLabel: 'Employees’ State Insurance Corporation',
  sourceUrl:
    'https://www.esic.gov.in/attachments/publicationfile/6f673bcd3d6110170f790d2909767b4f.pdf',
  note: 'Common contribution rates are 0.75% employee and 3.25% employer. The ₹21,000 coverage threshold and wage definitions must be checked for the employee and contribution period.',
};

/**
 * Builds the verified defaults for a selected organization jurisdiction. PT schedules are only
 * generated where a government schedule is present in the reviewed preset catalogue; the app
 * must never invent a state tax rate.
 */
export function stateStatutoryRuleDefaults(
  jurisdictionValue: string,
  enabled: { epf: boolean; esic: boolean; pt: boolean },
): { rules: Array<Omit<StatutoryRule, 'id'>>; unsupported: string[] } {
  const jurisdiction = jurisdictionValue.trim().toUpperCase();
  const rules: Array<Omit<StatutoryRule, 'id'>> = [];
  const unsupported: string[] = [];

  if (enabled.epf) {
    rules.push({
      schemeCode: 'EPF',
      jurisdiction,
      effectiveFrom: EPF_INDIA_PRESET.effectiveFrom,
      employeeRate: EPF_INDIA_PRESET.employeeRate,
      employerRate: EPF_INDIA_PRESET.employerRate,
      wageCeiling: EPF_INDIA_PRESET.wageCeiling,
      metadata: {
        salaryBasis: 'MONTHLY',
        amountBasis: 'MONTHLY',
        sourceLabel: EPF_INDIA_PRESET.sourceLabel,
        sourceUrl: EPF_INDIA_PRESET.sourceUrl,
        sourceNote: EPF_INDIA_PRESET.note,
      },
    });
  }

  if (enabled.esic) {
    rules.push({
      schemeCode: 'ESIC',
      jurisdiction,
      effectiveFrom: ESIC_INDIA_PRESET.effectiveFrom,
      employeeRate: ESIC_INDIA_PRESET.employeeRate,
      employerRate: ESIC_INDIA_PRESET.employerRate,
      wageCeiling: ESIC_INDIA_PRESET.wageCeiling,
      employeeThreshold: ESIC_INDIA_PRESET.employeeThreshold,
      metadata: {
        salaryBasis: 'MONTHLY',
        amountBasis: 'MONTHLY',
        sourceLabel: ESIC_INDIA_PRESET.sourceLabel,
        sourceUrl: ESIC_INDIA_PRESET.sourceUrl,
        sourceNote: ESIC_INDIA_PRESET.note,
      },
    });
  }

  if (enabled.pt) {
    const preset = professionalTaxPresetForAutoApply(jurisdiction);
    if (!preset) {
      unsupported.push('PT');
    } else {
      const salaryDivisor =
        preset.salaryBasis === 'ANNUAL' ? 12 : preset.salaryBasis === 'HALF_YEARLY' ? 6 : 1;
      const amountDivisor =
        preset.amountBasis === 'ANNUAL' ? 12 : preset.amountBasis === 'HALF_YEARLY' ? 6 : 1;
      const slabs = (preset.slabs ?? []).map((slab) => ({
        ...slab,
        min: Number((slab.min / salaryDivisor).toFixed(6)),
        max: slab.max == null ? null : Number((slab.max / salaryDivisor).toFixed(6)),
        amount: Number((slab.amount / amountDivisor).toFixed(6)),
        ...(slab.monthOverrides
          ? {
              monthOverrides: Object.fromEntries(
                Object.entries(slab.monthOverrides).map(([month, amount]) => [
                  month,
                  Number((amount / amountDivisor).toFixed(6)),
                ]),
              ),
            }
          : {}),
      }));

      rules.push({
        schemeCode: 'PT',
        jurisdiction,
        effectiveFrom: preset.effectiveFrom,
        ...(preset.employeeRate != null ? { employeeRate: preset.employeeRate } : {}),
        ...(preset.employerRate != null ? { employerRate: preset.employerRate } : {}),
        ...(preset.wageCeiling != null ? { wageCeiling: preset.wageCeiling } : {}),
        ...(preset.employeeThreshold != null
          ? { employeeThreshold: preset.employeeThreshold }
          : {}),
        metadata: {
          salaryBasis: 'MONTHLY',
          amountBasis: 'MONTHLY',
          ...(slabs.length ? { slabs } : {}),
          sourceLabel: preset.sourceLabel,
          sourceUrl: preset.sourceUrl,
          sourceNote: preset.note,
        },
      });
    }
  }

  return { rules, unsupported };
}
