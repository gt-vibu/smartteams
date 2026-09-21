import { employeeDisplayName } from '@smarteam/contracts';

type Person = Parameters<typeof employeeDisplayName>[0] & { status?: string | null };

/**
 * The people a dropdown should offer: those still with the company, A to Z. Someone who has left
 * keeps their history but is not put on new work, made a manager or sent a document.
 */
export function activeByName<T extends Person>(people: readonly T[]): T[] {
  return people
    .filter((person) => !person.status || person.status === 'ACTIVE')
    .sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b)));
}

/** Any list of named things, A to Z. */
export function byName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}
