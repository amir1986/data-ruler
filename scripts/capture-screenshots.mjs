/**
 * Playwright screenshot capture script for DataRuler documentation.
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs
 *
 * Prerequisites:
 *   - Next.js app running in dev mode (default http://localhost:3456)
 *   - Chromium available
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/home/user/data-ruler/apps/web/node_modules/playwright-core');
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://localhost:3456';
const OUT = resolve(__dirname, '..', 'docs', 'screenshots');
const CHROME = process.env.CHROME_PATH || '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome';
const USER = { email: 'screenshots@demo.com', password: 'demo12345678', displayName: 'Jane Smith' };

mkdirSync(OUT, { recursive: true });

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function shot(page, name) {
  await sleep(1200);
  await page.screenshot({ path: resolve(OUT, name), fullPage: false });
  console.log(`  ✓ ${name}`);
}

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  try {
    // ── 1. Login page (pre-filled, not submitted) ──
    console.log('\n[1/12] Login page...');
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', 'jane@company.com');
    await page.fill('input[type="password"]', 'mysecretpassword');
    await shot(page, '01-login.png');

    // ── 2. Register page (pre-filled, not submitted) ──
    console.log('[2/12] Register page...');
    await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="email"]');
    const inputs = await page.locator('input').all();
    if (inputs.length >= 3) {
      await inputs[0].fill('Jane Smith');
      await inputs[1].fill('jane@company.com');
      await inputs[2].fill('mysecretpass');
    }
    await shot(page, '02-register.png');

    // ── Register via the actual form, then login via form ──
    console.log('\nRegistering test user via form...');
    await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="email"]');
    const regInputs = await page.locator('input').all();
    await regInputs[0].fill(USER.displayName);
    await regInputs[1].fill(USER.email);
    await regInputs[2].fill(USER.password);
    await page.locator('button[type="submit"]').click();
    await sleep(2000);

    // Check if we got redirected to /files (successful register)
    let url = page.url();
    console.log('  After register, URL:', url);

    if (url.includes('/login') || url.includes('/register')) {
      // Maybe user already exists, login instead
      console.log('  Logging in via form...');
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await page.waitForSelector('input[type="email"]');
      await page.fill('input[type="email"]', USER.email);
      await page.fill('input[type="password"]', USER.password);
      await page.locator('button[type="submit"]').click();
      await sleep(3000);
      url = page.url();
      console.log('  After login, URL:', url);
    }

    // Verify we're authenticated
    if (!url.includes('/files') && !url.includes('/dashboards')) {
      console.log('  WARNING: Not authenticated. Current URL:', url);
      // Try one more time with wait
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await page.fill('input[type="email"]', USER.email);
      await page.fill('input[type="password"]', USER.password);
      await page.locator('button[type="submit"]').click();
      await sleep(5000);
      url = page.url();
      console.log('  Retry URL:', url);
    }

    console.log('  Authenticated! Seeding data...');

    // ── Seed files ──
    const csvContent = [
      'order_id,product_name,quantity,unit_price,region,order_date,revenue',
      '1,Widget Pro,25,45.99,North,2026-01-15,1149.75',
      '2,DataPack,18,38.50,East,2026-01-22,693.00',
      '3,CloudSync,32,29.99,West,2026-02-03,959.68',
      '4,Widget Pro,41,45.99,South,2026-02-14,1885.59',
      '5,DataPack,22,38.50,North,2026-02-28,847.00',
      '6,CloudSync,55,29.99,East,2026-03-05,1649.45',
      '7,Widget Pro,38,45.99,West,2026-03-12,1747.62',
      '8,DataPack,27,38.50,South,2026-03-18,1039.50',
    ].join('\n');
    const jsonContent = JSON.stringify({ users: [
      { id: 1, name: 'Alice', role: 'admin', active: true },
      { id: 2, name: 'Bob', role: 'editor', active: true },
      { id: 3, name: 'Charlie', role: 'viewer', active: false },
    ] }, null, 2);

    await page.evaluate(async ({ base, csv, json }) => {
      const fd = new FormData();
      fd.append('files', new File([csv], 'sales_data.csv', { type: 'text/csv' }));
      fd.append('files', new File([json], 'users_config.json', { type: 'application/json' }));
      fd.append('files', new File(['%PDF-1.4 Quarterly Report Sample Content'], 'quarterly_report.pdf', { type: 'application/pdf' }));
      fd.append('files', new File(['<html><body><h1>Analysis</h1></body></html>'], 'analysis_notes.html', { type: 'text/html' }));
      const r = await fetch(`${base}/api/files/upload`, { method: 'POST', body: fd, credentials: 'include' });
      console.log('Upload status:', r.status);
    }, { base: BASE, csv: csvContent, json: jsonContent });
    console.log('  Files uploaded');

    // ── 3. Files list view ──
    console.log('\n[3/12] Files list view...');
    await page.goto(`${BASE}/files`, { waitUntil: 'networkidle' });
    await sleep(2000);
    await shot(page, '03-files-list.png');

    // ── 4. Files grid view ──
    console.log('[4/12] Files grid view...');
    // The view toggle buttons - find and click grid button
    const viewBtns = page.locator('button svg');
    const viewBtnCount = await viewBtns.count();
    for (let i = 0; i < viewBtnCount; i++) {
      const parent = viewBtns.nth(i).locator('..');
      const html = await viewBtns.nth(i).evaluate(el => el.outerHTML).catch(() => '');
      if (html.includes('layout-grid') || html.includes('LayoutGrid') || html.includes('grid')) {
        await parent.click();
        await sleep(800);
        break;
      }
    }
    await shot(page, '04-files-grid.png');

    // ── 5. File detail modal ──
    console.log('[5/12] File detail modal...');
    await page.goto(`${BASE}/files`, { waitUntil: 'networkidle' });
    await sleep(1500);
    // Find the action buttons (⋮ / MoreVertical) in the table
    const moreMenuBtns = page.locator('table tbody tr td:last-child button, [class*="MoreVertical"], button:has(svg[class*="more"])');
    let detailCaptured = false;
    const cnt = await moreMenuBtns.count();
    if (cnt > 0) {
      await moreMenuBtns.first().click();
      await sleep(400);
      const detailLink = page.locator('[role="menuitem"]').filter({ hasText: /detail/i }).first();
      if (await detailLink.isVisible({ timeout: 500 }).catch(() => false)) {
        await detailLink.click();
        await sleep(1200);
        detailCaptured = true;
        await shot(page, '05-file-detail.png');
        await page.keyboard.press('Escape');
      } else {
        await page.keyboard.press('Escape');
      }
    }
    if (!detailCaptured) {
      await shot(page, '05-file-detail.png');
    }

    // ── 6. Dashboard list ──
    console.log('[6/12] Dashboards...');
    // Seed dashboards via API from browser context (cookies already set)
    await page.evaluate(async (base) => {
      for (const db of [
        { title: 'Sales Overview', description: 'Revenue trends and regional breakdown with monthly KPIs' },
        { title: 'Q1 Performance', description: 'AI-generated quarterly analysis with automated insights' },
        { title: 'User Analytics', description: 'Active users, engagement metrics, and retention funnel' },
      ]) {
        await fetch(`${base}/api/dashboards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(db),
          credentials: 'include',
        });
      }
    }, BASE);

    await page.goto(`${BASE}/dashboards`, { waitUntil: 'networkidle' });
    await sleep(1500);
    await shot(page, '06-dashboards.png');

    // ── 7. Dashboard builder ──
    console.log('[7/12] Dashboard builder...');
    const dashList = await page.evaluate(async (base) => {
      const r = await fetch(`${base}/api/dashboards`, { credentials: 'include' });
      return r.json();
    }, BASE);
    if (dashList && dashList.length > 0) {
      const dashId = dashList[0].id;
      // Add widgets
      await page.evaluate(async ({ base, id }) => {
        await fetch(`${base}/api/dashboards/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            widgets: [
              { id: 'w1', type: 'chart', title: 'Revenue by Month', config: { chartType: 'bar', data: { labels: ['Jan','Feb','Mar','Apr','May'], values: [89200,102400,118900,95600,127300] } } },
              { id: 'w2', type: 'kpi', title: 'Total Revenue', config: { value: '$1,247,500', label: 'Total Revenue', change: 12.5 } },
              { id: 'w3', type: 'chart', title: 'Sales by Region', config: { chartType: 'pie', data: { labels: ['North','East','West','South'], values: [35,28,22,15] } } },
              { id: 'w4', type: 'table', title: 'Top Products', config: { columns: ['Product','Revenue','Units'], rows: [['Widget Pro','$45,200','892'],['DataPack','$38,100','654'],['CloudSync','$29,800','431']] } },
            ],
            layout: [
              { i: 'w1', x: 0, y: 0, w: 6, h: 4 },
              { i: 'w2', x: 6, y: 0, w: 6, h: 4 },
              { i: 'w3', x: 0, y: 4, w: 6, h: 4 },
              { i: 'w4', x: 6, y: 4, w: 6, h: 4 },
            ],
          }),
        });
      }, { base: BASE, id: dashId });

      await page.goto(`${BASE}/dashboards/${dashId}`, { waitUntil: 'networkidle' });
      await sleep(2500);
    }
    await shot(page, '07-dashboard-builder.png');

    // ── 8. Notes ──
    console.log('[8/12] Notes...');
    await page.evaluate(async (base) => {
      for (const n of [
        { title: 'Q1 Review Meeting', content: '# Q1 Review Meeting\n\n## Key Takeaways\n\n- Revenue up 12.5% QoQ\n- New user signups exceeded target\n- Churn rate decreased to 2.1%\n\n## Action Items\n\n- [ ] Update forecast model\n- [ ] Schedule follow-up with sales\n- [x] Share dashboard with team' },
        { title: 'Data Analysis Notes', content: '# Data Analysis\n\nPreliminary findings from Q1 sales data show positive trends across all regions.' },
        { title: 'Project Ideas', content: '# Project Ideas\n\n1. Automated report generation\n2. Real-time dashboards\n3. Predictive analytics' },
        { title: 'Weekly Log', content: '# Week 12\n\nCompleted migration to new data pipeline.' },
      ]) {
        await fetch(`${base}/api/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(n),
          credentials: 'include',
        });
      }
    }, BASE);

    await page.goto(`${BASE}/notes`, { waitUntil: 'networkidle' });
    await sleep(1500);
    // Click first note to show in editor
    const noteItems = page.locator('[class*="cursor-pointer"]');
    const noteCount = await noteItems.count();
    for (let i = 0; i < noteCount; i++) {
      const t = await noteItems.nth(i).textContent().catch(() => '');
      if (t.includes('Q1 Review') || t.includes('Meeting')) {
        await noteItems.nth(i).click();
        await sleep(600);
        break;
      }
    }
    await shot(page, '08-notes.png');

    // ── 9. Reports ──
    console.log('[9/12] Reports...');
    await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' });
    await sleep(1500);
    await shot(page, '09-reports.png');

    // ── 10. Settings ──
    console.log('[10/12] Settings...');
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
    await sleep(1500);
    await shot(page, '10-settings.png');

    // ── 11. Chat sidebar ──
    console.log('[11/12] Chat sidebar...');
    await page.goto(`${BASE}/files`, { waitUntil: 'networkidle' });
    await sleep(1500);
    // Find the floating chat button - look for MessageCircle or bot icon, usually bottom-right
    const allBtns = await page.locator('button').all();
    for (const btn of allBtns.reverse()) {
      const box = await btn.boundingBox().catch(() => null);
      if (box && box.x > 1200 && box.y > 700) {
        await btn.click();
        await sleep(1000);
        break;
      }
    }
    await shot(page, '11-chat-sidebar.png');

    // ── 12. Command palette ──
    console.log('[12/12] Command palette...');
    await page.goto(`${BASE}/files`, { waitUntil: 'networkidle' });
    await sleep(1500);
    await page.keyboard.press('Control+k');
    await sleep(800);
    await shot(page, '12-command-palette.png');

    console.log(`\nAll screenshots saved to ${OUT}`);
  } catch (err) {
    console.error('Error:', err);
    // Take a debug screenshot
    await page.screenshot({ path: resolve(OUT, 'debug-error.png') });
  } finally {
    await browser.close();
  }
})();
