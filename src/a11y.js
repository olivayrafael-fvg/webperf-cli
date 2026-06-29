import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// selector: optional CSS selector to scope the audit to a specific element
export async function runA11y(page, selector) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });

  const results = await page.evaluate(async (sel) => {
    const root = sel ? document.querySelector(sel) : document.body;
    if (!root) return { violations: [], passes: 0, incomplete: 0, scopeError: `Selector "${sel}" no encontrado` };

    const r = await axe.run(root, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] },
    });
    return {
      violations: r.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
        helpUrl: v.helpUrl,
      })),
      passes: r.passes.length,
      incomplete: r.incomplete.length,
      scope: sel ?? 'document.body',
    };
  }, selector ?? null);

  const keyboard = await checkKeyboardNav(page, selector);

  return { ...results, keyboard };
}

async function checkKeyboardNav(page, selector) {
  const focusable = await page.evaluate((sel) => {
    const root = sel ? document.querySelector(sel) : document;
    return (root ?? document).querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ).length;
  }, selector ?? null);

  const tabCount = Math.min(focusable, 10);
  for (let i = 0; i < tabCount; i++) {
    await page.keyboard.press('Tab');
  }

  const lastFocused = await page.evaluate(() => document.activeElement?.tagName || null);

  return { focusableElements: focusable, tabbed: tabCount, lastFocused };
}
