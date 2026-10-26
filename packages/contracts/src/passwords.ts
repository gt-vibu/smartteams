/**
 * The rule every new password meets, in every flow: sign-up, invitation, activation, reset and
 * change. It follows NIST SP 800-63B: at least 8 characters, no forced mix of symbols, and no
 * password that is known to be common. One definition for the forms and the API.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Among the most used passwords in breach lists, compared ignoring case. */
const COMMON = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  'password@123',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword',
  'pa$$word',
  'passpass',
  'letmein1',
  'letmein123',
  'welcome1',
  'welcome123',
  'welcome@123',
  'iloveyou',
  'iloveyou1',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'superman',
  'starwars',
  'whatever',
  'trustno1',
  'dragon123',
  'monkey123',
  'master123',
  'shadow123',
  'qwerty123',
  'qwertyuiop',
  'qwerty12',
  'qwerty1234',
  'asdfghjkl',
  'asdf1234',
  'zxcvbnm1',
  '1q2w3e4r',
  '1q2w3e4r5t',
  'abc12345',
  'abcd1234',
  'abcdefgh',
  'admin123',
  'admin@123',
  'administrator',
  'changeme',
  'changeme1',
  'default1',
  'secret123',
  'test1234',
  'testing123',
  'computer',
  'internet',
  'india123',
  'india@123',
  'bharat123',
  'smarteam',
  'smarteam1',
  'smarteam123',
  '11111111',
  '00000000',
  '12121212',
  '12341234',
  '12344321',
  '12345678',
  '123456789',
  '1234567890',
  '0123456789',
  '87654321',
  '98765432',
  '11223344',
  '88888888',
  '99999999',
  '66666666',
  '55555555',
  '22222222',
  '33333333',
  '44444444',
  '77777777',
  'aaaaaaaa',
  'qwertyui',
  'football1',
  'michael1',
  'jennifer',
  'charlie1',
  'hello123',
  'hellohello',
  'loveyou1',
  'freedom1',
  'computer1',
  'mustang1',
  'access14',
  'batman123',
]);

/** A sentence for the person when the password will not do, or null when it is fine. */
export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH)
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'That password is too common. Choose something less guessable.';
  if (/^(.)\1+$/.test(password)) return 'Do not repeat one character.';
  const name = (email ?? '').split('@')[0]?.toLowerCase() ?? '';
  if (name.length >= 4 && lower.includes(name))
    return 'Do not use your email name in your password.';
  return null;
}
