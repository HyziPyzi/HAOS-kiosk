// Frontend ↔ real backend check (not the mock). Start Codex's harness first:
//   python dev/backend/serve.py --assets <frontend>/haoskiosk --mock-adapters \
//     --port 8080 --remote-port 8443 --cert <lab cert> --key <lab key>
// then: node real-api-check.mjs [screenshot-dir]
// HA, Chrome/CDP and X are fixtures in that harness; API, auth, TLS, cookies,
// WebSocket and storage are the real implementation.
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';

const out = process.argv[2];
const TV = 'http://127.0.0.1:8080/launcher/';
const PHONE = 'https://127.0.0.1:8443/remote/';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const phoneCtx = await browser.newContext({ ...devices['iPhone 14'], ignoreHTTPSErrors: true });
const tv = await tvCtx.newPage();
const phone = await phoneCtx.newPage();
const errors = [];
for (const [name, page] of [['tv', tv], ['phone', phone]]) page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
const shot = async (page, name) => { if (!out) return; await page.bringToFront(); await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${name}.png` }); };
const step = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (error) { console.log('FAIL', name, '-', error.message.split('\n')[0]); process.exitCode = 1; } };

await step('TV launcher loads v3 state over loopback', async () => {
  await tv.goto(TV);
  await tv.waitForFunction(() => document.activeElement?.dataset?.key?.startsWith('fav:'));
  assert.equal(await tv.evaluate(() => window.__smartTv.state.version), '3.0.0');
  await shot(tv, 'real-tv-home');
});
let pin;
await step('TV starts pairing and shows the PIN', async () => {
  await tv.locator('[data-key="top:pair"]').click();
  await tv.locator('.pin span').first().waitFor();
  pin = (await tv.locator('.pin').textContent()).trim();
  assert.match(pin, /^\d{6}$/);
  await shot(tv, 'real-tv-pairing');
});
await step('Phone over HTTPS refuses a wrong PIN, accepts the right one', async () => {
  await phone.goto(PHONE);
  await phone.getByRole('heading', { name: 'Połącz z telewizorem' }).waitFor();
  const wrong = pin === '000000' ? '111111' : '000000';
  await phone.locator('.pin-boxes input').fill(wrong);
  await phone.getByRole('button', { name: 'Połącz z telewizorem' }).click();
  await phone.locator('.pair .error').filter({ hasText: /\S/ }).waitFor();
  console.log('     wrong PIN message:', await phone.locator('.pair .error').textContent());
  await phone.locator('.pin-boxes input').fill(pin);
  await phone.getByLabel('Nazwa tego telefonu').fill('iPhone integracja');
  await phone.getByRole('button', { name: 'Połącz z telewizorem' }).click();
  await phone.locator('#conn.online').waitFor({ timeout: 8000 });
  const cookies = await phoneCtx.cookies();
  const c = cookies.find(x => x.name === '__Host-smarttv');
  assert.ok(c && c.httpOnly && c.secure && c.sameSite === 'Strict', 'secure session cookie');
  assert.equal(await phone.evaluate(() => document.cookie.includes('smarttv')), false);
  await shot(phone, 'real-phone-remote');
});
await step('TV closes the PIN screen after pairing', async () => {
  await tv.getByText('Sparowano: iPhone integracja').waitFor({ timeout: 5000 });
});
await step('Phone keys are acknowledged over WebSocket (no error toast)', async () => {
  await phone.getByRole('tab', { name: 'Strzałki' }).click();
  for (const name of ['W prawo', 'W dół']) await phone.getByRole('button', { name }).click();
  await phone.getByRole('button', { name: 'OK', exact: true }).click();
  await phone.waitForTimeout(400);
  assert.equal(await phone.locator('.toast.show.error').count(), 0);
});
await step('Phone one-click launch reaches "completed"', async () => {
  await phone.getByRole('button', { name: 'Otwórz YouTube' }).click();
  await phone.locator('.op-stage').waitFor();
  await phone.waitForFunction(() => window.__remote.state?.operation?.state === 'completed' || document.querySelector('.op-stage')?.textContent.includes('Gotowe'), null, { timeout: 15000 });
  await shot(phone, 'real-phone-launch');
});
await step('Phone text command is parsed by the backend', async () => {
  await phone.locator('.sheet .btn').click().catch(() => {});
  await phone.locator('.tab', { hasText: 'Polecenia' }).click();
  await phone.getByRole('textbox', { name: 'Polecenie' }).fill('Pauza');
  await phone.getByRole('button', { name: 'Wyślij polecenie' }).click();
  await phone.locator('.history li').first().filter({ hasText: /Wykonano|Nie rozumiem|Nie udało/ }).waitFor();
  console.log('     "Pauza":', await phone.locator('.history li').first().textContent());
});
await step('Local/control URLs are refused by the UI and by the backend (S1)', async () => {
  await phone.locator('.tab', { hasText: 'Pilot' }).click();
  await phone.getByRole('button', { name: 'Strona' }).click();
  await phone.locator('.sheet .kbd-input').fill('localhost:9222/json');
  await phone.getByRole('button', { name: 'Otwórz', exact: true }).click();
  await phone.locator('.sheet .op-error').filter({ hasText: 'Adresy lokalne' }).waitFor();
  await phone.getByRole('button', { name: 'Anuluj' }).click();
  // Bypass the UI check: the server must still refuse every alternate form.
  for (const url of ['http://127.0.0.1:9222/json', 'http://2130706433:8080/', 'http://[::ffff:127.0.0.1]:8443/', 'http://localhost./']) {
    const result = await phone.evaluate(async target => {
      const r = await fetch('/api/v3/apps/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: target }) });
      return { status: r.status, code: (await r.json()).error?.code };
    }, url);
    assert.equal(result.status, 400, `${url} -> ${JSON.stringify(result)}`);
  }
  const ok = await phone.evaluate(async () => (await fetch('/api/v3/apps/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://vod.tvp.pl/' }) })).status);
  assert.equal(ok, 202);
});
await step('TV lists and revokes the phone; the phone returns to pairing', async () => {
  await tv.keyboard.press('Escape');
  await tv.locator('[data-key="top:settings"]').click();
  await tv.locator('[data-key="set:remotes"]').click();
  await tv.locator('[data-key^="dev:"]').first().waitFor();
  await shot(tv, 'real-tv-remotes');
  await tv.locator('[data-key^="dev:"]').last().click(); // newest = this phone
  await tv.getByRole('button', { name: 'Odłącz ten telefon' }).click();
  await phone.getByRole('heading', { name: 'Połącz z telewizorem' }).waitFor({ timeout: 10000 });
});
await step('No uncaught page errors', async () => { assert.deepEqual(errors, []); });
await browser.close();
