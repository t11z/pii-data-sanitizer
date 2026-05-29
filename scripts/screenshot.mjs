// Dev utility that regenerates docs/assets/demo.png. Playwright is intentionally NOT a
// project dependency — install it on demand before running:
//   npm i -D playwright && npx playwright install chromium
//   npm run build && (cd dist && python3 -m http.server 8137 &)
//   node scripts/screenshot.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.SHOT_URL ?? 'http://localhost:8137/';
const OUT = 'docs/assets';
mkdirSync(OUT, { recursive: true });

const SAMPLE = `From: Dr. Kai-Uwe von Braun <kai-uwe@example.com>
Phone: +49 30 1234567
IBAN: DE89 3704 0044 0532 0130 00
Card: 4111 1111 1111 1111
Server 192.168.10.42 flagged the request from Omar al Farouk.
Please loop in kai-uwe@example.com about the David ben Gurion case.`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: 'networkidle' });

// Pseudonymize mode shows stable [PERSON_1]/[EMAIL_1] placeholders — nicer for a hero shot.
await page.getByRole('radio', { name: /pseudonymize/i }).check().catch(() => {});

const ta = page.locator('textarea').first();
await ta.click();
await ta.fill(SAMPLE);

// Give the worker time to load packs + run detection (debounced ~100ms + pack load).
await page.waitForTimeout(2500);

await page.screenshot({ path: `${OUT}/demo.png`, fullPage: true });
console.log('wrote', `${OUT}/demo.png`);

await browser.close();
