import path from 'path';
import { mkdirSync } from 'fs';

export async function runFallback(browser, config, outDir) {
  const endpoints = config.bff?.endpoints || [];
  const testUrl = `${config.baseUrl}${config.pages[0]}`;
  const screenshotsDir = path.join(outDir, 'screenshots');
  mkdirSync(screenshotsDir, { recursive: true });

  const results = [];

  for (const endpoint of endpoints) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    await page.route(`**${endpoint}**`, route => route.abort('failed'));

    await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 30000 });

    const slug = endpoint.replace(/\//g, '_').replace(/^_/, '');
    const screenshotFile = `fallback_${slug}.png`;
    await page.screenshot({ path: path.join(screenshotsDir, screenshotFile) });

    const hasContent = await page.evaluate(
      () => (document.body.innerText || '').trim().length > 100
    );

    results.push({
      endpoint,
      rendered: hasContent,
      screenshot: path.join('screenshots', screenshotFile),
      ok: hasContent,
    });

    await context.close();
  }

  return results;
}
