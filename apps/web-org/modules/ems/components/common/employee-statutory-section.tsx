'use client';

import { currentStatutoryProfile, type StatutoryProfile } from '@smarteam/contracts';

/** Schemes the drawer surfaces, in the order an Indian payroll reviewer expects them. */
const SCHEMES: { code: string; label: string; identifierLabel: string }[] = [
  { code: 'EPF', label: 'Provident Fund', identifierLabel: 'UAN / EPF Number' },
  { code: 'ESI', label: 'State Insurance', identifierLabel: 'ESI Number' },
  { code: 'PT', label: 'Professional Tax', identifierLabel: 'PT Registration' },
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="font-sans text-muted-foreground">{label}:</span>
      <span className="truncate font-bold text-foreground">{value}</span>
    </div>
  );
}

/**
 * Statutory identity, from the compliance API.
 *
 * PAN, tax regime and TDS rate are deliberately absent: none is modelled anywhere in the
 * schema, so the previous hardcoded values (`AAAPM0192L`, "New Regime", "10% Statutory") were
 * the same fabricated string for every employee.
 */
export function EmployeeStatutorySection({
  profiles,
  canRead,
}: {
  profiles: StatutoryProfile[];
  canRead: boolean;
}) {
  return (
    <div className="space-y-2 border-t border-border pt-2">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Tax &amp; Statutory Identity
      </span>

      <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
        {!canRead ? (
          <p className="font-sans text-muted-foreground">
            You do not have permission to view statutory details.
          </p>
        ) : profiles.length === 0 ? (
          <p className="font-sans text-muted-foreground">No statutory enrolments recorded.</p>
        ) : (
          SCHEMES.map(({ code, label, identifierLabel }) => {
            const profile = currentStatutoryProfile(profiles, code);
            if (!profile) return null;
            return (
              <div className="space-y-1" key={code}>
                <Row label={identifierLabel} value={profile.registrationNumber ?? 'Not recorded'} />
                {profile.employeeRate !== null && profile.employeeRate !== undefined && (
                  <Row label={`${label} — employee`} value={`${profile.employeeRate}%`} />
                )}
                {profile.employerRate !== null && profile.employerRate !== undefined && (
                  <Row label={`${label} — employer`} value={`${profile.employerRate}%`} />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
