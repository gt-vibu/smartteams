import { ConflictError } from '../../common/errors/domain-error';
import { assertCorrectionIsNotFuture } from './attendance-correction-future';

describe('assertCorrectionIsNotFuture', () => {
  const now = new Date('2026-10-05T12:00:00.000Z');

  it('allows a past date and past punch times', () => {
    expect(() =>
      assertCorrectionIsNotFuture(
        '2026-10-04',
        [new Date('2026-10-04T09:00:00.000Z'), new Date('2026-10-04T18:00:00.000Z')],
        'Asia/Kolkata',
        now,
      ),
    ).not.toThrow();
  });

  it('rejects dates after today in the organisation timezone', () => {
    expect(() => assertCorrectionIsNotFuture('2026-10-06', [], 'Asia/Kolkata', now)).toThrow(
      ConflictError,
    );
  });

  it('rejects a future punch even when the work date is today', () => {
    expect(() =>
      assertCorrectionIsNotFuture(
        '2026-10-05',
        [new Date('2026-10-05T12:01:00.000Z')],
        'Asia/Kolkata',
        now,
      ),
    ).toThrow(ConflictError);
  });
});
