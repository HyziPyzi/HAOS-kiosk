// TV launcher at 1920×1080 driven only by the keys a TV remote sends.
import { test, expect } from '@playwright/test';
import { mock, tvApi, shot, watchErrors, focusedKey, PORT } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await mock('reset');
  page.errors = watchErrors(page);
  await page.goto('/launcher/');
  await expect.poll(() => focusedKey(page)).toBe('fav:netflix');
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

async function press(page, ...keys) { for (const key of keys) await page.keyboard.press(key); }

test('home shows clock, date, weather, favourites and fits 1080p without scrolling sideways', async ({ page }) => {
  await expect(page.locator('#clock')).toHaveText(/^\d{2}:\d{2}$/);
  await expect(page.locator('#date')).toHaveText(/\d{1,2} [a-ząćęłńóśźż]+$/);
  await expect(page.locator('.weather-chip')).toContainText('12°');
  await expect(page.locator('#ambient')).toContainText('Temperatura w salonie: 21,4°');
  await expect(page.locator('[data-row="fav"] .tile')).toHaveCount(5);
  await expect(page.locator('[data-row="dom"] .card.movie')).toBeVisible();
  const geometry = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  expect(geometry.w).toBeLessThanOrEqual(1920);
  expect(geometry.h).toBeLessThanOrEqual(1080);
  await shot(page, 'tv-launcher-home-1080');
});

test('arrow keys move focus spatially and rows remember their last item', async ({ page }) => {
  await press(page, 'ArrowLeft');
  expect(await focusedKey(page)).toBe('fav:netflix');
  await press(page, 'ArrowRight', 'ArrowRight');
  expect(await focusedKey(page)).toBe('fav:max');
  await press(page, 'ArrowDown');
  expect(await focusedKey(page)).toMatch(/^recent:/);
  await press(page, 'ArrowUp');
  expect(await focusedKey(page)).toBe('fav:max');
  await press(page, 'ArrowUp');
  expect(await focusedKey(page)).toMatch(/^top:/);
  for (let i = 0; i < 4; i++) await press(page, 'ArrowDown');
  expect(await focusedKey(page)).toMatch(/^home:/);
  await shot(page, 'tv-launcher-dom-row');
});

test('OK on a tile runs one-click launch: TV power-on, progress, recent list', async ({ page }) => {
  await mock('tv', '?state=off');
  await press(page, 'ArrowRight'); // YouTube
  await press(page, 'Enter');
  await expect(page.locator('.launching .stage')).toBeVisible();
  await expect(page.locator('.launching .stage')).toHaveText(/Włączam telewizor|Czekam|Otwieram/);
  await shot(page, 'tv-launcher-launching');
  await expect.poll(async () => (await mock('state')).currentUrl, { timeout: 8000 }).toBe('https://www.youtube.com/');
  const state = (await tvApi('/state')).data;
  expect(state.recent[0]).toBe('youtube');
  expect(state.tv.state).toBe('on');
});

test('browser tile asks for an address and rejects non-HTTP schemes', async ({ page }) => {
  await page.locator('[data-key="app:browser"]').click();
  await expect(page.getByRole('heading', { name: 'Dokąd chcesz przejść?' })).toBeVisible();
  await page.locator('#url-input').fill('javascript:alert(1)');
  await press(page, 'Enter');
  await expect(page.locator('.sheet .error')).toHaveText('Dozwolone są adresy HTTP i HTTPS.');
  await page.locator('#url-input').fill('vod.tvp.pl');
  await press(page, 'Enter');
  await expect.poll(async () => (await mock('state')).currentUrl, { timeout: 8000 }).toBe('https://vod.tvp.pl/');
});

test('pairing shows a PIN with countdown and closes when a phone pairs', async ({ page }) => {
  await press(page, 'ArrowUp');
  expect(await focusedKey(page)).toBe('top:profile');
  await press(page, 'ArrowRight', 'ArrowRight', 'ArrowRight');
  expect(await focusedKey(page)).toBe('top:pair');
  await press(page, 'Enter');
  await expect(page.locator('.pin span')).toHaveCount(6);
  const { pin } = await mock('pin');
  await expect(page.locator('.pin')).toHaveText(pin);
  await expect(page.locator('.countdown output')).toHaveText(/^[12]:\d{2}$/);
  await shot(page, 'tv-launcher-pairing');
  // The phone listener: same server, non-loopback Host.
  const response = await fetch(`http://localhost:${PORT}/api/v3/pairing/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, device_name: 'iPhone testowy' }) });
  expect(response.status).toBe(200);
  await expect(page.getByText('Sparowano: iPhone testowy')).toBeVisible();
  await expect(page.locator('.layer')).toHaveCount(0, { timeout: 5000 });
});

test('cancelled pairing invalidates the PIN on the server', async ({ page }) => {
  await page.locator('[data-key="top:pair"]').click();
  await expect(page.locator('.pin span')).toHaveCount(6);
  await press(page, 'Escape');
  await expect(page.locator('.layer')).toHaveCount(0);
  await expect.poll(async () => (await mock('pin')).pin).toBeNull();
});

test('overscan safe area shrinks the UI live and persists', async ({ page }) => {
  await page.locator('[data-key="top:settings"]').click();
  await expect(page.locator('#screen-settings')).toBeVisible();
  await press(page, 'ArrowDown');
  expect(await focusedKey(page)).toBe('set:screen');
  await expect(page.locator('.overscan-preview')).toBeVisible();
  await press(page, 'ArrowRight');
  expect(await focusedKey(page)).toBe('screen:safe:minus');
  await press(page, 'ArrowRight', 'Enter', 'Enter', 'Enter', 'Enter');
  await expect(page.locator('.stepper output')).toHaveText('2%');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--safe').trim())).toBe('2');
  await shot(page, 'tv-launcher-overscan');
  await expect.poll(async () => (await tvApi('/settings')).data.settings.safe_area, { timeout: 3000 }).toBe(2);
  await press(page, 'Escape');
  await expect(page.locator('.overscan-preview')).toHaveCount(0);
});

test('switching profile applies its accent and favourites', async ({ page }) => {
  await press(page, 'ArrowUp', 'Enter');
  await expect(page.getByRole('heading', { name: 'Kto ogląda?' })).toBeVisible();
  await press(page, 'ArrowRight');
  expect(await focusedKey(page)).toBe('pp:ania');
  await press(page, 'Enter');
  await expect(page.locator('#profile-chip .name')).toHaveText('Ania');
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe('#e98aa8');
  await expect(page.locator('[data-row="fav"] .tile')).toHaveCount(2);
  expect((await tvApi('/profiles')).data.active_profile_id).toBe('ania');
});

test('tiles can be reordered with the remote and the order is saved per profile', async ({ page }) => {
  await page.locator('[data-key="app:__all"]').click();
  await expect(page.locator('#screen-apps')).toBeVisible();
  await expect.poll(() => focusedKey(page)).toBe('apps:netflix');
  await press(page, 'Enter');
  await expect(page.locator('.sheet.menu')).toBeVisible();
  await press(page, 'ArrowDown', 'ArrowDown', 'Enter'); // "Przesuń"
  await expect(page.locator('.tile.is-grabbed')).toHaveCount(1);
  await press(page, 'ArrowRight', 'ArrowRight', 'Enter');
  await expect.poll(async () => (await tvApi('/profiles')).data.profiles.find(p => p.id === 'default').app_order.slice(0, 3)).toEqual(['youtube', 'max', 'netflix']);
  await press(page, 'Escape');
  await expect(page.locator('[data-row="fav"] .tile').nth(2)).toHaveAttribute('data-key', 'fav:netflix');
});

test('Back closes layers and screens; Home returns from anywhere', async ({ page }) => {
  await page.locator('[data-key="top:settings"]').click();
  await expect(page.locator('#screen-settings')).toBeVisible();
  await press(page, 'Escape');
  await expect(page.locator('#screen-home')).toBeVisible();
  await page.locator('[data-key="top:dom"]').click();
  await expect(page.locator('#screen-dom')).toBeVisible();
  await page.locator('#screen-dom .card.movie').focus();
  await press(page, 'Home');
  await expect(page.locator('#screen-home')).toBeVisible();
  expect(await focusedKey(page)).toBe('fav:netflix');
});

test('smart home cards toggle allowlisted lights and show HA outages plainly', async ({ page }) => {
  await page.locator('[data-key="top:dom"]').click();
  const lamp = page.locator('[data-key="dom:switch.ambilight"]');
  await expect(lamp).toContainText('Wyłączone');
  await lamp.focus();
  await press(page, 'Enter');
  await expect(lamp).toContainText('Włączone');
  await shot(page, 'tv-launcher-dom');
  await mock('ha', '?offline=1');
  await expect(page.getByText('Home Assistant nie odpowiada.', { exact: false }).first()).toBeVisible();
  await press(page, 'Escape');
  await expect(page.locator('#ambient')).toContainText('Home Assistant nie odpowiada');
});

test('when the v3 API is unreachable apps still open by plain navigation', async ({ page }) => {
  await page.route('**/api/v3/**', route => route.abort());
  await page.route('https://www.netflix.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>netflix-fixture</title>' }));
  await page.goto('/launcher/');
  await expect(page.locator('[data-row="fav"] .tile').first()).toBeFocused();
  await press(page, 'Enter');
  await expect(page).toHaveTitle('netflix-fixture');
});
