'use client';

import { currentStatutoryProfile, type StatutoryProfile } from '@smarteam/contracts';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

/** Schemes the drawer surfaces, in the order an Indian payroll reviewer expects them. */
const SCHEMES: { code: string; label: string; identifierLabel: string }[] = [
  { code: 'EPF', label: 'Provident Fund', identifierLabel: 'UAN / EPF Number' },
  { code: 'ESI', label: 'State Insurance', identifierLabel: 'ESI Number' },
  { code: 'PT', label: 'Professional Tax', identifierLabel: 'PT Registration' },
];

function maskIdentifier(val: string | null | undefined): string {
  if (!val) return 'Not recorded';
  const clean = val.trim();
  if (clean.length <= 4) return clean;
  const visible = clean.slice(-4);
  return `${'•'.repeat(Math.min(clean.length - 4, 8))}${visible}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="font-sans text-muted-foreground">{label}:</span>
      <span className="truncate font-bold text-foreground">{value}</span>
    </div>
  );
}

/**
 * Statutory identity, from the compliance API with sensitive numbers masked by default.
 */
export function EmployeeStatutorySection({
  profiles,
  canRead,
}: {
  profiles: StatutoryProfile[];
  canRead: boolean;
}) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const toggleReveal = (code: string) => {
    setRevealed((prev) => ({ ...prev, [code]: !prev[code] }));
  };

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
            const isRevealed = Boolean(revealed[code]);
            const rawValue = profile.registrationNumber;
            const displayValue = isRevealed
              ? (rawValue ?? 'Not recorded')
              : maskIdentifier(rawValue);

            return (
              <div className="space-y-1" key={code}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-sans text-muted-foreground">{identifierLabel}:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-bold text-foreground">{displayValue}</span>
                    {rawValue && (
                      <button
                        aria-label={isRevealed ? 'Hide number' : 'Show number'}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => toggleReveal(code)}
                        type="button"
                      >
                        {isRevealed ? (
                          <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : (
                          <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
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
