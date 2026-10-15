// Shared helpers for the launcher/remote E2E suites (dev/frontend/playwright.config.mjs).
import fs from 'node:fs';
import path from 'node:path';

export const PORT = Number(process.env.MOCK_PORT || 8099);
export const TV = `http://127.0.0.1:${PORT}`;

export async function mock(hook, query = '') {
  const response = await fetch(`${TV}/__mock/${hook}${query}`);
  return response.json();
}
// Calls the API as the local TV (loopback privilege), e.g. to start pairing.
export async function tvApi(apiPath, method = 'GET', body) {
  const response = await fetch(`${TV}/api/v3${apiPath}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}
export async function inputs() { return (await mock('inputs')).inputs; }

export async function shot(page, name) {
  const dir = process.env.E2E_SCREENSHOT_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}
// Fails the test on uncaught page errors (console 401s during pairing are expected).
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}
export const focusedKey = page => page.evaluate(() => document.activeElement?.dataset?.key || null);
