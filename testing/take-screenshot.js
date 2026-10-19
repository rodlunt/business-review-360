import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 2000 },
    storageState: undefined
  });
  const page = await context.newPage();

  // Login first
  console.log('Navigating to login...');
  await page.goto('https://br360.example.com/org/demo-corp/login');
  await page.waitForSelector('input[name="username"]');

  console.log('Filling credentials...');
  await page.fill('input[name="username"]', 'dcadmin');
  await page.fill('input[name="password"]', 'Password123!');

  console.log('Clicking login...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('button[type="submit"]')
  ]);

  console.log('After login, current URL:', page.url());

  // Click Submit Idea link
  console.log('Clicking Submit Idea...');
  await page.click('text=Submit Idea');
  await page.waitForLoadState('networkidle');
  console.log('On submit page, current URL:', page.url());

  // Wait for form to load
  await page.waitForSelector('input[name="title"]');

  // Take full page screenshot (entire scrollable area)
  await page.screenshot({ path: 'submit-page-full.png', fullPage: true });
  console.log('Screenshot 1: Full page saved to submit-page-full.png');

  // Scroll down to see sliders and take another screenshot
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'submit-page-sliders.png' });
  console.log('Screenshot 2: Sliders area saved to submit-page-sliders.png');

  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'submit-page-bottom.png' });
  console.log('Screenshot 3: Bottom saved to submit-page-bottom.png');

  await browser.close();
})();
