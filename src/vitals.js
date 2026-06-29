import path from 'path';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// web-vitals v4 doesn't export the IIFE via its exports field.
// Resolve via the UMD CJS build (which IS exported) then find the IIFE sibling.
const webVitalsIifePath = path.join(
  path.dirname(require.resolve('web-vitals')),
  'web-vitals.iife.js'
);

// Playwright wraps each addInitScript call in a separate function, so a `var webVitals`
// from one call is NOT visible to a second call. We combine IIFE + observer registration
// into a single call so they share the same scope.
function buildInitScript() {
  const iife = readFileSync(webVitalsIifePath, 'utf-8');
  return `
    ${iife}
    window.__wvResults = {};
    const opt = { reportAllChanges: true };
    webVitals.onCLS(m  => { window.__wvResults.CLS  = { value: m.value,  rating: m.rating }; }, opt);
    webVitals.onLCP(m  => { window.__wvResults.LCP  = { value: m.value,  rating: m.rating }; }, opt);
    webVitals.onFCP(m  => { window.__wvResults.FCP  = { value: m.value,  rating: m.rating }; }, opt);
    webVitals.onTTFB(m => { window.__wvResults.TTFB = { value: m.value,  rating: m.rating }; }, opt);
    webVitals.onINP(m  => { window.__wvResults.INP  = { value: m.value,  rating: m.rating }; }, opt);
  `;
}

export async function setupVitalsCollection(page) {
  await page.addInitScript(buildInitScript());
}

export async function collectVitals(page) {
  return page.evaluate(() => window.__wvResults);
}
