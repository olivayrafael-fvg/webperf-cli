const GA_ENDPOINTS = ['google-analytics.com', 'analytics.google.com', 'googletagmanager.com'];
const DATADOG_ENDPOINTS = ['browser-intake-datadoghq.com', 'datadoghq.com'];

const DATALAYER_INTERCEPT = `
  window.__gaEvents = [];
  window.dataLayer = new Proxy(window.dataLayer || [], {
    get(target, prop) {
      if (prop === 'push') {
        return function (...args) {
          args.forEach(item => {
            if (item && item.event) {
              window.__gaEvents.push({ event: item.event, timestamp: Date.now() });
            }
          });
          return Array.prototype.push.apply(target, args);
        };
      }
      return Reflect.get(target, prop);
    },
  });
`;

export async function setupGACollection(page, gaConfig = {}, rumConfig = {}) {
  const requests = [];

  page.on('request', req => {
    const url = req.url();
    const isGA = GA_ENDPOINTS.some(ep => url.includes(ep));
    const isDD = rumConfig?.provider === 'datadog' && DATADOG_ENDPOINTS.some(ep => url.includes(ep));
    if (isGA || isDD) {
      requests.push({ url, type: isGA ? 'ga' : 'datadog', timestamp: Date.now() });
    }
  });

  await page.addInitScript(DATALAYER_INTERCEPT);

  return { requests, watchEvents: gaConfig?.watchEvents || [] };
}

export async function collectGA(page, collector) {
  const events = await page.evaluate(() => window.__gaEvents || []);

  const watchEvents = collector.watchEvents;
  const found = watchEvents.map(name => ({
    event: name,
    fired: events.some(e => e.event === name),
  }));

  return {
    events,
    requests: collector.requests,
    watchedEvents: found,
  };
}
