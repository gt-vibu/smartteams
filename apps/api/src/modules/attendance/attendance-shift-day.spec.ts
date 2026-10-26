import { shiftMinutesOn } from './attendance-shift-day';

const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);
const weekdays = [1, 2, 3, 4, 5];
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('shiftMinutesOn — what overtime is measured against', () => {
  const general = {
    daysOfWeek: weekdays,
    startsAt: time('09:00'),
    endsAt: time('18:00'),
    crossesMidnight: false,
    breakMinutes: 60,
  };

  it('is the full shift span on a working day, break included', () => {
    // 2026-09-21 is a Monday. Punches do not record the break, so the span includes it.
    expect(shiftMinutesOn(general, day('2026-09-21'))).toBe(540);
  });

  it('is nothing on a day the shift does not run, so all time worked is overtime', () => {
    // 2026-09-20 is a Sunday.
    expect(shiftMinutesOn(general, day('2026-09-20'))).toBe(0);
  });

  it('counts a night shift across midnight', () => {
    const night = {
      ...general,
      startsAt: time('22:00'),
      endsAt: time('06:00'),
      crossesMidnight: true,
      breakMinutes: 30,
    };
    expect(shiftMinutesOn(night, day('2026-09-22'))).toBe(480);
  });

  it('knows a short shift is short', () => {
    const half = { ...general, endsAt: time('13:00'), breakMinutes: 0 };
    expect(shiftMinutesOn(half, day('2026-09-23'))).toBe(240);
  });
});
