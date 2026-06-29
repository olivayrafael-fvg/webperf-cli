export async function runCacheCheck(baseUrl, endpoints) {
  const results = [];

  for (const endpoint of endpoints) {
    const url = `${baseUrl}${endpoint}`;
    const result = { endpoint, url };

    try {
      const res1 = await fetch(url);
      const etag = res1.headers.get('etag');
      const lastModified = res1.headers.get('last-modified');

      result.status1 = res1.status;
      result.cacheControl = res1.headers.get('cache-control');
      result.hasEtag = Boolean(etag);
      result.hasLastModified = Boolean(lastModified);

      if (etag || lastModified) {
        const conditionalHeaders = {};
        if (etag) conditionalHeaders['if-none-match'] = etag;
        if (lastModified) conditionalHeaders['if-modified-since'] = lastModified;

        const res2 = await fetch(url, { headers: conditionalHeaders });
        result.status2 = res2.status;
        result.returns304 = res2.status === 304;
      } else {
        result.returns304 = false;
        result.note = 'Sin ETag ni Last-Modified — no se puede verificar 304';
      }

      result.ok = result.returns304 === true;
    } catch (err) {
      result.ok = false;
      result.error = err.message;
    }

    results.push(result);
  }

  return results;
}
