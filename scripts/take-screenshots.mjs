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

  // Register
  await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[placeholder*="email" i], input[name="email"]', email);

  // Find password fields
  const passwordInputs = await page.locator('input[type="password"]').all();
  if (passwordInputs.length >= 2) {
    await passwordInputs[0].fill(password);
    await passwordInputs[1].fill(password);
  } else if (passwordInputs.length === 1) {
    await passwordInputs[0].fill(password);
  }

  // Try to find display name field
  const nameInput = await page.locator('input[placeholder*="name" i], input[name="displayName"], input[name="display_name"]').first();
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill('Test User');
  }

  // Submit
  await page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Sign Up"), button:has-text("Create")').first().click();
  await page.waitForURL('**/files**', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // If we're not on files page, try login
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

  // --- 3. Files - List View ---
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

  // --- 6. Reports ---
  console.log('📸 06-reports');
  await page.goto(`${BASE_URL}/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-reports.png'), fullPage: false });

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
