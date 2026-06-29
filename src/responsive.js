import path from 'path';
import { mkdirSync } from 'fs';

const DEFAULT_BREAKPOINTS = {
  desktop: 1280,
  tablet: 768,
  mobile: 375,
};

async function navigateTo(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      await page.evaluate(() => null);
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.evaluate(() => null);
      break;
    } catch {
      await new Promise(r => setTimeout(r, 400));
    }
  }
  await new Promise(r => setTimeout(r, 500));
}

// selector: if provided, crops the screenshot to that element instead of the full viewport
export async function runResponsive(browser, url, breakpoints, outDir, pagePath, selector) {
  const bps = { ...DEFAULT_BREAKPOINTS, ...breakpoints };
  const screenshotsDir = path.join(outDir, 'screenshots');
  mkdirSync(screenshotsDir, { recursive: true });

  const prefix = selector
    ? `component_${selector.replace(/[^a-z0-9]/gi, '_').replace(/^_+/, '')}`
    : (pagePath.replace(/^\//, '').replace(/\//g, '_') || 'home');

  const results = {};

  for (const [name, width] of Object.entries(bps)) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();

    await navigateTo(page, url);

    const filename = `${prefix}_${name}.png`;
    const filePath = path.join(screenshotsDir, filename);

    if (selector) {
      const locator = page.locator(selector);
      await locator.waitFor({ timeout: 10000 }).catch(() => {});
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await new Promise(r => setTimeout(r, 400));
      await locator.screenshot({ path: filePath }).catch(() =>
        page.screenshot({ path: filePath, fullPage: false })
      );
    } else {
      await page.screenshot({ path: filePath, fullPage: false });
    }

    await context.close();
    results[name] = { width, screenshot: path.join('screenshots', filename) };
  }

  return results;
}
