# Payroll government rule source checks

## Safety model

The checker is a change detector, not a legal-rules interpreter. When the admin selects **Sync
rules now**, the API worker fetches the HTTPS pages configured in
`apps/api/src/modules/payroll/payroll-government-sources.ts`; the browser does not open those sites.
State PT checks are keyed by each effective configured statutory jurisdiction. It does not run a
general search-engine query or fall back to another state. If the company or an employee has a PT
jurisdiction without an allowlisted source, the UI reports that gap and no PT source is fetched for
that jurisdiction. Payroll shows the scheme, jurisdiction and sync result without exposing external
source links as navigation actions.

A first successful fetch establishes a baseline. A later content change creates a pending review
item and an in-app notification for users with `payroll.policy.write`. The checker does not infer
new rates from HTML/PDF text, and it does not change payroll when a page changes. An admin must
open the official source, verify the exact legal provision and effective date, enter the structured
replacement values, inspect the current/proposed values and impact summary, and explicitly accept.
The stored audit trail identifies the proposal and the accepted rule.

On acceptance, the old rule is ended on the day before the selected effective date and a new
effective-dated rule is added. The operation rejects a date in the past, marks matching calculated
or approved future payroll runs stale for recalculation, and leaves released runs, issued payslips,
and historical payroll records unchanged. A rejected proposal changes no payroll values.

## Sources currently allowlisted

National schemes are checked only when enabled by an organization default or an employee policy:

| Scheme | Official source | Notes |
| --- | --- | --- |
| EPF | [Employees' Provident Fund Organisation](https://www.epfo.gov.in/) | Official update page; individual coverage, wage basis, ceiling, and exceptions still require review. |
| ESIC | [ESIC contribution publication](https://www.esic.gov.in/attachments/publicationfile/6f673bcd3d6110170f790d2909767b4f.pdf) | Reference material; coverage and contribution-period rules still require review. |

Professional Tax is checked only for the exact configured state/UT below:

| Jurisdiction key | Official source URL | Source scope/caveat |
| --- | --- | --- |
| Andhra Pradesh | [Commercial Taxes Department PT rates](https://apct.gov.in/gstportal/GST_Portal/AboutAPPT/R_Tarrifs.aspx) | State schedule is published by the Commercial Taxes Department; verify applicable exemptions and amendments. |
| Assam | [Assam Taxation Department PT guidance](https://www.tax.assam.gov.in/AssamTimsInfo/content/assam_professional_tax.html) | Check amendments and exemptions against the operative notification. |
| Bihar | [Bihar Commercial Taxes Department PT schedule](https://state.bihar.gov.in/cache/13/Tax%20Schedule/Professional%20Tax%20Schedules/PT_Schedule.pdf) | Annual schedule, normally deducted in September with a February catch-up for newly liable employees. Automatic deduction is held until payroll models that timing. |
| Gujarat | [Gujarat PT rate schedule](https://commercialtax.gujarat.gov.in/vatwebsite/download/schedule/Rate_of_Profession_Tax.pdf) | Confirm current schedule and exemptions. |
| Jharkhand | [Jharkhand Commercial Taxes acts and rules](https://ctax.jharkhand.gov.in/documents/10231/16291/Other%2BActs%2Band%2BRules/4191b34f-315c-43c9-9ceb-628d3c2cb46a?version=1.2) | Verify the operative schedule and amendments. |
| Karnataka | [Karnataka PT employer FAQ](https://ptax.karnataka.gov.in/ptemployer/FAQ) | Use the state PT portal and confirm current slab/month exceptions. |
| Kerala | [Kerala LSGD PT FAQ](https://www.professiontax.lsgkerala.gov.in/faq.php) | PT remittance is semi-annual and the portal covers named local bodies; company state alone is not enough to confirm local-body coverage/rates. Set the employee work locality and verify the applicable local-body schedule. |
| Madhya Pradesh | [MP Commercial Tax Department rate sheet](https://mptax.mp.gov.in/mpvatweb/download/home/MPCTD_Registration_Checklist%26_Rates.pdf) | Annual salary bands are normalized to monthly gross; February catch-up is retained. Confirm employee exemptions. |
| Manipur | [Manipur PT amendment PDF](https://manipurtaxes.gov.in/media/filer_public/39/cb/39cb5f16-a9c7-4a0f-9385-203497c8f9c4/3_pt_7th_amendment.pdf) | Amendment document; check later amendments and full current schedule. |
| Maharashtra | [Maharashtra PT rate schedules](https://www.mahagst.gov.in/en/profession-tax-and-other-rate-schedule) | The department also publishes amendments and circulars; a changed listing can be a new file, not necessarily a rate change. |
| Meghalaya | [Meghalaya 2022 PT amendment](https://meggst.gov.in/ActsRules/Meghalaya%20professional%20amendment%20act%202022.pdf) | The amendment removed the schedule and allows rates to be notified separately. Do not use the old 1991 schedule as current. |
| Mizoram | [Mizoram Taxation Department — Final PT Slab 2024](https://zotax.nic.in/files/tax_schedules/Final%20Profession%20Tax%20Slab%202024.pdf) | The 11 July 2024 notification supersedes the 2013 schedule. Verify exemptions and later amendments. |
| Nagaland | [Nagaland PT schedule portal](https://taxsoft-ngl.nic.in/Ptaxnagaland/TaxPayer/Schedule) | Portal schedule; confirm the data for the current period. |
| Odisha | [Odisha Finance Department — PT notifications](https://finance.odisha.gov.in/en/notification/tax-profession) | Lists a repeal ordinance effective 1 April 2026; current legal status must be reviewed. Historic rates are not auto-applied. |
| Punjab | [Punjab State Development Tax portal](https://psdt.punjab.gov.in/) | This is State Development Tax, not a gross-salary slab; eligibility depends on income-tax assessability and current amendments. Review before configuring employee deductions. |
| Sikkim | [Sikkim Finance Department PT Act and schedule compilation](https://www.sikkimfred.gov.in/FCD/DOCUMENTS15th_FC/SFTopicNote.pdf) | Official compilation reproduces the Act schedule; verify later Gazette notifications before applying. |
| Tamil Nadu | [Tamil Nadu Government Gazette — Urban Local Body Rules](https://tnsfc.tn.gov.in/assets/pdf/TNULB-RULES-2023.pdf) | Half-yearly municipal PT; rates may be revised by each local body. Verify the employee's municipality and current local schedule. |
| Telangana | [Telangana PT schedule](https://www.tgct.gov.in/tgportal/AllActs/APPT/APPTSchedule.aspx) | Confirm operative amendments and applicability. |
| Tripura | [Tripura PT notification PDF](https://taxes.tripura.gov.in/sites/default/files/2024-04/PTAX_NOTF_2_up.pdf) | Notification source; verify later amendments. |
| West Bengal | [West Bengal Profession Tax portal](https://professiontax.wb.gov.in/) | Confirm current schedules and employee applicability. |

## State and territory coverage policy

The payroll setup screen now lists all 28 states and 8 union territories. Coverage status is
deliberately separate from whether a URL exists:

- **Schedule available**: a state-level employee schedule is in the catalogue and may be copied
  into the organization's `payroll_statutory_rules` table for its selected jurisdiction. Employee
  exemptions and applicability still need review.
- **Local body needed**: a state-wide selection is insufficient. Kerala and Tamil Nadu require
  the employee's municipality/panchayat and current local schedule. No guessed state default is
  written.
- **Review needed**: a source is historical, incomplete, or the current rule status is uncertain.
  PT must be verified and entered as a custom rule before the payroll engine can use it.

Unknown coverage is not treated as “no tax.” A missing schedule is not a zero-amount rule, and the
application does not borrow another state's slab. The state coverage list currently identifies
automatic salary schedules for Andhra Pradesh, Assam, Gujarat, Jharkhand, Karnataka,
Madhya Pradesh, Maharashtra, Mizoram, Nagaland, Sikkim, Telangana, Tripura, and West Bengal.
These schedules use the applicable state's own published salary basis and official source; the
administrator still needs to check employee exemptions and effective dates. Kerala and Tamil Nadu
are locality-dependent. Bihar, Manipur, Meghalaya, Odisha, and Punjab remain in administrator review
because the taxable base, separate rate notification, or current legal status cannot safely be
represented as a generic gross-salary schedule. All other states and UTs are shown as review-needed
or without a verified PT schedule; this is not treated as a zero-tax decision.

Andhra Pradesh and Jharkhand schedules are now included in state-driven setup. Jharkhand publishes
annual salary slabs and annual tax values; its rules require deductions from monthly salary and
deposit on a quarterly timeline, which must be distinguished from the annual slab used to select the
amount. Bihar's rules require an annual September deduction and a February catch-up for newly liable
employees; it remains review-only until those timing cases are modeled. Mizoram's 11 July 2024
notification supersedes the 2013 schedule and is included. Manipur's official salary definition
excludes specified allowances, so its available
annual slab is not automatically applied to a generic gross-salary figure. Meghalaya's 2022 Act
amendment removed the schedule, so the old 1991 schedule is not considered current.

Madhya Pradesh's official rate sheet gives annual salary bands and monthly deductions, including
the February adjustment. The stored rule normalizes annual salary limits into monthly gross bands
and preserves the monthly amounts and February override. Sikkim's Finance Department compilation
reproduces the monthly salary schedule in the 2006 Act. Odisha is review-needed: its Finance
Department lists the 2026 repeal ordinance with effect from 1 April 2026, but its current legal
continuation must be checked before ending legacy deductions or deciding that no PT applies.

The static reference catalogue is application data; once a permitted schedule is selected, the
effective-dated organization rule and the values actually used by payroll are persisted in the
tenant database. Custom schedules remain organization-owned and are not changed by catalogue
refreshes. Do not turn a source watcher result into an automatic rate update.

No source is configured for every state/UT yet. Jurisdictions without a dedicated official source
are surfaced as unsupported rather than borrowing another state's source or rate. An enabled PT
scheme with no configured jurisdiction is also surfaced as unconfigured. Sources must be
independently reviewed and added to the allowlist before that jurisdiction is monitored.

## Schedule and manual action

- A BullMQ scheduler runs a lightweight due-check daily. Each source is fetched at most once per
  UTC calendar month automatically. This daily heartbeat means downtime is recovered on the next
  run instead of missing a calendar-date-only job.
- The admin's **Sync rules now** action enqueues a forced organization-only check. It
  bypasses the monthly due guard, uses the same allowlist and source matching, and is rate-limited
  by queue concurrency rather than making the browser call government sites directly.
- Source selection comes from effective organization payroll defaults and enabled employee payroll
  policies. Employee-level PT jurisdiction takes precedence over that employee's inherited
  organization jurisdiction. A Kerala employee is therefore checked against Kerala's allowlisted
  source, and is never checked against Karnataka or another state's source just because it has a
  more convenient rate table. EPF and ESIC use their national authorities.
- Requests use conditional `ETag` and `Last-Modified` headers when available, a 12-second timeout,
  a 6 MiB response limit, and same-host-only redirects. HTML is normalized before hashing to reduce
  layout noise. PDF content is fingerprinted as bytes. Source failures are visible and remain
  eligible for retry; failed attempts do not consume that month's successful check.
- A successful initial check stores a baseline without creating an alert. A later changed hash
  creates one proposal per organization/source/hash. The unique key prevents duplicate proposals
  and notifications for repeated syncs of unchanged content.

## Operational limitations

Government pages can change layout, reissue PDFs, or change text without changing legal effect.
These checks therefore produce review candidates, not claims that a law changed. Some sites may
block automated requests or provide dynamically rendered content; failures are shown to admins and
can be retried manually. Kerala PT and similar local-body rules need employee locality to be modeled
before an organization-wide state default can safely determine the amount. The checker does not
fetch or archive full source documents; the review item stores a SHA-256 fingerprint and links to
the official page so the admin can inspect the current publication.
