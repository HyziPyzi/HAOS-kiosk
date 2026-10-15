// Quick visual check: node shot.mjs <out-dir> [base=http://127.0.0.1:8099]
// Captures launcher screens at 1920×1080 against the running mock.
import { chromium } from '@playwright/test';

const out = process.argv[2] || 'shots';
const base = process.argv[3] || 'http://127.0.0.1:8099';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
page.on('pageerror', e => console.log('pageerror:', e.message));
await fetch(`${base}/__mock/reset`);
await page.goto(`${base}/launcher/`);
await page.waitForTimeout(800);
const snap = async name => { await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${name}.png` }); console.log('saved', name); };
const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(120); } };
await snap('01-home');
await key('ArrowRight', 2); await snap('02-home-focus');
await key('ArrowDown', 2); await snap('03-home-apps-row');
await key('ArrowDown'); await snap('04-home-dom-row');
await key('Escape');
await key('ArrowUp'); await key('ArrowRight', 6); await key('Enter'); await snap('05-pairing');
await key('Escape');
await page.goto(`${base}/launcher/`); await page.waitForTimeout(600);
await key('ArrowUp'); await key('ArrowRight', 9); await key('Enter'); await snap('06-settings');
await key('ArrowDown'); await snap('07-settings-screen');
await key('ArrowRight'); await key('Enter', 4); await snap('08-overscan');
await key('Escape'); await page.goto(`${base}/launcher/`); await page.waitForTimeout(600);
await key('ArrowUp'); await key('Enter'); await snap('09-profiles');
await key('Escape'); await key('ArrowRight', 5); await key('Enter'); await snap('10-dom');
await key('Escape'); await page.goto(`${base}/launcher/`); await page.waitForTimeout(600);
await key('Enter'); await page.waitForTimeout(300); await snap('11-launching');
await browser.close();
