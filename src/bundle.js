const JS_MIME = ['application/javascript', 'text/javascript'];

export function setupBundleCollection(page) {
  const scripts = [];

  page.on('response', async res => {
    const ct = res.headers()['content-type'] || '';
    if (!JS_MIME.some(t => ct.includes(t))) return;

    try {
      const body = await res.body();
      scripts.push({
        url: res.url(),
        bytes: body.length,
        cached: res.status() === 304 || res.fromServiceWorker(),
      });
    } catch {
      // body already consumed, skip
    }
  });

  return { scripts };
}

export function collectBundle(collector) {
  const scripts = collector.scripts.filter(s => !s.cached);
  const totalBytes = scripts.reduce((sum, s) => sum + s.bytes, 0);

  return {
    totalKB: Math.round(totalBytes / 1024),
    scriptCount: scripts.length,
    scripts: scripts.map(s => ({
      name: s.url.split('/').pop().split('?')[0],
      kb: Math.round(s.bytes / 1024),
      url: s.url,
    })),
  };
}
