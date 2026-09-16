// class-validator reads decorator metadata, which needs the reflect polyfill loaded first.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ProjectDeactivationDto, TeamDeactivationDto } from './platform.dto';
import { ShiftDeactivationDto } from '../shifts/shifts.dto';

/**
 * These DTOs guarded `reason` with `@Min(2)`, which is a numeric validator. Applied to a string
 * it never passes, so archiving a team, a project or a shift was rejected with a 400 no matter
 * what the caller sent — the endpoints were unreachable. `@MinLength` is the string equivalent.
 */
describe.each([
  ['TeamDeactivationDto', TeamDeactivationDto],
  ['ProjectDeactivationDto', ProjectDeactivationDto],
  ['ShiftDeactivationDto', ShiftDeactivationDto],
])('%s reason validation', (_name, Dto) => {
  it('accepts a real reason', () => {
    const errors = validateSync(plainToInstance(Dto, { reason: 'Squad merged into Platform' }));
    expect(errors).toHaveLength(0);
  });

  it('rejects a reason that is too short to be meaningful', () => {
    const errors = validateSync(plainToInstance(Dto, { reason: 'x' }));
    expect(errors).toHaveLength(1);
  });

  it('rejects a missing reason, because it is written to the audit trail', () => {
    const errors = validateSync(plainToInstance(Dto, {}));
    expect(errors).toHaveLength(1);
  });

  it('rejects a non-string reason', () => {
    const errors = validateSync(plainToInstance(Dto, { reason: 12345 }));
    expect(errors).toHaveLength(1);
  });
});
