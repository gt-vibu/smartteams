/**
 * Whitelisted official sources monitored by the payroll rule watcher. PT sources are keyed by
 * their own state/UT jurisdiction. Never substitute another state's source when a key is absent.
 */
export type GovernmentRuleSource = {
  key: string;
  schemeCode: 'EPF' | 'ESIC' | 'PT';
  jurisdiction: string;
  label: string;
  url: string;
  note?: string;
};

export const CENTRAL_PAYROLL_SOURCES: GovernmentRuleSource[] = [
  {
    key: 'central:epf',
    schemeCode: 'EPF',
    jurisdiction: 'INDIA',
    label: 'Employees’ Provident Fund Organisation',
    // EPFO now serves its public updates from this official domain. The old booklet URL returned
    // 404, so a manual or scheduled sync could never establish a current baseline.
    url: 'https://www.epfo.gov.in/',
  },
  {
    key: 'central:esic',
    schemeCode: 'ESIC',
    jurisdiction: 'INDIA',
    label: 'Employees’ State Insurance Corporation',
    url: 'https://www.esic.gov.in/attachments/publicationfile/6f673bcd3d6110170f790d2909767b4f.pdf',
  },
];

export const STATE_PT_SOURCES: Record<string, GovernmentRuleSource> = {
  'ANDHRA PRADESH': {
    key: 'state:andhra-pradesh:pt',
    schemeCode: 'PT',
    jurisdiction: 'ANDHRA PRADESH',
    label: 'Andhra Pradesh Finance Department',
    url: 'https://apct.gov.in/gstportal/GST_Portal/AboutAPPT/R_Tarrifs.aspx',
  },
  ASSAM: {
    key: 'state:assam:pt',
    schemeCode: 'PT',
    jurisdiction: 'ASSAM',
    label: 'Assam Taxation Department',
    url: 'https://www.tax.assam.gov.in/AssamTimsInfo/content/assam_professional_tax.html',
  },
  BIHAR: {
    key: 'state:bihar:pt',
    schemeCode: 'PT',
    jurisdiction: 'BIHAR',
    label: 'Bihar Commercial Taxes Department',
    url: 'https://state.bihar.gov.in/cache/13/Tax%20Schedule/Professional%20Tax%20Schedules/PT_Schedule.pdf',
  },
  GUJARAT: {
    key: 'state:gujarat:pt',
    schemeCode: 'PT',
    jurisdiction: 'GUJARAT',
    label: 'Gujarat State Tax Department',
    url: 'https://commercialtax.gujarat.gov.in/vatwebsite/download/schedule/Rate_of_Profession_Tax.pdf',
  },
  JHARKHAND: {
    key: 'state:jharkhand:pt',
    schemeCode: 'PT',
    jurisdiction: 'JHARKHAND',
    label: 'Jharkhand Commercial Taxes Department',
    url: 'https://ctax.jharkhand.gov.in/documents/10231/16291/Other%2BActs%2Band%2BRules/4191b34f-315c-43c9-9ceb-628d3c2cb46a?version=1.2',
  },
  'MADHYA PRADESH': {
    key: 'state:madhya-pradesh:pt',
    schemeCode: 'PT',
    jurisdiction: 'MADHYA PRADESH',
    label: 'Madhya Pradesh Commercial Tax Department',
    url: 'https://mptax.mp.gov.in/mpvatweb/download/home/MPCTD_Registration_Checklist%26_Rates.pdf',
    note: 'The hosted Act/rules include historical schedule amendments. Verify the latest Gazette and applicable annual salary slab before updating payroll.',
  },
  KARNATAKA: {
    key: 'state:karnataka:pt',
    schemeCode: 'PT',
    jurisdiction: 'KARNATAKA',
    label: 'Karnataka Commercial Taxes Department — Professional Tax',
    url: 'https://ptax.karnataka.gov.in/ptemployer/FAQ',
  },
  KERALA: {
    key: 'state:kerala:pt',
    schemeCode: 'PT',
    jurisdiction: 'KERALA',
    label: 'Kerala Local Self Government Department — Profession Tax',
    url: 'https://www.professiontax.lsgkerala.gov.in/faq.php',
    note: 'Kerala PT can depend on local body and half-yearly income. Confirm the employee work location and applicable local-body schedule; this page is a discovery source, not a complete statewide rate table.',
  },
  MANIPUR: {
    key: 'state:manipur:pt',
    schemeCode: 'PT',
    jurisdiction: 'MANIPUR',
    label: 'Manipur Taxes Department',
    url: 'https://manipurtaxes.gov.in/media/filer_public/39/cb/39cb5f16-a9c7-4a0f-9385-203497c8f9c4/3_pt_7th_amendment.pdf',
  },
  MAHARASHTRA: {
    key: 'state:maharashtra:pt',
    schemeCode: 'PT',
    jurisdiction: 'MAHARASHTRA',
    label: 'Maharashtra GST Department — Profession Tax schedules',
    url: 'https://www.mahagst.gov.in/en/profession-tax-and-other-rate-schedule',
  },
  MIZORAM: {
    key: 'state:mizoram:pt',
    schemeCode: 'PT',
    jurisdiction: 'MIZORAM',
    label: 'Mizoram Taxation Department — Final PT Slab 2024',
    url: 'https://zotax.nic.in/files/tax_schedules/Final%20Profession%20Tax%20Slab%202024.pdf',
    note: 'The official 11 July 2024 schedule supersedes the 2013 notification. Check for later amendments and exemptions before applying.',
  },
  MEGHALAYA: {
    key: 'state:meghalaya:pt',
    schemeCode: 'PT',
    jurisdiction: 'MEGHALAYA',
    label: 'Meghalaya GST Department',
    url: 'https://meggst.gov.in/ActsRules/Meghalaya%20professional%20amendment%20act%202022.pdf',
    note: 'The 2022 amendment removed the schedule and authorizes rates by separate notification. Monitor this amendment index, but never infer a current rate from the old schedule.',
  },
  PUNJAB: {
    key: 'state:punjab:pt',
    schemeCode: 'PT',
    jurisdiction: 'PUNJAB',
    label: 'Punjab State Development Tax Portal',
    url: 'https://psdt.punjab.gov.in/',
    note: 'Punjab State Development Tax employee liability is income-tax-assessability based and may change through amendments. Source changes require admin review; no salary-slab auto deduction is configured.',
  },
  NAGALAND: {
    key: 'state:nagaland:pt',
    schemeCode: 'PT',
    jurisdiction: 'NAGALAND',
    label: 'Nagaland Taxation Department',
    url: 'https://taxsoft-ngl.nic.in/Ptaxnagaland/TaxPayer/Schedule',
  },
  ODISHA: {
    key: 'state:odisha:pt',
    schemeCode: 'PT',
    jurisdiction: 'ODISHA',
    label: 'Odisha CT & GST Commissionerate — Professional Tax',
    url: 'https://finance.odisha.gov.in/en/notification/tax-profession',
    note: 'The Finance Department lists a repeal ordinance effective 1 April 2026. Because ordinance continuation/replacement must be confirmed, do not auto-apply the historic schedule.',
  },
  SIKKIM: {
    key: 'state:sikkim:pt',
    schemeCode: 'PT',
    jurisdiction: 'SIKKIM',
    label: 'Sikkim Finance Department — Profession Tax Act and schedule',
    url: 'https://www.sikkimfred.gov.in/FCD/DOCUMENTS15th_FC/SFTopicNote.pdf',
    note: 'Official Finance Department compilation reproduces the Act schedule. Confirm later Gazette notifications and the current employee salary bands before applying.',
  },
  TELANGANA: {
    key: 'state:telangana:pt',
    schemeCode: 'PT',
    jurisdiction: 'TELANGANA',
    label: 'Telangana Commercial Taxes Department',
    url: 'https://www.tgct.gov.in/tgportal/AllActs/APPT/APPTSchedule.aspx',
  },
  'TAMIL NADU': {
    key: 'state:tamil-nadu:pt',
    schemeCode: 'PT',
    jurisdiction: 'TAMIL NADU',
    label: 'Tamil Nadu Government Gazette — Urban Local Body rules',
    url: 'https://tnsfc.tn.gov.in/assets/pdf/TNULB-RULES-2023.pdf',
    note: 'The Gazette describes half-yearly PT within municipalities and provides a schedule subject to local-body revision. Confirm the employee municipality and current local schedule before applying.',
  },
  TRIPURA: {
    key: 'state:tripura:pt',
    schemeCode: 'PT',
    jurisdiction: 'TRIPURA',
    label: 'Tripura Taxes Department',
    url: 'https://taxes.tripura.gov.in/sites/default/files/2024-04/PTAX_NOTF_2_up.pdf',
  },
  'WEST BENGAL': {
    key: 'state:west-bengal:pt',
    schemeCode: 'PT',
    jurisdiction: 'WEST BENGAL',
    label: 'West Bengal Profession Tax portal',
    url: 'https://professiontax.wb.gov.in/',
  },
};

export function sourcesForPayroll(
  jurisdictions: readonly string[],
  enabled: { epf: boolean; esic: boolean; pt: boolean },
) {
  const sources = [
    ...(enabled.epf ? [CENTRAL_PAYROLL_SOURCES[0]!] : []),
    ...(enabled.esic ? [CENTRAL_PAYROLL_SOURCES[1]!] : []),
  ];
  const unsupportedJurisdictions: string[] = [];
  if (enabled.pt) {
    for (const raw of jurisdictions) {
      const jurisdiction = raw.trim().toUpperCase();
      if (!jurisdiction) continue;
      const source = STATE_PT_SOURCES[jurisdiction];
      if (source) sources.push(source);
      else unsupportedJurisdictions.push(jurisdiction);
    }
  }
  return {
    sources: [...new Map(sources.map((source) => [source.key, source])).values()],
    unsupportedJurisdictions: [...new Set(unsupportedJurisdictions)],
  };
}
