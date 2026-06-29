import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

const THRESHOLDS = {
  FCP:  { good: 1800, poor: 3000 },
  LCP:  { good: 2500, poor: 4000 },
  CLS:  { good: 0.1,  poor: 0.25 },
  TBT:  { good: 200,  poor: 600  },
  TTI:  { good: 3800, poor: 7300 },
  SI:   { good: 3387, poor: 5800 },
  TTFB: { good: 800,  poor: 1800 },
};

function getRating(name, value) {
  const t = THRESHOLDS[name];
  if (!t || value == null) return 'unknown';
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

function extractMetric(audit, name, decimals = 0) {
  if (!audit || audit.numericValue == null) return null;
  const value = decimals > 0
    ? parseFloat(audit.numericValue.toFixed(decimals))
    : Math.round(audit.numericValue);
  return { value, rating: getRating(name, value), score: audit.score };
}

export async function runLighthouse(url, { formFactor = 'mobile' } = {}) {
  let executablePath;
  try {
    executablePath = chromium.executablePath();
  } catch {
    executablePath = undefined;
  }

  const chrome = await launch({
    chromePath: executablePath,
    chromeFlags: ['--headless=new', '--disable-gpu', '--no-sandbox'],
  });

  try {
    const flags = {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      formFactor,
      screenEmulation: formFactor === 'mobile'
        ? { mobile: true, width: 375, height: 812, deviceScaleFactor: 3, disabled: false }
        : { mobile: false, width: 1280, height: 800, deviceScaleFactor: 1, disabled: false },
      throttlingMethod: 'simulate',
      onlyCategories: ['performance', 'best-practices'],
    };

    const result = await lighthouse(url, flags);
    const { lhr } = result;
    const { audits, categories } = lhr;

    const consoleErrors = (audits['errors-in-console']?.details?.items ?? [])
      .filter(e => !e.description?.includes('ERR_BLOCKED_BY_CLIENT'))
      .map(e => ({
        source: e.source,
        description: e.description,
        url: e.sourceLocation?.url,
      }));

    return {
      score: Math.round((categories.performance?.score ?? 0) * 100),
      formFactor,
      metrics: {
        FCP:  extractMetric(audits['first-contentful-paint'], 'FCP'),
        LCP:  extractMetric(audits['largest-contentful-paint'], 'LCP'),
        CLS:  extractMetric(audits['cumulative-layout-shift'], 'CLS', 3),
        TBT:  extractMetric(audits['total-blocking-time'], 'TBT'),
        TTI:  extractMetric(audits['interactive'], 'TTI'),
        SI:   extractMetric(audits['speed-index'], 'SI'),
        TTFB: audits['server-response-time']?.numericValue != null
          ? { value: Math.round(audits['server-response-time'].numericValue), rating: getRating('TTFB', audits['server-response-time'].numericValue) }
          : null,
      },
      consoleErrors,
      thirdPartyCookies: audits['third-party-cookies']?.details?.items?.length ?? 0,
    };
  } finally {
    await chrome.kill();
  }
}
