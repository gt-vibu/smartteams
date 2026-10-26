/* global document, innerWidth */

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs';
import { tenant, good } from './lib/authz-harness.mjs';
const t = await tenant('workforce-browser');
const browser = await chromium.launch({ headless: true });
const errors = [];
fs.mkdirSync('scratch/workforce-browser', { recursive: true });
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
  page.setDefaultTimeout(45000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('button', { name: 'Employees', exact: true }).first().click();
  await page.getByText('Bulk staff setup', { exact: true }).click();
  await page.getByRole('button', { name: 'Reporting manager', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Search reporting managers' });
  await search.fill('Bea');
  const manager = page.getByRole('button', { name: 'Bea Case · EMP-002', exact: true });
  await manager.waitFor();
  await manager.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'Search staff for assignment' }).fill('Ada');
  await page.getByRole('button', { name: 'Preview assignments', exact: true }).click();
  await page.getByRole('button', { name: 'Apply to 1 employees', exact: true }).click();
  await page.getByText(/Assignments finished/).waitFor();
  assert.match(await page.getByText(/applied ·.*need review/).innerText(), /1 applied/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Employees', exact: true }).first().click();
  await page.getByText(/Bulk staff setup/).click();
  await page.getByText(/Assignments finished/).waitFor();
  await page.screenshot({
    path: 'scratch/workforce-browser/onboarding-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Staff setup must fit mobile',
  );
  await page.screenshot({
    path: 'scratch/workforce-browser/onboarding-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole('button', { name: 'Approvals', exact: true }).first().click();
  await page.getByRole('button', { name: 'Workload', exact: true }).click();
  await page.getByText('Approval workload', { exact: true }).waitFor();
  await page.getByText('Your approval batches', { exact: true }).waitFor();
  await page.screenshot({
    path: 'scratch/workforce-browser/approval-workload.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Approval workflows', exact: true }).click();
  await page.getByRole('button', { name: 'New policy', exact: true }).click();
  // The searchable picker is tested within the native dialog using its configured stage type.
  await page.getByRole('dialog').waitFor();
  await page.getByRole('combobox', { name: 'Step 1 approver', exact: true }).click();
  await page.getByRole('option', { name: 'A specific person', exact: true }).click();
  await page.getByRole('button', { name: 'Step 1 person', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search Step 1 person', exact: true }).fill('Ada');
  const named = page.getByRole('button', { name: /Ada Case · EMP-001/ });
  await named.waitFor();
  await named.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Step 1 person', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search Step 1 person', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(
    await page.getByRole('textbox', { name: 'Search Step 1 person', exact: true }).count(),
    0,
    'Escape closes the picker',
  );
  assert.equal(
    await page.getByRole('dialog').count(),
    1,
    'Escape in a picker preserves the policy dialog',
  );
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, [], 'Workflow screens must not raise browser errors');
  const assigned = await t.org('GET', `/employees/${t.a.id}`);
  assert.ok(good(assigned), 'Admin can inspect the saved employee');
  console.log(
    'Keyboard manager and approver selection, nested Escape, one-person assignment, progress restoration, workload and mobile layout passed.',
  );
} finally {
  await browser.close();
}
