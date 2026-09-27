'use client';

import React from 'react';
import { employmentTypeLabel, formatDate } from '@smarteam/contracts';
import { ProfileState } from '../profile/profile-state';
import { useEmployee } from '../../hooks/use-employee';
import { MyResignationCard } from './my-resignation-card';
import { EmployeeCustomFieldsSection } from '../common/employee-custom-fields-section';

/**
 * The signed-in person's work details.
 *
 * Only what is on record: a field with nothing in it is left out rather than filled with a sample
 * value, and nothing the header above already shows (name, number, job title, manager) is
 * repeated. Direct reports are listed when the person has any.
 */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Person({
  person,
}: {
  person: { firstName: string; lastName: string; employeeNumber: string };
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-foreground">
        {person.firstName.charAt(0)}
        {person.lastName.charAt(0)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {person.firstName} {person.lastName}
        </span>
        <span className="block text-[11px] text-muted-foreground">{person.employeeNumber}</span>
      </span>
    </li>
  );
}

export function OverviewProfileTab() {
  const { employee, loading, error, forbidden, hasEmployeeRecord, refetch } = useEmployee();

  const state = ProfileState({ loading, error, forbidden, hasEmployeeRecord, onRetry: refetch });
  if (state || !employee) return state;

  const fields: Array<[string, string | null | undefined]> = [
    ['Department', employee.department],
    ['Employment type', employee.employmentType && employmentTypeLabel(employee.employmentType)],
    ['Joined', employee.joinedDate && formatDate(employee.joinedDate)],
    ['Work email', employee.workEmail],
    ['Phone', employee.phone],
    ['Location', employee.location],
  ];
  const reports = employee.directReports ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="!m-0 !text-sm !font-bold !text-foreground">Work details</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {fields.map(([label, value]) =>
            value ? <Field key={label} label={label} value={value} /> : null,
          )}
        </dl>
      </section>

      {reports.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="!m-0 !text-sm !font-bold !text-foreground">
            Direct reports ({reports.length})
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {reports.map((person) => (
              <Person key={person.id} person={person} />
            ))}
          </ul>
        </section>
      )}

      <EmployeeCustomFieldsSection employeeId={employee.id} />

      <MyResignationCard />
    </div>
  );
}
