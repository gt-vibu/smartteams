import { ValidateBy } from 'class-validator';
import { passwordProblem } from '@smarteam/contracts';

/**
 * A new password meets the one rule the forms state: at least 8 characters and not a common
 * password (NIST SP 800-63B). Used on every request that sets a password.
 */
export function IsAcceptablePassword() {
  return ValidateBy({
    name: 'isAcceptablePassword',
    validator: {
      validate: (value: unknown) => typeof value === 'string' && passwordProblem(value) === null,
      defaultMessage: (args) =>
        typeof args?.value === 'string'
          ? (passwordProblem(args.value) ?? 'Choose a different password.')
          : 'Enter a password.',
    },
  });
}
