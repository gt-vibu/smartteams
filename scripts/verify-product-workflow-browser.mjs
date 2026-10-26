/* global document, innerWidth */

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { tenant } from './lib/authz-harness.mjs';
import fs from 'node:fs';
const t = await tenant('workflow-browser');
await t.org('POST', '/payroll/runs', { periodStart: '2026-11-01', periodEnd: '2026-11-30' });
const browser = await chromium.launch({ headless: true });
const errors = [];
const open = async (cookies, landing = 'Approvals') => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addCookies(
    cookies
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
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  try {
    await page
      .getByRole('button', { name: landing, exact: true })
      .first()
      .waitFor({ timeout: 20000 });
  } catch (e) {
    console.log('Available navigation:', await page.getByRole('button').allTextContents());
    await page.screenshot({
      path: 'scratch/product-workflow-browser/navigation-debug.png',
      fullPage: true,
    });
    throw e;
  }
  return page;
};
try {
  fs.mkdirSync('scratch/product-workflow-browser', { recursive: true });
  const page = await open(t.cookies);
  await page.getByRole('button', { name: 'Approvals', exact: true }).first().click();
  await page.getByRole('button', { name: 'Leave cancellations', exact: true }).click();
  await page.getByText('Cancellation settings', { exact: true }).click();
  await page.getByLabel('Future leave cancellation').selectOption('REVIEW');
  await page.getByRole('button', { name: 'Save cancellation settings', exact: true }).click();
  await page.waitForTimeout(1500);
  assert.equal(
    (await t.org('GET', '/leave/workflows/settings')).payload.futureCancellation,
    'REVIEW',
  );
  await page.screenshot({
    path: 'scratch/product-workflow-browser/hr-cancellation-settings.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Overview', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Employee readiness', exact: true }).click();
  await page.getByRole('heading', { name: 'Employee readiness', exact: true }).waitFor();
  await page.getByText('Ada Case · EMP-001', { exact: true }).first().waitFor();
  await page.screenshot({
    path: 'scratch/product-workflow-browser/hr-readiness-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Readiness must fit a mobile viewport',
  );
  await page.screenshot({
    path: 'scratch/product-workflow-browser/hr-readiness-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole('button', { name: 'Payroll', exact: true }).first().click();
  await page
    .getByText(/Payroll readiness/)
    .first()
    .waitFor();
  await page
    .getByText(/Payroll readiness/)
    .first()
    .click();
  await page
    .getByText(/Assign an effective salary/)
    .first()
    .waitFor();
  await page.screenshot({
    path: 'scratch/product-workflow-browser/payroll-readiness.png',
    fullPage: true,
  });
  // Separate real employee session; no administrator capabilities carried into it.
  await t.a.completeOnboarding();
  const employee = await open(t.a.cookies, 'Leave');
  await employee.getByRole('button', { name: 'Leave', exact: true }).first().click();
  await employee.getByRole('button', { name: 'Apply for leave', exact: true }).first().click();
  await employee.getByLabel('Duration', { exact: true }).selectOption('FIRST_HALF');
  await employee.setViewportSize({ width: 390, height: 844 });
  await employee.waitForTimeout(500);
  const box = await employee.getByRole('dialog').boundingBox();
  assert.ok(
    box && box.x >= 0 && box.x + box.width <= 391,
    `Leave dialog must fit mobile: ${JSON.stringify(box)}`,
  );
  assert.equal(
    await employee.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Half-day form must fit mobile',
  );
  await employee.screenshot({
    path: 'scratch/product-workflow-browser/employee-half-day-mobile.png',
    fullPage: true,
  });
  assert.deepEqual(errors, [], 'Role journeys must not raise browser errors');
  console.log('HR, payroll and employee browser journeys passed; desktop/mobile captures saved.');
} finally {
  await browser.close();
}
