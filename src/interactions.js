// Blocks top-level document navigations away from the current page so that
// clicking <a href> links (footer nav, social icons) doesn't unload the page
// and destroy the execution context — same technique home-app's e2e uses.
export async function blockExternalNavigation(page, keepPath) {
  await page.route('**', route => {
    const req = route.request();
    const isDocNav = req.resourceType() === 'document';
    const leavesPage = !req.url().includes(keepPath) && !req.url().includes('googletagmanager.com');
    if (isDocNav && leavesPage) {
      route.abort('aborted').catch(() => {});
    } else {
      route.continue().catch(() => {});
    }
  });
}

// Mocks BFF endpoints during interactions (e.g. newsletter submit) to avoid
// real side effects (subscribing a test email, etc.) when triggering events.
export async function mockRoutes(page, mocks = []) {
  for (const m of mocks) {
    await page.route(m.url, route =>
      route.fulfill({
        status: m.status ?? 200,
        contentType: m.contentType ?? 'application/json',
        body: m.body ?? '{}',
      })
    );
  }
}

// Runs a sequence of interactions to trigger click/submit-based analytics
// events. Supported actions: click, fill (types + Enter), press.
export async function runInteractions(page, interactions = []) {
  const log = [];
  for (const step of interactions) {
    const { selector, action, value, timeout = 8000 } = step;
    try {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout });
      await locator.scrollIntoViewIfNeeded();

      if (action === 'click') {
        await locator.click({ timeout });
      } else if (action === 'fill') {
        await locator.click({ timeout });
        await locator.pressSequentially(value ?? '', { delay: 20 });
      } else if (action === 'press') {
        await locator.press(value ?? 'Enter', { timeout });
      }

      await page.waitForTimeout(600);
      log.push({ selector, action, ok: true });
    } catch (err) {
      log.push({ selector, action, ok: false, error: err.message });
    }
  }
  return log;
}
