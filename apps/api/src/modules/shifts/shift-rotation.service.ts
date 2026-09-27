import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { ShiftsService } from './shifts.service';

const DAY_MS = 86_400_000;
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const key = (date: Date) => date.toISOString().slice(0, 10);

/**
 * A rotating roster: people cycle through shifts, a few weeks on each — mornings, then evenings,
 * then nights — for as many weeks as are planned.
 *
 * It writes ordinary shift assignments, one per stretch, through the same path as assigning a
 * shift by hand, so every rule that applies there applies here. Each person is planned on their
 * own: one who cannot be (someone already planned on those days, say) is reported, and the rest
 * are still planned.
 */
@Injectable()
export class ShiftRotationService {
  constructor(private readonly shifts: ShiftsService) {}

  async rotate(
    context: DomainContext,
    input: {
      employeeIds: string[];
      shiftIds: string[];
      weeksPerShift: number;
      startsOn: string;
      totalWeeks: number;
      /** Start each person at a different point in the cycle, so shifts stay covered. */
      stagger?: boolean;
    },
  ) {
    requirePermission(context, 'shifts.write');
    if (input.shiftIds.length < 2) throw new ConflictError('A rotation needs at least two shifts.');
    if (input.totalWeeks < input.weeksPerShift)
      throw new ConflictError('Plan at least one full stretch on a shift.');
    const start = dateOnly(input.startsOn);
    if (Number.isNaN(start.getTime()))
      throw new ConflictError('Choose the first day of the rotation.');
    const horizonEnd = new Date(start.getTime() + input.totalWeeks * 7 * DAY_MS - DAY_MS);
    const stretches = Math.ceil(input.totalWeeks / input.weeksPerShift);

    const results: Array<{ employeeId: string; planned: number; error?: string }> = [];
    for (const [index, employeeId] of input.employeeIds.entries()) {
      const offset = input.stagger ? index % input.shiftIds.length : 0;
      let planned = 0;
      try {
        for (let stretch = 0; stretch < stretches; stretch += 1) {
          const from = new Date(start.getTime() + stretch * input.weeksPerShift * 7 * DAY_MS);
          const plannedTo = new Date(from.getTime() + input.weeksPerShift * 7 * DAY_MS - DAY_MS);
          const to = plannedTo > horizonEnd ? horizonEnd : plannedTo;
          await this.shifts.assign(context, employeeId, {
            shiftId: input.shiftIds[(stretch + offset) % input.shiftIds.length]!,
            startsOn: key(from),
            endsOn: key(to),
          });
          planned += 1;
        }
        results.push({ employeeId, planned });
      } catch (caught) {
        results.push({
          employeeId,
          planned,
          error: caught instanceof Error ? caught.message : 'Could not be planned.',
        });
      }
    }
    return {
      from: key(start),
      to: key(horizonEnd),
      planned: results.filter((result) => !result.error).length,
      results,
    };
  }
}
