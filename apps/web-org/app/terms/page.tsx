import type { Metadata } from 'next';
import Link from 'next/link';
import { Brand } from '@smarteam/ui';

export const revalidate = 86_400;

export const metadata: Metadata = {
  title: 'Terms & Conditions | Smarteam',
  description: 'Draft placeholder for Smarteam service terms and conditions.',
  robots: { index: false, follow: false },
};

const sections = [
  ['service', 'The service', 'Describe Smarteam, the services covered by these terms, and any order or service agreement that takes precedence.'],
  ['accounts', 'Workspace accounts and access', 'Set out account eligibility, administrator responsibilities, access controls, credential security, and the process for inviting or removing users.'],
  ['acceptable-use', 'Acceptable use', 'Define permitted use and prohibited conduct, including unlawful use, unauthorized access, interference with the service, and misuse of other users’ information.'],
  ['customer-data', 'Customer and employee data', 'Explain each party’s role in handling workspace data and link to the applicable privacy notice and data processing terms. Do not place detailed privacy commitments here until they have been reviewed.'],
  ['integrations', 'Integrations and federation', 'Describe the scope, authorization, data-sharing controls, and responsibilities for third-party integrations and federated access.'],
  ['availability', 'Availability and support', 'Document support channels, service availability commitments, maintenance practices, and any service-level agreement that applies.'],
  ['fees', 'Fees and payment', 'State when this section applies, how fees are calculated, billing and payment terms, taxes, renewals, and cancellation rules.'],
  ['suspension', 'Suspension and termination', 'Explain when access may be suspended or ended, how notice is provided, and what happens to data after termination.'],
  ['warranties', 'Warranties and liability', 'Have qualified counsel draft applicable warranties, disclaimers, liability limits, and any exceptions required by law.'],
  ['general', 'General terms', 'Add governing law, dispute resolution, notices, changes to these terms, assignment, severability, and the complete-agreement language for the selected jurisdiction.'],
];

export default function TermsPage() {
  return (
    <main className="h-dvh overflow-y-auto bg-background text-foreground">
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" aria-label="Smarteam home" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <Brand compact />
          </Link>
          <Link href="/tenant" className="text-sm font-semibold text-primary hover:underline">Sign in</Link>
        </div>
      </header>

      <article className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="inline-flex rounded-full border border-amber-700/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-900">Draft placeholder · Not a final legal agreement</p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Terms &amp; Conditions</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          This page reserves a clear, accessible place for Smarteam’s service terms. The outline below is a drafting checklist, not operative terms. Complete it with the correct contracting entity, jurisdiction, product scope, and customer commitments before publishing it as an agreement.
        </p>

        <aside className="mt-8 rounded-xl border border-border bg-card p-5 text-sm leading-6">
          <h2 className="font-semibold">Publication details to complete</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Provider legal name</dt><dd>[Insert registered entity]</dd></div>
            <div><dt className="text-muted-foreground">Effective date</dt><dd>[Insert date]</dd></div>
            <div><dt className="text-muted-foreground">Governing jurisdiction</dt><dd>[Insert jurisdiction]</dd></div>
            <div><dt className="text-muted-foreground">Legal contact</dt><dd>[Insert verified contact address]</dd></div>
          </dl>
          <p className="mt-4 border-t border-border pt-3 text-muted-foreground">Obtain legal review and align these terms with the privacy notice, data processing terms, security practices, and customer contracts before launch.</p>
        </aside>

        <nav aria-label="Terms outline" className="mt-10 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">On this page</h2>
          <ol className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {sections.map(([id, title]) => <li key={id}><a className="text-sm text-primary underline-offset-4 hover:underline" href={`#${id}`}>{title}</a></li>)}
          </ol>
        </nav>

        <div className="mt-10 divide-y divide-border border-y border-border">
          {sections.map(([id, title, description], index) => (
            <section id={id} key={id} className="scroll-mt-8 py-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Section {index + 1}</p>
              <h2 className="mt-2 text-xl font-semibold">{title}</h2>
              <p className="mt-2 max-w-3xl leading-7 text-muted-foreground">{description}</p>
            </section>
          ))}
        </div>

        <p className="mt-8 text-sm text-muted-foreground">For questions about workspace access, contact your organization’s administrator.</p>
        <Link href="/" className="mt-6 inline-flex rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">← Back to Smarteam</Link>
      </article>
    </main>
  );
}
