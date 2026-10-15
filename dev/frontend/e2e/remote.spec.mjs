// Phone remote (iPhone 14 viewport): pairing, touchpad, keys, launch, reconnect, revocation.
import { test, expect } from '@playwright/test';
import { mock, tvApi, inputs, shot, watchErrors } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await mock('reset');
  page.errors = watchErrors(page);
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

async function pair(page, name = 'iPhone testowy') {
  await page.goto('/remote/');
  await expect(page.getByRole('heading', { name: 'Połącz z telewizorem' })).toBeVisible();
  const { data } = await tvApi('/pairing/start', 'POST', {});
  await page.locator('.pin-boxes input').fill(data.pin);
  await page.getByLabel('Nazwa tego telefonu').fill(name);
  await page.getByRole('button', { name: 'Połącz z telewizorem' }).click();
  await expect(page.locator('#conn')).toHaveClass(/online/);
}
const sum = (list, type, field) => list.filter(i => i.type === type).reduce((a, i) => a + i[field], 0);

test('unpaired phone sees only the pairing screen; a wrong PIN is refused', async ({ page }) => {
  await page.goto('/remote/');
  await expect(page.locator('#tabs')).toBeHidden();
  await shot(page, 'remote-pairing');
  await tvApi('/pairing/start', 'POST', {});
  await page.locator('.pin-boxes input').fill('000000');
  const { pin } = await mock('pin');
  if (pin === '000000') test.skip(true, 'random PIN collided with the wrong one');
  await page.getByRole('button', { name: 'Połącz z telewizorem' }).click();
  await expect(page.locator('.pair .error')).toContainText('Nieprawidłowy albo wygasły kod');
  expect((await (await fetch(page.url().replace('/remote/', '/api/v3/state'))).status)).toBe(401);
});

test('pairing with the TV PIN opens the remote and the TV lists this phone', async ({ page }) => {
  await pair(page);
  await expect(page.locator('.tab.is-on')).toHaveText('Pilot');
  await expect(page.locator('.app-chip').first()).toBeVisible();
  const devices = (await tvApi('/devices')).data.devices;
  expect(devices.map(d => d.name)).toEqual(['iPhone testowy']);
  await shot(page, 'remote-iphone');
});

test('touchpad: drag moves, tap clicks, hold right-clicks, edge drag scrolls', async ({ page }) => {
  await pair(page);
  const pad = await page.locator('.pad').boundingBox();
  const cx = pad.x + pad.width / 2, cy = pad.y + pad.height / 2;
  await page.mouse.move(cx - 60, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(cx - 60 + i * 12, cy + i * 3); await page.waitForTimeout(16); }
  await page.mouse.up();
  await expect.poll(async () => sum(await inputs(), 'pointer', 'dx')).toBeGreaterThan(80);
  expect(sum(await inputs(), 'pointer', 'dy')).toBeGreaterThan(10);
  expect((await inputs()).filter(i => i.type === 'click')).toEqual([]);

  await page.mouse.click(cx, cy);
  await expect.poll(async () => (await inputs()).filter(i => i.type === 'click').map(i => i.button)).toEqual(['left']);

  await page.mouse.move(cx, cy); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();
  await expect.poll(async () => (await inputs()).filter(i => i.type === 'click').map(i => i.button)).toEqual(['left', 'right']);

  const ex = pad.x + pad.width - 20;
  await page.mouse.move(ex, cy - 40); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(ex, cy - 40 + i * 12); await page.waitForTimeout(16); }
  await page.mouse.up();
  await expect.poll(async () => sum(await inputs(), 'scroll', 'dy')).toBeLessThan(-40); // natural scrolling
  // Coalescing: ten move events in ~160 ms must not become ten messages each.
  expect((await inputs()).filter(i => i.type === 'pointer').length).toBeLessThanOrEqual(8);
});

test('D-pad and control keys send only the contract key names', async ({ page }) => {
  await pair(page);
  await page.getByRole('tab', { name: 'Strzałki' }).click();
  await page.getByRole('button', { name: 'W prawo' }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('button', { name: 'Wstecz' }).click();
  await page.getByRole('button', { name: 'Ekran główny' }).click();
  await page.getByRole('button', { name: 'Odtwarzaj lub wstrzymaj' }).click();
  await expect.poll(async () => (await inputs()).map(i => i.key)).toEqual(['right', 'ok', 'back', 'home', 'play_pause']);
  await shot(page, 'remote-dpad');
  await page.getByRole('button', { name: 'Głośniej' }).click();
  await expect.poll(async () => (await tvApi('/tv')).data.volume_level).toBe(0.2);
});

test('one-click launch shows progress on the phone until the app opens', async ({ page }) => {
  await mock('tv', '?state=off');
  await pair(page);
  await page.getByRole('button', { name: 'Otwórz Netflix' }).click();
  await expect(page.locator('.op-stage')).toBeVisible();
  await shot(page, 'remote-launch');
  await expect(page.locator('.op-stage')).toHaveText(/Włączam telewizor|Czekam|Otwieram|Gotowe/);
  await expect.poll(async () => (await mock('state')).currentUrl, { timeout: 8000 }).toBe('https://www.netflix.com/');
  await expect(page.locator('.sheet')).toHaveCount(0, { timeout: 5000 });
  expect((await tvApi('/tv')).data.state).toBe('on');
});

test('keyboard mirrors Polish text by graphemes, including replace and emoji', async ({ page }) => {
  await pair(page);
  await page.getByRole('button', { name: 'Klawiatura' }).click();
  const field = page.locator('.kbd-input');
  await field.pressSequentially('zażółć');
  await expect.poll(async () => (await inputs()).filter(i => i.type === 'text').map(i => i.text).join('')).toBe('zażółć');
  await field.fill('ok'); // select-all replacement in one edit
  await expect.poll(async () => (await inputs()).filter(i => i.key === 'backspace').length).toBe(6);
  await expect.poll(async () => (await inputs()).filter(i => i.type === 'text').map(i => i.text).join('')).toBe('zażółćok');
  await field.fill('ok👍🏽');
  await field.fill('ok');
  await expect.poll(async () => (await inputs()).filter(i => i.key === 'backspace').length).toBe(7);
  await field.press('Enter');
  await expect.poll(async () => (await inputs()).at(-1)).toEqual({ type: 'key', key: 'ok' });
  for (const i of await inputs()) if (i.type === 'text') expect(i.text.length).toBeLessThanOrEqual(2000);
});

test('text commands run through the parser and say clearly what voice mode is available', async ({ page }) => {
  await pair(page);
  await page.locator('.tab', { hasText: 'Polecenia' }).click();
  await expect(page.locator('.mode-badge')).toContainText('Rozpoznawanie mowy na serwerze nie jest włączone');
  await page.getByRole('textbox', { name: 'Polecenie' }).fill('Otwórz YouTube');
  await page.getByRole('button', { name: 'Wyślij polecenie' }).click();
  await expect(page.locator('.history li').first()).toContainText('Wykonano');
  await expect.poll(async () => (await mock('state')).currentUrl, { timeout: 8000 }).toBe('https://www.youtube.com/');
  await page.locator('.sheet .btn').click().catch(() => {});
  await page.getByRole('textbox', { name: 'Polecenie' }).fill('zaśpiewaj coś');
  await page.getByRole('button', { name: 'Wyślij polecenie' }).click();
  await expect(page.locator('.history li').first()).toContainText('Nie rozumiem');
  await shot(page, 'remote-commands');
});

test('Dom tab controls only the allowlisted entities', async ({ page }) => {
  await pair(page);
  await page.locator('.tab', { hasText: 'Dom' }).click();
  await expect(page.locator('#view-home .card')).not.toHaveCount(0);
  await page.getByRole('switch', { name: 'Lampa stojąca: przełącz' }).click();
  await expect.poll(async () => (await tvApi('/home')).data.entities.find(e => e.entity_id === 'light.lampa_stojaca').state).toBe('on');
  await expect(page.getByText('Kuchnia')).toHaveCount(0); // exists in HA but not selected on the TV
  await shot(page, 'remote-dom');
});

test('lost connection shows a banner, reconnects by itself and never replays input', async ({ page }) => {
  await pair(page);
  await page.getByRole('tab', { name: 'Strzałki' }).click();
  await page.getByRole('button', { name: 'W dół' }).click();
  await expect.poll(async () => (await inputs()).length).toBe(1);
  await mock('kick');
  await expect(page.locator('#banner')).toBeVisible();
  await shot(page, 'remote-offline');
  await expect(page.locator('#conn')).toHaveClass(/online/, { timeout: 8000 });
  await expect(page.locator('#banner')).toBeHidden();
  await page.waitForTimeout(500);
  expect((await inputs()).length).toBe(1);
});

test('revoking the phone on the TV sends it back to pairing', async ({ page }) => {
  await pair(page);
  const [device] = (await tvApi('/devices')).data.devices;
  expect((await tvApi(`/devices/${device.id}`, 'DELETE')).status).toBe(200);
  await expect(page.getByRole('heading', { name: 'Połącz z telewizorem' })).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#tabs')).toBeHidden();
});

test('TV power button follows and changes the TV state', async ({ page }) => {
  await mock('tv', '?state=off');
  await pair(page);
  const power = page.locator('#power');
  await expect(power).toHaveAttribute('aria-label', 'Włącz telewizor');
  await power.click();
  await expect(power).toHaveAttribute('aria-label', 'Wyłącz telewizor');
});

test('fits a small iPhone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await pair(page);
  const g = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, pad: document.querySelector('.pad').getBoundingClientRect().height }));
  expect(g.sw).toBeLessThanOrEqual(g.w);
  expect(g.pad).toBeGreaterThan(110);
});

test('PWA manifest, icons and service worker are served from /remote/', async ({ request }) => {
  const manifest = await (await request.get('/remote/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.scope).toBe('/remote/');
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect((await request.get('/remote/icons/apple-touch-icon.png')).status()).toBe(200);
  const sw = await (await request.get('/remote/sw.js')).text();
  expect(sw).not.toContain('/api/');
});
