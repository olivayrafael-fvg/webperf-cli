export async function auditComponent(page, selector) {
  let elementHandle;
  try {
    elementHandle = await page.waitForSelector(selector, { timeout: 10000 });
  } catch {
    return { selector, exists: false, error: `Elemento "${selector}" no encontrado en ${page.url()}` };
  }

  // Scroll to bring it into view before any measurement
  await elementHandle.scrollIntoViewIfNeeded();
  await new Promise(r => setTimeout(r, 500));

  const geometry = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top + window.scrollY),
      isAboveFold: rect.top >= 0 && rect.top < window.innerHeight,
      isBelowFold: rect.top >= window.innerHeight,
    };
  }, selector);

  // Element-level CLS: sum layout-shift entries whose source nodes are inside the element
  const elementCls = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    let value = 0;
    for (const entry of performance.getEntriesByType('layout-shift')) {
      for (const source of entry.sources ?? []) {
        if (source.node && el.contains(source.node)) {
          value += entry.value;
        }
      }
    }
    return parseFloat(value.toFixed(4));
  }, selector);

  // Detect if the element is server-rendered (present in initial HTML) or client-injected
  const isServerRendered = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    // If the element has no data-reactroot / __next attributes but still exists,
    // we check whether it was in the original HTML by looking at innerHTML length
    // This is a heuristic: server-rendered elements have content from the start.
    return el.innerHTML.trim().length > 0;
  }, selector);

  return {
    selector,
    exists: true,
    ...geometry,
    elementCls,
    isServerRendered,
  };
}

export async function screenshotComponent(page, selector, filePath) {
  const locator = page.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  await new Promise(r => setTimeout(r, 400));
  await locator.screenshot({ path: filePath });
}
