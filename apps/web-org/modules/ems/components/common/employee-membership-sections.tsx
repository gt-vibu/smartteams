'use client';

import { Badge, Progress } from '@smarteam/ui';
import type { EmployeeDetail } from '@smarteam/contracts';
import type { ProjectMembership, TeamMembership } from '../../services/membership-state';

/**
 * Team and project membership, read from the backend.
 *
 * Ended memberships are shown rather than hidden: "was on this team until June" is different
 * information from "never was", and collapsing the two loses it.
 */

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      <span className="text-[10px] font-semibold text-muted-foreground">{count} active</span>
    </div>
  );
}

export function EmployeeTeamsSection({ memberships }: { memberships: TeamMembership[] }) {
  const active = memberships.filter((m) => m.state === 'ACTIVE');
  const ended = memberships.filter((m) => m.state === 'ENDED');

  return (
    <div className="border-t border-border pt-3">
      <SectionHeading count={active.length} title="Squads &amp; Teams" />
      {active.length === 0 && ended.length === 0 ? (
        <p className="text-xs text-muted-foreground">Not assigned to any team.</p>
      ) : (
        <div className="space-y-1.5">
          {active.map((m) => (
            <div
              className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
              key={m.team.id}
            >
              <span className="truncate text-xs font-semibold text-foreground">{m.team.name}</span>
              <Badge className="text-[10px]" variant="outline">
                Active
              </Badge>
            </div>
          ))}
          {ended.map((m) => (
            <div
              className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 opacity-70"
              key={m.team.id}
            >
              <span className="truncate text-xs text-muted-foreground">{m.team.name}</span>
              <span className="text-[10px] text-muted-foreground">
                Left {m.endedOn?.slice(0, 10)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmployeeProjectsSection({ memberships }: { memberships: ProjectMembership[] }) {
  const active = memberships.filter((m) => m.state === 'ACTIVE');
  const ended = memberships.filter((m) => m.state === 'ENDED');

  return (
    <div className="border-t border-border pt-3">
      <SectionHeading count={active.length} title="Projects &amp; Allocation" />
      {active.length === 0 && ended.length === 0 ? (
        <p className="text-xs text-muted-foreground">No project allocations.</p>
      ) : (
        <div className="space-y-2.5">
          {active.map((m) => (
            <div
              className="space-y-1.5 rounded-md border border-border bg-card px-3 py-2"
              key={m.project.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-foreground">
                  {m.project.name}
                </span>
                <span className="font-mono text-xs font-bold text-primary">
                  {m.allocationPercentage === null ? '—' : `${m.allocationPercentage}%`}
                </span>
              </div>
              {m.allocationPercentage !== null && (
                <Progress
                  aria-label={`Allocation ${m.allocationPercentage}%`}
                  value={m.allocationPercentage}
                />
              )}
            </div>
          ))}
          {ended.map((m) => (
            <div
              className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 opacity-70"
              key={m.project.id}
            >
              <span className="truncate text-xs text-muted-foreground">{m.project.name}</span>
              <span className="text-[10px] text-muted-foreground">
                Ended {m.endedOn?.slice(0, 10)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Reporting line.
 *
 * The API stores `managerEmployeeId` but exposes no route returning the manager's details, and
 * there is no direct-reports endpoint at all, so this states the gap rather than inventing a
 * hierarchy.
 */
/**
 * The employee's manager and direct reports.
 *
 * Both come from `managerEmployeeId` through the native detail route — one relation, resolved by
 * id server-side. Nothing here infers a hierarchy from names, roles or employee numbers.
 */
export function EmployeeReportingSection({ detail }: { detail: EmployeeDetail | null }) {
  if (!detail) {
    return (
      <div className="border-t border-border pt-3">
        <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Reporting Line
        </span>
        <p className="text-xs text-muted-foreground">Not available.</p>
      </div>
    );
  }

  const name = (person: { firstName: string; lastName: string }) =>
    `${person.firstName} ${person.lastName}`;

  return (
    <div className="border-t border-border pt-3">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Reporting Line
      </span>

      <div className="space-y-2">
        <div>
          <span className="text-[10px] text-muted-foreground">Reports to</span>
          {detail.manager ? (
            <p className="text-xs font-semibold text-foreground">
              {name(detail.manager)}{' '}
              <span className="font-mono font-normal text-muted-foreground">
                {detail.manager.employeeNumber}
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No manager assigned.</p>
          )}
        </div>

        <div>
          <span className="text-[10px] text-muted-foreground">
            Direct reports{detail.directReports.length ? ` (${detail.directReports.length})` : ''}
          </span>
          {detail.directReports.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nobody reports to this employee.</p>
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {detail.directReports.map((report) => (
                <li className="text-xs text-foreground" key={report.id}>
                  {name(report)}{' '}
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {report.employeeNumber}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
