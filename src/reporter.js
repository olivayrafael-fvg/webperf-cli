import { writeFileSync } from 'fs';
import path from 'path';

const THRESHOLDS = {
  LCP:  { good: 2500,  poor: 4000,  fmt: v => `${Math.round(v)}ms` },
  FCP:  { good: 1800,  poor: 3000,  fmt: v => `${Math.round(v)}ms` },
  TTFB: { good: 800,   poor: 1800,  fmt: v => `${Math.round(v)}ms` },
  INP:  { good: 200,   poor: 500,   fmt: v => `${Math.round(v)}ms` },
  CLS:  { good: 0.1,   poor: 0.25,  fmt: v => v.toFixed(3) },
};

function rating(metric, value) {
  if (value === undefined || value === null) return 'unknown';
  const t = THRESHOLDS[metric];
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

function fmt(metric, value) {
  if (value === undefined || value === null) return '—';
  return THRESHOLDS[metric]?.fmt(value) ?? String(value);
}

function badgeClass(r) {
  return { good: 'g', 'needs-improvement': 'ni', poor: 'p' }[r] ?? 'u';
}

function impactClass(impact) {
  return { critical: 'crit', serious: 'ser', moderate: 'mod', minor: 'min' }[impact] ?? 'min';
}

const LH_THRESHOLDS = {
  FCP:  { good: 1800, poor: 3000, fmt: v => `${v}ms` },
  LCP:  { good: 2500, poor: 4000, fmt: v => `${v}ms` },
  CLS:  { good: 0.1,  poor: 0.25, fmt: v => v.toFixed ? v.toFixed(3) : v },
  TBT:  { good: 200,  poor: 600,  fmt: v => `${v}ms` },
  TTI:  { good: 3800, poor: 7300, fmt: v => `${v}ms` },
  SI:   { good: 3387, poor: 5800, fmt: v => `${v}ms` },
  TTFB: { good: 800,  poor: 1800, fmt: v => `${v}ms` },
};

function lhBadge(name, metric) {
  if (!metric) return '—';
  const t = LH_THRESHOLDS[name];
  const cls = metric.rating === 'good' ? 'bg' : metric.rating === 'needs-improvement' ? 'bni' : 'bp';
  const val = t?.fmt ? t.fmt(metric.value) : metric.value;
  return `<span class="badge b${cls}">${val}</span>`;
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#1a1a1a;background:#f0f0f0}
.hdr{background:#111;color:#fff;padding:20px 32px}
.hdr h1{font-size:20px;font-weight:600}
.hdr .meta{color:#888;margin-top:4px;font-size:12px}
.wrap{max-width:1100px;margin:20px auto;padding:0 16px}
.sec{background:#fff;border-radius:8px;padding:20px 24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
.sec h2{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:#666;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:14px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;color:#999;border-bottom:2px solid #eee}
td{padding:9px 10px;border-bottom:1px solid #f4f4f4;vertical-align:top}
tr:last-child td{border-bottom:none}
.mono{font-family:monospace;font-size:12px;color:#555}
.b{font-weight:600}
.badge{display:inline-block;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:500}
.bg{background:#e6f9f0;color:#0a7a44}.bni{background:#fff3e0;color:#b36200}.bp{background:#ffeaea;color:#c62828}.bu{background:#f0f0f0;color:#777}
.vi{padding:8px 10px;border-left:3px solid;border-radius:0 4px 4px 0;margin-bottom:6px;font-size:13px}
.vcrit{border-color:#c62828;background:#ffeaea}.vser{border-color:#e64a19;background:#fff3e0}
.vmod{border-color:#f9a825;background:#fffde7}.vmin{border-color:#bbb;background:#f9f9f9}
.vi a{font-size:11px;color:#666;text-decoration:none}
.vi strong{display:block;margin-bottom:2px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.grid3 img{width:100%;border-radius:4px;border:1px solid #eee;display:block}
.grid3 .lbl{font-size:11px;color:#888;margin-top:4px;text-align:center}
.sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:6px}
.card{padding:14px;border-radius:6px;background:#f9f9f9;text-align:center}
.card .cl{font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.4px}
.card .cv{font-size:26px;font-weight:700;margin-top:2px}
.ok{color:#0a7a44}.warn{color:#b36200}.fail{color:#c62828}
.imp{color:#0a7a44}.reg{color:#c62828}
.tag{display:inline-block;background:#eef;color:#447;padding:1px 6px;border-radius:4px;font-size:11px;margin:2px}
.tagok{background:#e6f9f0;color:#0a7a44}.tagmiss{background:#ffeaea;color:#c62828}
`;

export function generateReport(results, outDir) {
  const { config, timestamp, pages, cache, fallback, baseline, componentSelector } = results;

  const generalHtml = buildPage(
    `webperf — ${config.name}`,
    `webperf-cli — ${config.name}`,
    `${new Date(timestamp).toLocaleString('es-AR')} · ${config.env || 'local'} · ${config.baseUrl} · ${pages.length} página(s)`,
    [
      renderSummary(results),
      pages.some(p => p.lighthouse) ? renderLighthouse(pages) : '',
      pages.some(p => p.vitals)     ? renderVitals(pages)    : '',
      pages.some(p => p.component)  ? renderComponent(pages, componentSelector) : '',
      pages.some(p => p.a11y)       ? renderA11y(pages, 'a11y')       : '',
      pages.some(p => p.responsive) ? renderResponsive(pages, 'responsive') : '',
      pages.some(p => p.bundle)     ? renderBundle(pages)    : '',
      cache                         ? renderCache(cache)     : '',
      pages.some(p => p.ga)         ? renderGA(pages)        : '',
      fallback                      ? renderFallback(fallback) : '',
      baseline?.delta               ? renderBaseline(baseline) : '',
    ].join('\n')
  );

  const generalPath = path.join(outDir, 'report.html');
  writeFileSync(generalPath, generalHtml, 'utf-8');
  writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2), 'utf-8');

  const paths = { general: generalPath };

  const hasComponentData = pages.some(p => p.component || p.a11yComponent || p.responsiveComponent);
  if (hasComponentData && componentSelector) {
    const componentHtml = buildPage(
      `webperf componente — ${config.name}`,
      `Componente: ${componentSelector}`,
      `${config.name} · ${new Date(timestamp).toLocaleString('es-AR')} · ${config.env || 'local'}`,
      [
        renderComponentDetail(pages, componentSelector),
        pages.some(p => p.a11yComponent)       ? renderA11y(pages, 'a11yComponent', 'A11y Componente')  : '',
        pages.some(p => p.responsiveComponent) ? renderResponsive(pages, 'responsiveComponent', 'Screenshots Componente') : '',
      ].join('\n')
    );
    const componentPath = path.join(outDir, 'report-component.html');
    writeFileSync(componentPath, componentHtml, 'utf-8');
    paths.component = componentPath;
  }

  return paths;
}

function buildPage(title, h1, meta, body) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
<div class="hdr">
  <h1>${h1}</h1>
  <div class="meta">${meta}</div>
</div>
<div class="wrap">
${body}
</div>
</body>
</html>`;
}

function renderSummary({ pages, cache, fallback }) {
  const vitalsOk = pages.every(p =>
    !p.vitals || Object.values(p.vitals).every(m => m.rating !== 'poor')
  );
  const a11yViolations = pages.reduce((n, p) => n + (p.a11y?.violations?.length ?? 0), 0);
  const cacheOk = !cache || cache.every(c => c.ok);
  const fallbackOk = !fallback || fallback.every(f => f.ok);

  const lhScores = pages.filter(p => p.lighthouse).map(p => p.lighthouse.score);
  const lhAvg = lhScores.length ? Math.round(lhScores.reduce((a, b) => a + b, 0) / lhScores.length) : null;
  const lhClass = lhAvg == null ? '' : lhAvg >= 90 ? 'ok' : lhAvg >= 50 ? 'warn' : 'fail';

  const lhConsoleErrors = pages.reduce((n, p) => n + (p.lighthouse?.consoleErrors?.length ?? 0), 0);

  return `<div class="sec">
  <h2>Resumen</h2>
  <div class="sum">
    ${lhAvg != null ? `<div class="card"><div class="cl">Lighthouse Performance</div><div class="cv ${lhClass}">${lhAvg}</div></div>` : ''}
    <div class="card"><div class="cl">Vitals</div><div class="cv ${vitalsOk ? 'ok' : 'warn'}">${vitalsOk ? '✓' : '⚠'}</div></div>
    <div class="card"><div class="cl">A11y violaciones</div><div class="cv ${a11yViolations === 0 ? 'ok' : 'fail'}">${a11yViolations}</div></div>
    <div class="card"><div class="cl">Cache BFF</div><div class="cv ${cacheOk ? 'ok' : 'fail'}">${cacheOk ? '✓' : '✗'}</div></div>
    <div class="card"><div class="cl">Fallback</div><div class="cv ${fallbackOk ? 'ok' : 'fail'}">${fallbackOk ? '✓' : '✗'}</div></div>
    ${lhConsoleErrors > 0 ? `<div class="card"><div class="cl">Console errors</div><div class="cv fail">${lhConsoleErrors}</div></div>` : ''}
  </div>
</div>`;
}

function renderVitals(pages) {
  const METRICS = ['LCP', 'CLS', 'FCP', 'INP', 'TTFB'];
  const rows = pages.map(p => {
    if (!p.vitals) return '';
    const cells = METRICS.map(m => {
      const v = p.vitals[m];
      const r = v ? rating(m, v.value) : 'unknown';
      const bc = badgeClass(r);
      return `<td><span class="badge b${bc}">${fmt(m, v?.value)}</span></td>`;
    }).join('');
    return `<tr><td class="mono">${p.path}</td>${cells}</tr>`;
  }).join('');

  return `<div class="sec">
  <h2>Web Vitals</h2>
  <table>
    <tr><th>Página</th>${METRICS.map(m => `<th>${m}</th>`).join('')}</tr>
    ${rows}
  </table>
</div>`;
}

function renderA11y(pages, dataKey = 'a11y', title = 'Accesibilidad') {
  const allViolations = pages.flatMap(p =>
    (p[dataKey]?.violations ?? []).map(v => ({ ...v, page: p.path }))
  );

  const keyboard = pages.map(p =>
    p[dataKey]?.keyboard
      ? `<tr><td class="mono">${p.path}</td><td>${p[dataKey].keyboard.focusableElements} elementos focusables</td><td>${p[dataKey].keyboard.tabbed} tabulaciones OK</td></tr>`
      : ''
  ).join('');

  const scope = pages.find(p => p[dataKey])?.[ dataKey]?.scope;
  const scopeNote = scope && scope !== 'document.body'
    ? `<p class="mono" style="font-size:12px;color:#888;margin-bottom:10px">Scope: ${scope}</p>`
    : '';

  const violations = allViolations.length === 0
    ? '<p style="color:#0a7a44">Sin violaciones encontradas ✓</p>'
    : allViolations.map(v => `
      <div class="vi v${impactClass(v.impact)}">
        <strong>[${v.impact}] ${v.id} — ${v.nodes} nodo(s) <span class="mono">${v.page}</span></strong>
        ${v.description}
        <a href="${v.helpUrl}" target="_blank">→ docs</a>
      </div>`).join('');

  return `<div class="sec">
  <h2>${title}</h2>
  ${scopeNote}
  ${violations}
  ${keyboard ? `<table style="margin-top:12px"><tr><th>Página</th><th>Elementos</th><th>Teclado</th></tr>${keyboard}</table>` : ''}
</div>`;
}

function renderResponsive(pages, dataKey = 'responsive', title = 'Responsive') {
  const blocks = pages.flatMap(p => {
    if (!p[dataKey]) return [];
    const imgs = Object.entries(p[dataKey]).map(([name, bp]) =>
      `<div><img src="${bp.screenshot}" alt="${name}"><div class="lbl">${name} (${bp.width}px)</div></div>`
    ).join('');
    return [`<p class="mono" style="margin-bottom:8px">${p.path}</p><div class="grid3">${imgs}</div>`];
  });

  return `<div class="sec">
  <h2>${title}</h2>
  ${blocks.join('<hr style="margin:16px 0;border:none;border-top:1px solid #eee">')}
</div>`;
}

function renderBundle(pages) {
  const rows = pages.map(p => {
    if (!p.bundle) return '';
    const topScripts = p.bundle.scripts
      .sort((a, b) => b.kb - a.kb)
      .slice(0, 5)
      .map(s => `<span class="tag">${s.name} (${s.kb}KB)</span>`)
      .join('');
    return `<tr>
      <td class="mono">${p.path}</td>
      <td class="b">${p.bundle.totalKB} KB</td>
      <td>${p.bundle.scriptCount} archivos</td>
      <td>${topScripts}</td>
    </tr>`;
  }).join('');

  return `<div class="sec">
  <h2>Bundle JS</h2>
  <table>
    <tr><th>Página</th><th>Total</th><th>Scripts</th><th>Top archivos</th></tr>
    ${rows}
  </table>
</div>`;
}

function renderCache(cache) {
  const rows = cache.map(c => `
    <tr>
      <td class="mono">${c.endpoint}</td>
      <td>${c.cacheControl || '—'}</td>
      <td>${c.hasEtag ? '✓' : '✗'}</td>
      <td><span class="badge ${c.returns304 ? 'bg' : 'bp'}">${c.returns304 ? '304 ✓' : c.note || 'No 304'}</span></td>
    </tr>`
  ).join('');

  return `<div class="sec">
  <h2>Cache BFF</h2>
  <table>
    <tr><th>Endpoint</th><th>Cache-Control</th><th>ETag</th><th>Resultado</th></tr>
    ${rows}
  </table>
</div>`;
}

function renderGA(pages) {
  const blocks = pages.map(p => {
    if (!p.ga) return '';
    const watched = (p.ga.watchedEvents || []).map(e =>
      `<span class="tag ${e.fired ? 'tagok' : 'tagmiss'}">${e.event} ${e.fired ? '✓' : '✗'}</span>`
    ).join('');
    const reqCount = p.ga.requests?.length ?? 0;
    return `<tr>
      <td class="mono">${p.path}</td>
      <td>${watched || '—'}</td>
      <td>${p.ga.events?.length ?? 0} events · ${reqCount} requests</td>
    </tr>`;
  }).join('');

  const failedInteractions = pages.flatMap(p => (p.interactions ?? []).filter(i => !i.ok).map(i => ({ ...i, page: p.path })));
  const interactionsWarning = failedInteractions.length === 0 ? '' : `
    <p style="margin-top:10px;color:#c62828;font-size:13px">⚠ Interacciones fallidas (revisar selector):</p>
    ${failedInteractions.map(i => `<div class="vi vser"><span class="mono">${i.selector}</span> (${i.action}) en <span class="mono">${i.page}</span> — ${i.error}</div>`).join('')}`;

  return `<div class="sec">
  <h2>GA / RUM Events</h2>
  <table>
    <tr><th>Página</th><th>Eventos esperados</th><th>Total capturado</th></tr>
    ${blocks}
  </table>
  ${interactionsWarning}
</div>`;
}

function renderFallback(fallback) {
  const rows = fallback.map(f => `
    <tr>
      <td class="mono">${f.endpoint}</td>
      <td><span class="badge ${f.ok ? 'bg' : 'bp'}">${f.ok ? 'Fallback OK' : 'Sin contenido'}</span></td>
      ${f.screenshot ? `<td><a href="${f.screenshot}" target="_blank">ver screenshot</a></td>` : '<td>—</td>'}
    </tr>`
  ).join('');

  return `<div class="sec">
  <h2>Fallback BFF/CMS</h2>
  <table>
    <tr><th>Endpoint bloqueado</th><th>Resultado</th><th>Screenshot</th></tr>
    ${rows}
  </table>
</div>`;
}

function renderBaseline({ baselineTimestamp, delta, error }) {
  if (error) return `<div class="sec"><h2>Comparación Baseline</h2><p class="fail">${error}</p></div>`;

  const rows = delta.flatMap(page =>
    Object.entries(page.metrics).map(([metric, d]) => `
      <tr>
        <td class="mono">${page.url}</td>
        <td class="b">${metric}</td>
        <td>${fmt(metric, d.before)}</td>
        <td>${fmt(metric, d.after)}</td>
        <td class="${d.improved ? 'imp' : 'reg'}">${d.pct}</td>
      </tr>`)
  ).join('');

  return `<div class="sec">
  <h2>Comparación Baseline <small style="font-weight:400;text-transform:none;color:#999">(baseline: ${new Date(baselineTimestamp).toLocaleString('es-AR')})</small></h2>
  <table>
    <tr><th>Página</th><th>Métrica</th><th>Antes</th><th>Después</th><th>Δ</th></tr>
    ${rows}
  </table>
</div>`;
}

function scoreBadge(value) {
  if (value == null) return '—';
  const cls = value >= 90 ? 'bg' : value >= 50 ? 'bni' : 'bp';
  return `<span class="badge b${cls}">${value}</span>`;
}

function renderLighthouse(pages) {
  const LH_METRICS = ['FCP', 'LCP', 'CLS', 'TBT', 'TTI', 'SI', 'TTFB'];
  const SCORE_KEYS = ['performance', 'accessibility', 'bestPractices', 'seo'];
  const SCORE_LABELS = { performance: 'Performance', accessibility: 'Accessibility', bestPractices: 'Best Practices', seo: 'SEO' };

  const scoreRows = pages.map(p => {
    const lh = p.lighthouse;
    if (!lh) return '';
    const s = lh.scores ?? { performance: lh.score };
    return `<tr>
      <td class="mono">${p.path}</td>
      ${SCORE_KEYS.map(k => `<td>${scoreBadge(s[k] ?? null)}</td>`).join('')}
    </tr>`;
  }).join('');

  const metricRows = pages.map(p => {
    const lh = p.lighthouse;
    if (!lh) return '';
    return `<tr>
      <td class="mono">${p.path}</td>
      ${LH_METRICS.map(m => `<td>${lhBadge(m, lh.metrics[m])}</td>`).join('')}
    </tr>`;
  }).join('');

  const allErrors = pages.flatMap(p =>
    (p.lighthouse?.consoleErrors ?? []).map(e => ({ ...e, page: p.path }))
  );
  const errBlock = allErrors.length === 0 ? '' : `
    <h2 style="margin-top:16px">Console Errors</h2>
    ${allErrors.map(e => `
      <div class="vi vcrit">
        <strong>${e.description}</strong>
        <span class="mono">${e.url ?? e.source}</span>
        <span style="font-size:11px;color:#888">${e.page}</span>
      </div>`).join('')}`;

  const cookieWarning = pages.some(p => (p.lighthouse?.thirdPartyCookies ?? 0) > 0)
    ? `<p style="margin-top:10px;color:#b36200;font-size:13px">⚠ ${pages.reduce((n, p) => n + (p.lighthouse?.thirdPartyCookies ?? 0), 0)} third-party cookies detectadas</p>`
    : '';

  const formFactor = pages.find(p => p.lighthouse)?.lighthouse?.formFactor ?? '';

  return `<div class="sec">
  <h2>Lighthouse <span style="font-weight:400;text-transform:none;font-size:11px;color:#999">${formFactor}</span></h2>
  <table>
    <tr><th>Página</th>${SCORE_KEYS.map(k => `<th>${SCORE_LABELS[k]}</th>`).join('')}</tr>
    ${scoreRows}
  </table>
  <h3 style="margin:14px 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#999">Métricas de rendimiento</h3>
  <table>
    <tr><th>Página</th>${LH_METRICS.map(m => `<th>${m}</th>`).join('')}</tr>
    ${metricRows}
  </table>
  ${cookieWarning}
  ${errBlock}
</div>`;
}

function renderComponentDetail(pages, selector) {
  const blocks = pages.map(p => {
    const c = p.component;
    if (!c) return '';
    if (!c.exists) {
      return `<div class="sec"><h2>Componente <code>${selector}</code></h2><p class="fail">${c.error || 'No encontrado'}</p></div>`;
    }
    const position = c.isAboveFold
      ? '<span class="badge bg">above fold</span>'
      : '<span class="badge bu">below fold</span>';
    const clsBadge = c.elementCls != null
      ? `<span class="badge ${c.elementCls < 0.1 ? 'bg' : 'bp'}">${c.elementCls}</span>`
      : '—';
    const ssrBadge = c.isServerRendered
      ? '<span class="badge bg">SSR ✓</span>'
      : '<span class="badge bu">client render</span>';

    return `<div class="sec">
  <h2>Componente <code style="font-size:12px;font-weight:400;background:#f0f0f0;padding:2px 6px;border-radius:3px">${selector}</code> — <span class="mono">${p.path}</span></h2>
  <div class="sum">
    <div class="card"><div class="cl">Posición</div><div style="margin-top:6px">${position}</div></div>
    <div class="card"><div class="cl">Dimensiones</div><div class="cv" style="font-size:18px">${c.width} × ${c.height}px</div></div>
    <div class="card"><div class="cl">CLS elemento</div><div style="margin-top:6px">${clsBadge}</div></div>
    <div class="card"><div class="cl">Render</div><div style="margin-top:6px">${ssrBadge}</div></div>
  </div>
</div>`;
  }).join('');
  return blocks;
}

function renderComponent(pages, selector) {
  const rows = pages.map(p => {
    const c = p.component;
    if (!c) return '';
    if (!c.exists) {
      return `<tr><td class="mono">${p.path}</td><td colspan="5"><span class="badge bp">${c.error || 'No encontrado'}</span></td></tr>`;
    }
    const position = c.isAboveFold
      ? '<span class="badge bg">above fold</span>'
      : '<span class="badge bu">below fold</span>';
    const cls = c.elementCls !== null
      ? `<span class="badge ${c.elementCls < 0.1 ? 'bg' : 'bp'}">${c.elementCls}</span>`
      : '—';
    return `<tr>
      <td class="mono">${p.path}</td>
      <td>${position}</td>
      <td>${c.width} × ${c.height}px</td>
      <td>${cls}</td>
      <td>${c.isServerRendered ? '<span class="badge bg">SSR ✓</span>' : '<span class="badge bu">client</span>'}</td>
    </tr>`;
  }).join('');

  return `<div class="sec">
  <h2>Componente <code style="font-size:12px;font-weight:400;background:#f0f0f0;padding:2px 6px;border-radius:3px">${selector}</code></h2>
  <table>
    <tr><th>Página</th><th>Posición</th><th>Dimensiones</th><th>CLS elemento</th><th>Render</th></tr>
    ${rows}
  </table>
</div>`;
}
