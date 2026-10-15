// Side-by-side phone screenshots for review: node montage.mjs <dir> <out-name> <shot> [shot...]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [dir, outName, ...names] = process.argv.slice(2);
const imgs = names.map(n => `<img src="data:image/png;base64,${fs.readFileSync(`${dir}/${n}.png`).toString('base64')}">`).join('');
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 390 * names.length / 2 + 40, height: 900 } });
await p.setContent(`<body style="margin:0;background:#333;display:flex;gap:8px;padding:8px">${imgs.replace(/<img/g, '<img style="width:' + (100 / names.length) + '%;height:auto"')}</body>`);
await p.screenshot({ path: `${dir}/${outName}.png`, fullPage: true });
await b.close();
