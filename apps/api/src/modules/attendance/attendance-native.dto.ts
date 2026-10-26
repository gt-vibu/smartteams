import { IsOptional } from 'class-validator';
import { IsNumberBetween, IsText, withRules } from '../../common/validation/field-rules';
import { PunchDto } from './attendance.dto';

/**
 * The website's own check-in and check-out, with limits the shared punch (which federation also
 * sends) does not carry. The shared input is unchanged.
 */
export class NativePunchDto extends PunchDto {}
withRules(NativePunchDto, {
  // A phone's reported accuracy; beyond 100 km it locates nothing.
  accuracyMeters: [IsOptional(), IsNumberBetween('Location accuracy', 0, 100_000)],
  externalId: [IsOptional(), IsText('Reference', 120)],
});
