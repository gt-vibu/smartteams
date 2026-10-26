/* global document, innerWidth */

import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { jar, call, good } from './lib/authz-harness.mjs';

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [
        line.slice(0, i).trim(),
        line
          .slice(i + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ''),
      ];
    }),
);
const cookies = jar();
const login = await call(cookies, 'POST', '/v1/auth/platform-login', {
  email: process.env.SUPERADMIN_EMAIL ?? env.SUPERADMIN_EMAIL,
  password: process.env.SUPERADMIN_PASSWORD ?? env.SUPERADMIN_PASSWORD,
});
if (!good(login)) throw new Error(`Platform test account sign-in failed: HTTP ${login.status}`);
const browser = await chromium.launch({ headless: true });
const dir = 'scratch/whole-app-ux/platform';
fs.mkdirSync(dir, { recursive: true });
const results = [];
const errors = [];
const appBase = process.env.PLATFORM_UI_URL ?? 'http://localhost:3001';
try {
  const context = await browser.newContext();
  await context.addCookies(
    cookies
      .header()
      .split('; ')
      .map((pair) => {
        const i = pair.indexOf('=');
        return {
          name: pair.slice(0, i),
          value: pair.slice(i + 1),
          url: appBase,
          sameSite: 'Lax',
        };
      }),
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(appBase, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Companies', exact: true }).waitFor({
    state: 'visible',
    timeout: 15000,
  });
  console.log(
    `Platform console initial content: ${(await page.locator('body').innerText()).slice(0, 400)}`,
  );
  for (const tab of ['Companies', 'Integrations']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    for (const [size, width, height] of [
      ['desktop', 1366, 900],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(300);
      await page.waitForLoadState('networkidle');
      await page
        .getByText('Loading…', { exact: true })
        .waitFor({
          state: 'hidden',
          timeout: 15000,
        })
        .catch(() => {});
      await page.screenshot({ path: `${dir}/${tab}-${size}.png`, fullPage: true });
      const state = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        text: document.body.innerText,
      }));
      results.push({ tab, size, ...state });
      console.log(`${tab}/${size}: overflow=${state.overflow}`);
    }
  }
  await page.getByRole('button', { name: 'Create Client', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  let box = await page.getByRole('dialog').boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 391, 'Client setup dialog fits mobile');
  await page.screenshot({ path: `${dir}/client-form-mobile.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Companies', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search companies' }).fill('whole-app-ux');
  await page.getByRole('button', { name: 'Deactivate', exact: true }).first().click();
  await page.getByRole('dialog').waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Deactivate company', exact: true }).isDisabled(),
    true,
  );
  box = await page.getByRole('dialog').boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 391, 'Company confirmation fits mobile');
  await page.getByRole('textbox', { name: 'Reason (required)' }).fill('UX review only');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0, 'Cancellation returns to the list');
  await page.route('**/v1/auth/me', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Workspace temporarily unavailable' }),
    }),
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Could not connect to your workspace' }).waitFor();
  await page.unroute('**/v1/auth/me');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('button', { name: 'Companies', exact: true }).waitFor();
  console.log(
    'Mobile client form, company confirmation/cancellation and session failure recovery passed.',
  );
  fs.writeFileSync(`${dir}/results.json`, JSON.stringify({ results, errors }, null, 2));
  if (results.some((r) => r.overflow) || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
