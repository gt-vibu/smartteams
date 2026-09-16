#!/usr/bin/env node
/**
 * Authentication and authorization integration check.
 *
 * Exercises the running API over HTTP with real cookies, a real database and real Postgres RLS.
 * The Jest suite mocks the Prisma client, so it cannot see failures that only appear against a
 * live stack — a missing audit `reason` on a privileged query, a JWT signed without the claims
 * its verifier demands, a `select` naming a column that does not exist. Every one of those
 * shipped past a green unit run.
 *
 * Each capability is asserted in BOTH directions: that the right principal is allowed AND that
 * the wrong one is denied. Testing only the denial direction lets a fail-closed bug pass as a
 * security success.
 *
 * Usage (API, Postgres and Redis must be running, and the database seeded):
 *   pnpm verify:auth
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_BASE_URL ?? 'http://localhost:4000';

/**
 * Shared response contracts, used to assert that what the API actually returns still satisfies
 * the schema both web apps parse it with. A drift here breaks the frontends at runtime with a
 * "response was not valid" error that no backend test would catch.
 */
const contracts = await import(
  pathToFileURL(resolve(here, '..', 'packages', 'contracts', 'dist', 'index.js')).href
).catch(() => null);

const env = Object.fromEntries(
  readFileSync(resolve(here, '..', '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  if (ok) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(`${label}: got ${actual}, expected ${expected}`);
    console.log(`  FAIL  ${label} -> ${actual} (expected ${expected})`);
  }
}

/** Asserts a live response still satisfies the shared contract the web apps parse it with. */
function checkContract(label, schemaName, payload) {
  if (!contracts) {
    console.log(`  skip  ${label} (build @smarteam/contracts to enable contract assertions)`);
    return;
  }
  const result = contracts[schemaName].safeParse(payload);
  if (result.success) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    failures.push(`${label}: ${detail}`);
    console.log(`  FAIL  ${label} -> ${detail}`);
  }
}

/** Minimal cookie jar, so the real HttpOnly cookie flow is exercised rather than bypassed. */
function jar() {
  const store = new Map();
  return {
    absorb(response) {
      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1).trim();
        if (value === '') store.delete(name);
        else store.set(name, value);
      }
    },
    header() {
      return [...store].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    get(name) {
      return store.get(name);
    },
  };
}

async function call(j, method, path, body, extra) {
  const headers = { Accept: 'application/json', ...(extra ?? {}) };
  if (body) headers['Content-Type'] = 'application/json';
  const cookie = j.header();
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  j.absorb(response);
  let payload = null;
  try {
    payload = await response.json();
  } catch {}
  return { status: response.status, payload };
}

const onboard = (slug) => ({
  name: `Verify ${slug}`,
  slug,
  timezone: 'Asia/Kolkata',
  currencyCode: 'INR',
  adminEmail: `admin@${slug}.test`,
  adminDisplayName: 'Verify Admin',
  reason: 'automated authorization verification',
});

async function main() {
  console.log('platform operator — allowed direction');
  const P = jar();
  let r = await call(P, 'POST', '/v1/auth/platform-login', {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
  });
  check('platform login', r.status, 201);
  if (r.status !== 201) throw new Error('cannot continue without a platform session');
  checkContract('login response matches contract', 'loginResponseSchema', r.payload);
  const H = { 'x-csrf-token': r.payload.csrfToken };
  check(
    'login body carries no token',
    /accessToken|refreshToken/.test(JSON.stringify(r.payload)),
    false,
  );

  r = await call(P, 'GET', '/v1/auth/me');
  check('platform /me', r.status, 200);
  checkContract('platform /me matches contract', 'authenticatedSessionSchema', r.payload);
  check('platform flagged as operator', r.payload?.platform?.isPlatformOperator, true);
  check('platform session has no tenant', r.payload?.organization, null);
  check(
    '/me leaks no secrets',
    /passwordHash|refreshTokenHash|tokenVersion/.test(JSON.stringify(r.payload)),
    false,
  );

  // Regression: this listing needs an audit reason on its privileged query. Without one it
  // fails closed with a 403 that is indistinguishable from a permission denial.
  r = await call(P, 'GET', '/v1/organizations');
  check('platform lists organizations', r.status, 200);
  r = await call(P, 'GET', '/v1/platform/federation-clients');
  check('platform lists federation clients', r.status, 200);

  const slugA = `va-${Date.now().toString(36)}`;
  const slugB = `vb-${Date.now().toString(36)}`;
  r = await call(P, 'POST', '/v1/organizations/onboard', onboard(slugA), H);
  check('onboard tenant A', r.status, 201);
  const orgA = r.payload?.organization?.id;
  const credsA = { email: `admin@${slugA}.test`, password: r.payload?.temporaryPassword };
  r = await call(P, 'POST', '/v1/organizations/onboard', onboard(slugB), H);
  check('onboard tenant B', r.status, 201);
  const orgB = r.payload?.organization?.id;
  const credsB = { email: `admin@${slugB}.test`, password: r.payload?.temporaryPassword };

  console.log('csrf');
  r = await call(P, 'POST', '/v1/organizations/onboard', onboard(`x-${Date.now().toString(36)}`));
  check('cookie mutation without csrf token is refused', r.status, 403);

  console.log('tenant A — allowed direction');
  const A = jar();
  r = await call(A, 'POST', '/v1/auth/login', credsA);
  check('tenant A login', r.status, 201);
  const AH = { 'x-csrf-token': r.payload?.csrfToken };
  r = await call(A, 'GET', '/v1/auth/me');
  check('tenant A /me', r.status, 200);
  // The tenant payload is the richer one: organization, roles and employee are all populated.
  checkContract('tenant /me matches contract', 'authenticatedSessionSchema', r.payload);
  check('tenant A bound to its own tenant', r.payload?.organization?.id, orgA);
  check('tenant admin is not a platform operator', r.payload?.platform?.isPlatformOperator, false);

  for (const [label, path] of [
    ['org', ''],
    ['branches', '/branches'],
    ['roles', '/roles'],
    ['teams', '/teams'],
    ['projects', '/projects'],
  ]) {
    r = await call(A, 'GET', `/v1/organizations/${orgA}${path}`);
    check(`tenant A reads own ${label}`, r.status, 200);
  }
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgA}/branches`,
    { name: 'Verify Branch', code: `VB${Date.now() % 10000}` },
    AH,
  );
  check('tenant A writes to own tenant', r.status, 201);

  console.log('tenant isolation — denied direction');
  for (const [label, path] of [
    ['org', ''],
    ['branches', '/branches'],
    ['roles', '/roles'],
    ['teams', '/teams'],
  ]) {
    r = await call(A, 'GET', `/v1/organizations/${orgB}${path}`);
    check(`tenant A cannot read tenant B ${label}`, r.status, 403);
  }
  r = await call(
    A,
    'POST',
    `/v1/organizations/${orgB}/branches`,
    { name: 'Evil', code: 'EVL' },
    AH,
  );
  check('tenant A cannot write to tenant B', r.status, 403);
  r = await call(A, 'GET', '/v1/organizations');
  check('tenant cannot list the tenant directory', r.status, 403);
  r = await call(A, 'GET', '/v1/platform/federation-clients');
  check('tenant cannot reach federation administration', r.status, 403);

  const B = jar();
  r = await call(B, 'POST', '/v1/auth/login', credsB);
  check('tenant B login', r.status, 201);
  r = await call(B, 'GET', `/v1/organizations/${orgA}`);
  check('tenant B cannot read tenant A', r.status, 403);
  r = await call(B, 'GET', `/v1/organizations/${orgB}`);
  check('tenant B reads its own tenant', r.status, 200);

  console.log('credentials');
  const W = jar();
  r = await call(W, 'POST', '/v1/auth/login', { email: credsA.email, password: 'wrong-password' });
  check('wrong password refused', r.status, 401);
  const unknownMessage = (
    await call(jar(), 'POST', '/v1/auth/login', { email: 'nobody@nowhere.test', password: 'x' })
  ).payload?.detail;
  check(
    'unknown account is indistinguishable from a wrong password',
    unknownMessage,
    r.payload?.detail,
  );

  console.log('session lifecycle');
  const S = jar();
  r = await call(S, 'POST', '/v1/auth/login', credsA);
  check('session login', r.status, 201);
  const spentRefresh = S.get('smarteam_session_refresh');
  r = await call(S, 'POST', '/v1/auth/refresh', null, {
    'x-csrf-token': S.get('smarteam_session_csrf'),
  });
  check('refresh rotates the session', r.status, 201);
  check('refresh token is single-use', spentRefresh !== S.get('smarteam_session_refresh'), true);
  r = await call(S, 'GET', '/v1/auth/me');
  check('session works after refresh', r.status, 200);

  const replay = await fetch(`${BASE}/v1/auth/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json', Cookie: `smarteam_session_refresh=${spentRefresh}` },
  });
  check('replaying a spent refresh token is refused', replay.status, 401);
  r = await call(S, 'GET', '/v1/auth/me');
  check('reuse detection revokes the whole token family', r.status, 401);

  const L = jar();
  await call(L, 'POST', '/v1/auth/login', credsA);
  r = await call(L, 'POST', '/v1/auth/logout', null, {
    'x-csrf-token': L.get('smarteam_session_csrf'),
  });
  check('logout', r.status, 201);
  r = await call(L, 'GET', '/v1/auth/me');
  check('session is dead after logout', r.status, 401);

  r = await call(jar(), 'GET', '/v1/auth/me');
  check('unauthenticated /me is refused', r.status, 401);
}

main()
  .then(() => {
    console.log(`\n${passed} passed, ${failures.length} failed`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(failures.length === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error(`\nverification aborted: ${error.message}`);
    console.error('Is the API running on ' + BASE + ' with a seeded database?');
    process.exit(1);
  });
