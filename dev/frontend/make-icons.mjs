// Renders the remote's PWA icons from one SVG: node make-icons.mjs
// Output: haoskiosk/remote/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../haoskiosk/remote/icons');
fs.mkdirSync(out, { recursive: true });

// Full-bleed artwork; the ring stays inside the 80% maskable safe zone.
const svg = (scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="lamp" cx="50%" cy="112%" r="80%"><stop offset="0" stop-color="#f0b35b" stop-opacity=".55"/><stop offset=".55" stop-color="#5a3a3e" stop-opacity=".35"/><stop offset="1" stop-color="#0f1626" stop-opacity="0"/></radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121b30"/><stop offset="1" stop-color="#1a1d33"/></linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect width="512" height="512" fill="url(#lamp)"/>
  <g transform="translate(256 248) scale(${scale})">
    <circle r="132" fill="none" stroke="#eef0f5" stroke-width="22" opacity=".92"/>
    <path d="M0-98 14-80H-14Z M0 98 14 80H-14Z M-98 0-80 14V-14Z M98 0 80 14V-14Z" fill="#eef0f5" opacity=".75"/>
    <circle r="46" fill="#f0b35b"/>
  </g>
</svg>`;
fs.writeFileSync(path.join(out, 'icon.svg'), svg());

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const page = await browser.newPage();
const render = async (name, size, scale) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#0f1626"><img src="data:image/svg+xml;base64,${Buffer.from(svg(scale)).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`);
  await page.screenshot({ path: path.join(out, name), omitBackground: false });
  console.log('wrote', name);
};
await render('icon-192.png', 192, 1);
await render('icon-512.png', 512, 1);
await render('maskable-512.png', 512, 0.8);
await render('apple-touch-icon.png', 180, 1);
await browser.close();
