#!/usr/bin/env node
/**
 * Invitations by email, reset by code, and changing a password — against the running API.
 *
 * Runs in development, where the API hands back the one-time link token and reset code it would
 * otherwise only email, so the whole path is driven without a mailbox:
 *
 *   an administrator adds a member → the invitation is queued, with a temporary password as the
 *   fallback → signing in with it leaves the account marked "choose your own" → the link shows the
 *   address and sets a password once → the temporary password stops working →
 *   forgot password answers the same for unknown addresses → a code survives five wrong guesses →
 *   the right code resets the password and signs out old sessions → changing it needs the current
 *   one and keeps the person signed in.
 *
 *   pnpm verify:password-flows
 */
import { call, finish, good, jar, ok, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
const post = (cookies, path, body, csrf) =>
  call(cookies, 'POST', path, body, csrf ? { 'x-csrf-token': csrf } : undefined);
const signIn = async (email, password) => {
  const cookies = jar();
  const response = await post(cookies, '/v1/auth/login', { email, password });
  return { cookies, response, csrf: response.payload?.csrfToken };
};

const t = await tenant('pw');
const email = `newcomer.${Date.now()}@pw.test`;
const employeeRole = rows((await t.org('GET', '/roles')).payload).find(
  (r) => r.code === 'EMPLOYEE',
);

console.log('an invitation');
const added = await t.org('POST', '/members', {
  email,
  displayName: 'New Comer',
  roleIds: [employeeRole?.id],
  reason: 'Joining the team',
});
ok('the administrator adds a member', good(added), status(added));
ok('the invitation email is queued', added.payload?.invitation?.queued === true);
const temporary = added.payload?.temporaryPassword;
const setupToken = added.payload?.invitation?.developmentSetupToken;
ok('with the temporary password kept only as the fallback', typeof temporary === 'string');

const withTemporary = await signIn(email, temporary);
ok('the temporary password signs in', good(withTemporary.response), status(withTemporary.response));
const meBefore = await call(withTemporary.cookies, 'GET', '/v1/auth/me');
ok(
  'and the account asks for a password of its own',
  meBefore.payload?.user?.passwordChangeRequired === true,
  String(meBefore.payload?.user?.passwordChangeRequired),
);

const preview = await post(jar(), '/v1/auth/password/setup/preview', { token: setupToken });
ok('the link shows whose account it is', preview.payload?.email === email, status(preview));
const tooShort = await post(jar(), '/v1/auth/password/setup', {
  token: setupToken,
  password: 'short',
});
ok('a password under twelve characters is refused', tooShort.status === 400, status(tooShort));
const chosen = 'my own long password';
const setUp = await post(jar(), '/v1/auth/password/setup', { token: setupToken, password: chosen });
ok('the link sets the password', good(setUp) && setUp.payload?.email === email, status(setUp));
const reused = await post(jar(), '/v1/auth/password/setup', {
  token: setupToken,
  password: 'another long password',
});
ok('and cannot be used twice', reused.status === 401, status(reused));
const oldSession = await call(withTemporary.cookies, 'GET', '/v1/auth/me');
ok(
  'the session opened with the temporary password is signed out',
  oldSession.status === 401,
  status(oldSession),
);
const temporaryAgain = await signIn(email, temporary);
ok('the temporary password no longer works', temporaryAgain.response.status === 401);
const withChosen = await signIn(email, chosen);
ok('the chosen password does', good(withChosen.response), status(withChosen.response));
const meAfter = await call(withChosen.cookies, 'GET', '/v1/auth/me');
ok(
  'and the account no longer asks for one',
  meAfter.payload?.user?.passwordChangeRequired === false,
);

console.log('\nforgot password');
const unknown = await post(jar(), '/v1/auth/password/forgot', { email: 'nobody-here@pw.test' });
ok(
  'an unknown address gets the same answer, and no code',
  good(unknown) && unknown.payload?.accepted === true && !unknown.payload?.developmentCode,
  status(unknown),
);
const requested = await post(jar(), '/v1/auth/password/forgot', { email });
const code = requested.payload?.developmentCode;
ok('a known address is sent a six-digit code', /^\d{6}$/.test(String(code)), status(requested));
const again = await post(jar(), '/v1/auth/password/forgot', { email });
ok('a second request inside a minute sends nothing new', !again.payload?.developmentCode);

const wrong = code === '000000' ? '111111' : '000000';
let lastWrong;
for (let attempt = 1; attempt <= 5; attempt += 1)
  lastWrong = await post(jar(), '/v1/auth/password/reset', {
    email,
    code: wrong,
    password: 'wrong guess password',
  });
ok(
  'the fifth wrong code withdraws it',
  /Too many wrong codes/.test(lastWrong?.payload?.detail ?? ''),
  status(lastWrong),
);
const afterLock = await post(jar(), '/v1/auth/password/reset', {
  email,
  code,
  password: 'reset after lock pw',
});
ok('so even the right code no longer works', afterLock.status === 401, status(afterLock));

const fresh = await post(jar(), '/v1/auth/password/forgot', { email });
const freshCode = fresh.payload?.developmentCode;
ok('a new code can be requested at once', /^\d{6}$/.test(String(freshCode)));
const resetPassword = 'reset by code password';
const reset = await post(jar(), '/v1/auth/password/reset', {
  email,
  code: freshCode,
  password: resetPassword,
});
ok('the right code resets the password', good(reset), status(reset));
const chosenSession = await call(withChosen.cookies, 'GET', '/v1/auth/me');
ok('and signs out every existing session', chosenSession.status === 401, status(chosenSession));

console.log('\nchanging it while signed in');
const signedIn = await signIn(email, resetPassword);
const wrongCurrent = await post(
  signedIn.cookies,
  '/v1/auth/password/change',
  { currentPassword: 'not the password', newPassword: 'changed in profile pw' },
  signedIn.csrf,
);
ok('the current password is required', wrongCurrent.status === 401, status(wrongCurrent));
const changed = await post(
  signedIn.cookies,
  '/v1/auth/password/change',
  { currentPassword: resetPassword, newPassword: 'changed in profile pw' },
  signedIn.csrf,
);
ok('changing it succeeds', good(changed), status(changed));
const stillIn = await call(signedIn.cookies, 'GET', '/v1/auth/me');
ok('and the person who changed it stays signed in', good(stillIn), status(stillIn));
const finalSignIn = await signIn(email, 'changed in profile pw');
ok('the new password signs in', good(finalSignIn.response), status(finalSignIn.response));

finish();
