import 'reflect-metadata';
import { validate } from 'class-validator';
import { AttendanceCorrectionDto } from './attendance.dto';

describe('AttendanceCorrectionDto', () => {
  it('accepts a short non-empty reason', async () => {
    const dto = Object.assign(new AttendanceCorrectionDto(), { reason: 'sdc' });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects an empty reason', async () => {
    const dto = Object.assign(new AttendanceCorrectionDto(), { reason: '' });

    expect((await validate(dto)).some((error) => error.property === 'reason')).toBe(true);
  });
});
