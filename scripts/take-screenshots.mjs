import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3099';

const VIEWPORT = { width: 1440, height: 900 };

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  // --- 1. Login page ---
  console.log('📸 01-login');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-login.png'), fullPage: false });

  // --- 2. Register page ---
  console.log('📸 02-register');
  await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-register.png'), fullPage: false });

  // --- Register a test user and log in ---
  console.log('🔑 Creating test user...');
  const email = `test_${Date.now()}@example.com`;
  const password = 'TestPassword123!';

  await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[placeholder*="email" i], input[name="email"]', email);

  const passwordInputs = await page.locator('input[type="password"]').all();
  if (passwordInputs.length >= 2) {
    await passwordInputs[0].fill(password);
    await passwordInputs[1].fill(password);
  } else if (passwordInputs.length === 1) {
    await passwordInputs[0].fill(password);
  }

  const nameInput = await page.locator('input[placeholder*="name" i], input[name="displayName"], input[name="display_name"]').first();
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill('Test User');
  }

  await page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Sign Up"), button:has-text("Create")').first().click();
  await page.waitForURL('**/files**', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  if (!page.url().includes('/files')) {
    console.log('🔑 Logging in...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"], input[placeholder*="email" i]', email);
    const loginPwInput = await page.locator('input[type="password"]').first();
    await loginPwInput.fill(password);
    await page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign In")').first().click();
    await page.waitForURL('**/files**', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  // --- Seed test files for reports ---
  console.log('📦 Seeding test files for reports...');
  const testFiles = [
    { original_name: 'sales_data_2024.csv', file_type: 'csv', file_category: 'tabular', size_bytes: 2457600, row_count: 15420, column_count: 12, processing_status: 'ready', quality_score: 92, ai_summary: 'Comprehensive sales dataset with quarterly revenue breakdowns, product categories, and regional performance metrics. Strong data quality with minimal null values.' },
    { original_name: 'customer_analytics.xlsx', file_type: 'xlsx', file_category: 'tabular', size_bytes: 1843200, row_count: 8750, column_count: 18, processing_status: 'ready', quality_score: 87, ai_summary: 'Customer segmentation data including demographics, purchase history, and engagement scores. Some missing values in optional fields.' },
    { original_name: 'inventory_report.csv', file_type: 'csv', file_category: 'tabular', size_bytes: 983040, row_count: 4200, column_count: 9, processing_status: 'ready', quality_score: 78, ai_summary: 'Inventory tracking data with SKU-level details, stock levels, and reorder points. Quality affected by inconsistent date formats.' },
    { original_name: 'marketing_campaigns.json', file_type: 'json', file_category: 'structured', size_bytes: 524288, row_count: 340, column_count: 15, processing_status: 'ready', quality_score: 95, ai_summary: 'Marketing campaign performance data with click-through rates, conversion funnels, and A/B test results. Excellent data quality.' },
    { original_name: 'product_catalog.parquet', file_type: 'parquet', file_category: 'tabular', size_bytes: 3145728, row_count: 22100, column_count: 24, processing_status: 'ready', quality_score: 83, ai_summary: 'Product catalog with pricing, descriptions, categories, and supplier information. Some duplicate entries detected.' },
    { original_name: 'financial_summary.pdf', file_type: 'pdf', file_category: 'document', size_bytes: 1572864, row_count: null, column_count: null, processing_status: 'ready', quality_score: 71, ai_summary: 'Financial summary document with balance sheets and income statements. Text extraction quality is good but some tables lost formatting.' },
  ];

  for (const file of testFiles) {
    await page.evaluate(async (fileData) => {
      try {
        await fetch('/api/files/seed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fileData),
        });
      } catch (e) { /* ignore */ }
    }, file);
  }

  // --- 3. Files ---
  console.log('📸 03-files-list');
  await page.goto(`${BASE_URL}/files`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-files-list.png'), fullPage: false });

  // --- 4. Dashboards ---
  console.log('📸 04-dashboards');
  await page.goto(`${BASE_URL}/dashboards`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-dashboards.png'), fullPage: false });

  // --- 5. Notes ---
  console.log('📸 05-notes');
  await page.goto(`${BASE_URL}/notes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-notes.png'), fullPage: false });

  // --- Create all 5 report types ---
  const templates = [
    { id: 'executive_summary', title: 'Executive Summary - Q4 2024 Analysis', screenshot: '08-report-executive-summary.png' },
    { id: 'data_deep_dive', title: 'Data Deep-Dive - Full Dataset Analysis', screenshot: '09-report-data-deep-dive.png' },
    { id: 'monthly_report', title: 'Monthly Report - March 2026', screenshot: '10-report-monthly.png' },
    { id: 'comparison_report', title: 'Comparison Report - Sales vs Marketing', screenshot: '11-report-comparison.png' },
    { id: 'quick_brief', title: 'Quick Brief - Sales Data Overview', screenshot: '12-report-quick-brief.png' },
  ];

  const reportIds = [];
  for (const tmpl of templates) {
    console.log(`📝 Creating & generating: ${tmpl.title}`);
    const report = await page.evaluate(async (data) => {
      // Create
      const createRes = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: data.id, title: data.title, file_ids: [] }),
      });
      if (!createRes.ok) return null;
      const created = await createRes.json();

      // Generate
      const genRes = await fetch(`/api/reports/${created.report.id}/generate`, { method: 'POST' });
      if (!genRes.ok) return null;
      const generated = await genRes.json();
      return generated.report;
    }, tmpl);

    if (report) {
      reportIds.push({ ...tmpl, reportId: report.id });
      console.log(`   ✅ Generated: ${report.id}`);
    } else {
      console.log(`   ❌ Failed: ${tmpl.title}`);
    }
  }

  // --- 6. Reports page with all reports ---
  console.log('📸 06-reports');
  await page.goto(`${BASE_URL}/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-reports.png'), fullPage: false });

  // --- Take screenshots of each report view ---
  for (const tmpl of reportIds) {
    console.log(`📸 ${tmpl.screenshot}`);

    // Navigate to reports page fresh
    await page.goto(`${BASE_URL}/reports`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Use page.evaluate to fetch the report and set it as active via the Zustand store
    await page.evaluate(async (reportId) => {
      const res = await fetch(`/api/reports/${reportId}`);
      if (!res.ok) return;
      const data = await res.json();

      // Access the Zustand store's setState directly
      // The store is imported as useReportsStore. React fiber internals hold the store.
      // Instead, we'll dispatch a custom approach: find and click the matching button.
      // Actually, let's just use window.__REPORTS_STORE if we expose it.
      // Simpler: trigger the click on the right card.
    }, tmpl.reportId);

    // Find and click the correct report card
    // The cards contain h3 elements with the report title
    // Try clicking the overlay button within the card that matches
    const cards = page.locator('[class*="group"][class*="relative"][class*="rounded-xl"][class*="border"]').filter({ has: page.locator('h3') });
    const count = await cards.count();
    let clicked = false;

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const h3Text = await card.locator('h3').first().textContent().catch(() => '');
      if (h3Text && h3Text.trim() === tmpl.title) {
        // Click the overlay button
        const overlay = card.locator('button').last();
        await overlay.click({ force: true });
        clicked = true;
        break;
      }
    }

    if (clicked) {
      // Wait for dialog
      await page.waitForSelector('[role="dialog"]', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, tmpl.screenshot), fullPage: false });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      console.log(`   ⚠️ Could not click report card, count=${count}`);
      // Debug: list all h3 texts
      for (let i = 0; i < count; i++) {
        const t = await cards.nth(i).locator('h3').first().textContent().catch(() => 'N/A');
        console.log(`      card[${i}]: "${t}"`);
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, tmpl.screenshot), fullPage: false });
    }
  }

  // --- 7. Settings ---
  console.log('📸 07-settings');
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-settings.png'), fullPage: false });

  console.log('✅ All screenshots captured!');
  await browser.close();
}

main().catch((err) => {
  console.error('Screenshot script failed:', err);
  process.exit(1);
});
