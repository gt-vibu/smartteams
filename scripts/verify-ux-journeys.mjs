/* global document, innerWidth */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { tenant, good } from './lib/authz-harness.mjs';
import { seedUxLists } from './lib/ux-audit-fixtures.mjs';

const t = await tenant('ux-journeys');
await t.a.completeOnboarding();
await t.b.completeOnboarding();
await seedUxLists(t);
const browser = await chromium.launch({ headless: true });
const errors = [];
fs.mkdirSync('scratch/ux-journeys', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addCookies(
    t.cookies
      .header()
      .split('; ')
      .map((pair) => {
        const i = pair.indexOf('=');
        return {
          name: pair.slice(0, i),
          value: pair.slice(i + 1),
          url: 'http://localhost:3000',
          sameSite: 'Lax',
        };
      }),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  const open = async (module) =>
    page.goto(`http://localhost:3000/?space=organization&module=${module}`, {
      waitUntil: 'networkidle',
    });
  const status = (regex) => page.getByRole('status').filter({ hasText: regex }).first();
  await open('attendance');
  await status(/Page 1 · 100 records/).waitFor();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await status(/Page 2 · 20 records/).waitFor();
  const attendanceSearch = page.getByRole('textbox', { name: 'Search employee', exact: true });
  await attendanceSearch.fill('Audit UX-119');
  await status(/Page 1 · 1 records/).waitFor();
  assert.equal(await page.locator('main tbody tr').count(), 1);
  assert.match(await page.locator('main tbody').innerText(), /UX-119/);
  await attendanceSearch.fill('');
  await status(/Page 1 · 100 records/).waitFor();
  const self = await t.a.as('GET', '/attendance?search=Audit&limit=100');
  assert.ok(good(self));
  assert.equal(self.payload.records.length, 0, 'Search must preserve self scope');
  console.log('Attendance: full-name search across pages, filter resets and self scope passed.');
  await open('time-off');
  await status(/Page 1 · 100 records/).waitFor();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await status(/Page 2 · 21 records/).waitFor();
  const leaveSearch = page.getByRole('textbox', { name: 'Search leave requests' });
  await leaveSearch.fill('Audit UX-119');
  await status(/Page 1 · 1 records/).waitFor();
  assert.equal(
    await leaveSearch.evaluate((e) => e === document.activeElement),
    true,
    'Search focus survives loading',
  );
  const row = page.locator('main tr[role="button"]').first();
  await row.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /Audit UX-119/);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('tab', { name: 'Approved', exact: true }).click();
  await status(/Page 1 · 0 records/).waitFor();
  assert.equal(
    await page.locator('main tr[role="button"]').count(),
    0,
    'Status applies before paging',
  );
  console.log('Leave: paging, server status, search focus and keyboard request inspection passed.');
  await open('reports');
  await page.getByRole('tab', { name: 'Attendance', exact: true }).click();
  await page.getByText(/Export all includes 122 records/).waitFor();
  assert.equal(await page.locator('main tbody tr').count(), 50);
  const fullExportEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const fullExport = await fullExportEvent;
  assert.equal(
    fs
      .readFileSync(await fullExport.path(), 'utf8')
      .trim()
      .split(/\r?\n/).length,
    123,
    'Export includes every report page before search',
  );
  await page.getByRole('button', { name: 'Next report page' }).click();
  await page.getByRole('textbox', { name: 'Search By person' }).fill('UX-119');
  assert.equal(await page.locator('main tbody tr').count(), 1);
  const filteredExportEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const filteredExport = await filteredExportEvent;
  const exported = fs.readFileSync(await filteredExport.path(), 'utf8');
  assert.equal(
    exported.trim().split(/\r?\n/).length,
    2,
    'Export includes all filtered report rows across pages',
  );
  // Fail a real browser request, then recover through the offered retry.
  await page.route('**/reports/attendance?*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Temporarily unavailable for UX verification' }),
    }),
  );
  await page.getByRole('tab', { name: 'Last month', exact: true }).click();
  await page.locator('main').getByRole('alert').waitFor();
  await page.unroute('**/reports/attendance?*');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByText(/Export all includes 122 records/).waitFor();
  console.log('Reports: bounded rows, complete search/export and network failure recovery passed.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'scratch/ux-journeys/mobile-report.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('All populated UX journeys passed without browser errors.');
} finally {
  await browser.close();
}
