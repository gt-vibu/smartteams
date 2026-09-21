import type { Prisma } from '../../generated/prisma/client';
import { normalizePrefix, takeEmployeeNumber } from './departments.service';

/** A department counter and the numbers already in use, as the transaction would see them. */
function fakeTx(prefix: string | null, next: number, taken: string[] = []) {
  const state = { next };
  return {
    state,
    tx: {
      department: {
        update: () => {
          state.next += 1;
          return Promise.resolve({
            employeeNumberPrefix: prefix,
            nextEmployeeNumber: state.next,
            organizationId: 'org',
          });
        },
      },
      employee: {
        findFirst: ({ where }: { where: { employeeNumber: string } }) =>
          Promise.resolve(taken.includes(where.employeeNumber) ? { id: 'x' } : null),
      },
    } as unknown as Prisma.TransactionClient,
  };
}

describe('department employee numbers', () => {
  it('hands out the series in order: TE1, then TE2', async () => {
    const { tx } = fakeTx('TE', 1);
    expect(await takeEmployeeNumber(tx, 'org', 'dept')).toBe('TE1');
    expect(await takeEmployeeNumber(tx, 'org', 'dept')).toBe('TE2');
  });

  it('skips a number someone already typed by hand', async () => {
    const { tx } = fakeTx('TE', 1, ['TE1', 'TE2']);
    expect(await takeEmployeeNumber(tx, 'org', 'dept')).toBe('TE3');
  });

  it('gives nothing when the department has no series', async () => {
    const { tx } = fakeTx(null, 1);
    expect(await takeEmployeeNumber(tx, 'org', 'dept')).toBeNull();
  });

  it('accepts short letter-and-digit series and upper-cases them', () => {
    expect(normalizePrefix(' te ')).toBe('TE');
    expect(normalizePrefix('')).toBeNull();
    expect(() => normalizePrefix('te-1')).toThrow();
    expect(() => normalizePrefix('TOOLONG1')).toThrow();
  });
});
