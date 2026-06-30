import { writeFileSync } from 'fs';
import path from 'path';

const VITALS_THRESHOLDS = {
  LCP:  { good: 2500, poor: 4000, unit: 'ms' },
  FCP:  { good: 1800, poor: 3000, unit: 'ms' },
  TTFB: { good: 800,  poor: 1800, unit: 'ms' },
  INP:  { good: 200,  poor: 500,  unit: 'ms' },
  CLS:  { good: 0.1,  poor: 0.25, unit: '' },
};

const LH_THRESHOLDS = {
  FCP:  { good: 1800, poor: 3000, unit: 'ms' },
  LCP:  { good: 2500, poor: 4000, unit: 'ms' },
  CLS:  { good: 0.1,  poor: 0.25, unit: '' },
  TBT:  { good: 200,  poor: 600,  unit: 'ms' },
  TTI:  { good: 3800, poor: 7300, unit: 'ms' },
  SI:   { good: 3387, poor: 5800, unit: 'ms' },
  TTFB: { good: 800,  poor: 1800, unit: 'ms' },
};

const SUGGESTIONS = {
  LCP: 'Optimizar el recurso above-the-fold (imagen/banner principal): preload, compresión, evitar render-blocking.',
  CLS: 'Reservar dimensiones (min-height / aspect-ratio) en secciones lazy-loaded para evitar layout shifts.',
  FCP: 'Reducir JS/CSS render-blocking para adelantar el primer pintado.',
  TTFB: 'Revisar latencia de red/servidor — DNS, TLS, tiempo de respuesta del BFF/CDN.',
  INP: 'Reducir trabajo en el hilo principal durante interacciones del usuario.',
  TBT: 'Dividir JS en chunks más chicos (code-splitting) para reducir bloqueo del hilo principal.',
  TTI: 'Diferir o eliminar scripts de terceros no críticos para alcanzar interactividad antes.',
  SI: 'Priorizar el pintado progresivo del contenido visible.',
};

function icon(rating) {
  return { good: '✅', 'needs-improvement': '⚠️', poor: '❌' }[rating] ?? '—';
}

function fmtValue(metric, value, thresholds) {
  if (value == null) return '—';
  const unit = thresholds[metric]?.unit ?? '';
  return metric === 'CLS' ? value.toFixed(3) : `${Math.round(value)}${unit}`;
}

function dateStr(timestamp) {
  return new Date(timestamp).toLocaleString('es-AR');
}

function vitalsTable(pages) {
  const METRICS = ['LCP', 'CLS', 'FCP', 'INP', 'TTFB'];
  const header = `| Página | ${METRICS.join(' | ')} |\n|---|${METRICS.map(() => '---').join('|')}|`;
  const rows = pages
    .filter(p => p.vitals)
    .map(p => {
      const cells = METRICS.map(m => {
        const v = p.vitals[m];
        return v ? `${fmtValue(m, v.value, VITALS_THRESHOLDS)} ${icon(v.rating)}` : '—';
      }).join(' | ');
      return `| \`${p.path}\` | ${cells} |`;
    });
  if (rows.length === 0) return '';
  return `### Umbrales de referencia (Google CWV)

| Métrica | Good | Needs Improvement | Poor |
|---|---|---|---|
| LCP | ≤ 2500 ms | 2500-4000 ms | > 4000 ms |
| CLS | ≤ 0.1 | 0.1-0.25 | > 0.25 |
| INP | ≤ 200 ms | 200-500 ms | > 500 ms |
| FCP | ≤ 1800 ms | 1800-3000 ms | > 3000 ms |
| TTFB | ≤ 800 ms | 800-1800 ms | > 1800 ms |

### Resultados

${header}
${rows.join('\n')}`;
}

function lighthouseSection(pages) {
  const withLh = pages.filter(p => p.lighthouse);
  if (withLh.length === 0) return '';

  const METRICS = ['FCP', 'LCP', 'CLS', 'TBT', 'TTI', 'SI', 'TTFB'];
  const blocks = withLh.map(p => {
    const { score, formFactor, metrics, consoleErrors, thirdPartyCookies } = p.lighthouse;
    const scoreIcon = score >= 90 ? '✅' : score >= 50 ? '⚠️' : '❌';
    const header = `| Métrica | ${METRICS.join(' | ')} |\n|---|${METRICS.map(() => '---').join('|')}|`;
    const row = `| Valor | ${METRICS.map(m => {
      const v = metrics[m];
      return v ? `${fmtValue(m, v.value, LH_THRESHOLDS)} ${icon(v.rating)}` : '—';
    }).join(' | ')} |`;

    const errors = consoleErrors?.length
      ? `\n**Console errors detectados:**\n${consoleErrors.map(e => `- \`${e.url ?? e.source}\` — ${e.description}`).join('\n')}`
      : '';
    const cookies = thirdPartyCookies > 0 ? `\n_${thirdPartyCookies} third-party cookies detectadas_` : '';

    return `### \`${p.path}\` (${formFactor})

**Score: ${score}/100 ${scoreIcon}**

${header}
${row}
${errors}${cookies}`.trimEnd();
  });

  return `## Lighthouse\n\n${blocks.join('\n---\n\n')}`;
}

function a11ySection(pages, dataKey = 'a11y') {
  const withA11y = pages.filter(p => p[dataKey]);
  if (withA11y.length === 0) return '';

  const allViolations = withA11y.flatMap(p =>
    (p[dataKey].violations ?? []).map(v => ({ ...v, page: p.path }))
  );

  if (allViolations.length === 0) {
    return `Sin violaciones encontradas ✅`;
  }

  const impactIcon = { critical: '🔴', serious: '🟠', moderate: '🟡', minor: '⚪' };
  const list = allViolations
    .map(v => `- ${impactIcon[v.impact] ?? '⚪'} **[${v.impact}] ${v.id}** — ${v.nodes} nodo(s) en \`${v.page}\`\n  ${v.description} ([docs](${v.helpUrl}))`)
    .join('\n');

  return list;
}

function responsiveSection(pages, dataKey = 'responsive') {
  const withScreens = pages.filter(p => p[dataKey]);
  if (withScreens.length === 0) return '';

  return withScreens.map(p => {
    const imgs = Object.entries(p[dataKey])
      .map(([name, bp]) => `![${name} (${bp.width}px)](${bp.screenshot})`)
      .join('\n');
    return `**\`${p.path}\`**\n\n${imgs}`;
  }).join('\n\n');
}

function bundleSection(pages) {
  const withBundle = pages.filter(p => p.bundle);
  if (withBundle.length === 0) return '';

  const rows = withBundle.map(p => {
    const top = p.bundle.scripts
      .sort((a, b) => b.kb - a.kb)
      .slice(0, 5)
      .map(s => `${s.name} (${s.kb}KB)`)
      .join(', ');
    return `| \`${p.path}\` | ${p.bundle.totalKB} KB | ${p.bundle.scriptCount} | ${top} |`;
  });

  return `| Página | Total | Scripts | Top archivos |
|---|---|---|---|
${rows.join('\n')}`;
}

function cacheSection(cache) {
  if (!cache) return '';
  const rows = cache.map(c =>
    `| \`${c.endpoint}\` | ${c.cacheControl || '—'} | ${c.hasEtag ? '✓' : '✗'} | ${c.returns304 ? '304 ✅' : `❌ ${c.note || 'No 304'}`} |`
  );
  return `| Endpoint | Cache-Control | ETag | Resultado |
|---|---|---|---|
${rows.join('\n')}`;
}

function gaSection(pages) {
  const withGa = pages.filter(p => p.ga);
  if (withGa.length === 0) return '';

  const rows = withGa.map(p => {
    const watched = (p.ga.watchedEvents || [])
      .map(e => `\`${e.event}\` ${e.fired ? '✅' : '❌'}`)
      .join(', ');
    return `| \`${p.path}\` | ${watched || '—'} | ${p.ga.events?.length ?? 0} events · ${p.ga.requests?.length ?? 0} requests |`;
  });

  const failedInteractions = pages.flatMap(p => (p.interactions ?? []).filter(i => !i.ok).map(i => ({ ...i, page: p.path })));
  const interactionsNote = failedInteractions.length
    ? `\n\n⚠️ Interacciones fallidas (selector no encontrado o timeout):\n${failedInteractions.map(i => `- \`${i.selector}\` (${i.action}) en \`${i.page}\` — ${i.error}`).join('\n')}`
    : '';

  return `| Página | Eventos esperados | Total capturado |
|---|---|---|
${rows.join('\n')}${interactionsNote}`;
}

function fallbackSection(fallback) {
  if (!fallback) return '';
  const rows = fallback.map(f =>
    `| \`${f.endpoint}\` | ${f.ok ? 'Fallback OK ✅' : 'Sin contenido ❌'} |`
  );
  return `| Endpoint bloqueado | Resultado |
|---|---|
${rows.join('\n')}`;
}

function baselineSection(baseline) {
  if (!baseline?.delta) return '';
  const rows = baseline.delta.flatMap(page =>
    Object.entries(page.metrics).map(([metric, d]) => {
      const arrow = d.improved ? '🟢' : '🔴';
      return `| \`${page.path}\` | ${metric} | ${fmtValue(metric, d.before, VITALS_THRESHOLDS)} | ${fmtValue(metric, d.after, VITALS_THRESHOLDS)} | ${arrow} ${d.pct} |`;
    })
  );
  if (rows.length === 0) return '';
  return `Comparado contra run \`${baseline.previousId}\` [${baseline.previousEnv}]

| Página | Métrica | Antes | Después | Δ |
|---|---|---|---|---|
${rows.join('\n')}`;
}

function findings(results) {
  const items = [];

  for (const p of results.pages) {
    const sources = [
      ['vitals', p.vitals, VITALS_THRESHOLDS],
      ['lighthouse', p.lighthouse?.metrics, LH_THRESHOLDS],
    ];
    for (const [, metrics, thresholds] of sources) {
      if (!metrics) continue;
      for (const [name, m] of Object.entries(metrics)) {
        if (!m || m.rating === 'good' || m.rating === 'unknown') continue;
        const mark = m.rating === 'poor' ? '🔴' : '🟡';
        items.push(`${mark} **${name} ${m.rating}** en \`${p.path}\` (${fmtValue(name, m.value, thresholds)}). ${SUGGESTIONS[name] ?? ''}`);
      }
    }

    const a11yViolations = p.a11y?.violations ?? [];
    if (a11yViolations.length > 0) {
      const critical = a11yViolations.filter(v => v.impact === 'critical' || v.impact === 'serious');
      if (critical.length > 0) {
        items.push(`🔴 **${critical.length} violación(es) de accesibilidad crítica/seria** en \`${p.path}\` (${critical.map(v => v.id).join(', ')}). Revisar antes de pasar a producción.`);
      }
    }

    const consoleErrors = p.lighthouse?.consoleErrors ?? [];
    if (consoleErrors.length > 0) {
      items.push(`🔴 **${consoleErrors.length} error(es) de consola** en \`${p.path}\` — incluye recursos rotos (404) o fallos de carga. Revisar.`);
    }

    const missingEvents = (p.ga?.watchedEvents ?? []).filter(e => !e.fired);
    if (missingEvents.length > 0) {
      items.push(`🔴 **Evento(s) GA esperados sin disparar** en \`${p.path}\`: ${missingEvents.map(e => `\`${e.event}\``).join(', ')}. Verificar que el elemento que dispara el evento exista y tenga contenido (un selector que no encuentra nada nunca va a disparar el evento).`);
    }

    const failedInteractions = (p.interactions ?? []).filter(i => !i.ok);
    if (failedInteractions.length > 0) {
      items.push(`🟡 **${failedInteractions.length} interacción(es) fallida(s)** en \`${p.path}\` (selector no encontrado/timeout) — revisar si cambió el markup o si el elemento no está presente en este build.`);
    }
  }

  if (results.cache && !results.cache.every(c => c.ok)) {
    items.push(`🟡 **Cache BFF**: algunos endpoints no devuelven 304/Cache-Control correcto. Revisar headers de cache del BFF.`);
  }

  if (results.fallback && !results.fallback.every(f => f.ok)) {
    items.push(`🔴 **Fallback BFF/CMS**: la UI no renderiza contenido cuando el BFF falla. Riesgo de pantalla rota ante caída del servicio.`);
  }

  if (items.length === 0) {
    items.push('🟢 Sin hallazgos relevantes — todas las métricas dentro de los umbrales evaluados.');
  }

  return items.join('\n\n');
}

function summaryTable(results) {
  const { pages, cache, fallback } = results;
  const rows = [];

  const lhScores = pages.filter(p => p.lighthouse).map(p => p.lighthouse.score);
  if (lhScores.length) {
    const avg = Math.round(lhScores.reduce((a, b) => a + b, 0) / lhScores.length);
    rows.push(`| Lighthouse score | ${avg}/100 ${avg >= 90 ? '✅' : avg >= 50 ? '⚠️' : '❌'} |`);
  }

  const vitalsOk = pages.every(p => !p.vitals || Object.values(p.vitals).every(m => m.rating !== 'poor'));
  rows.push(`| Web Vitals | ${vitalsOk ? '✅ OK' : '⚠️ con métricas poor'} |`);

  const a11yViolations = pages.reduce((n, p) => n + (p.a11y?.violations?.length ?? 0), 0);
  rows.push(`| Accesibilidad | ${a11yViolations === 0 ? '✅ sin violaciones' : `❌ ${a11yViolations} violación(es)`} |`);

  if (cache) rows.push(`| Cache BFF | ${cache.every(c => c.ok) ? '✅' : '⚠️'} |`);
  if (fallback) rows.push(`| Fallback | ${fallback.every(f => f.ok) ? '✅' : '❌'} |`);

  return `| Check | Resultado |\n|---|---|\n${rows.join('\n')}`;
}

function generatedFilesSection(results) {
  const files = [
    ['report.html', 'reporte visual completo'],
    ['report.json', 'datos raw'],
  ];
  if (results.pages.some(p => p.a11yComponent || p.responsiveComponent)) {
    files.push(['report-component.html / report-component.md', 'reporte del componente auditado']);
  }
  if (results.pages.some(p => p.responsive)) {
    files.push(['screenshots/*.png', 'capturas responsive (desktop/tablet/mobile)']);
  }
  return files.map(([f, desc]) => `- \`${f}\` — ${desc}`).join('\n');
}

function componentSummary(pages) {
  return pages.map(p => {
    const c = p.component;
    if (!c) return '';
    if (!c.exists) return `**\`${p.path}\`**: ❌ ${c.error || 'No encontrado'}`;
    return `**\`${p.path}\`**

| Posición | Dimensiones | CLS elemento | Render |
|---|---|---|---|
| ${c.isAboveFold ? 'above fold' : 'below fold'} | ${c.width} × ${c.height}px | ${c.elementCls ?? '—'} | ${c.isServerRendered ? 'SSR ✅' : 'client'} |`;
  }).filter(Boolean).join('\n\n');
}

function section(title, body) {
  if (!body || !body.trim()) return '';
  return `## ${title}\n\n${body}\n`;
}

export function generateMarkdownReport(results, outDir, { ticket, configPath } = {}) {
  const { config, timestamp, pages, cache, fallback, baseline, componentSelector } = results;

  const sections = [
    section('Web Vitals', vitalsTable(pages)),
    pages.some(p => p.component) ? section(`Componente \`${componentSelector}\``, componentSummary(pages)) : '',
    lighthouseSection(pages),
    section('Accesibilidad', a11ySection(pages, 'a11y')),
    section('Responsive', responsiveSection(pages, 'responsive')),
    section('Bundle JS', bundleSection(pages)),
    section('Cache BFF', cacheSection(cache)),
    section('GA / RUM Events', gaSection(pages)),
    section('Fallback BFF/CMS', fallbackSection(fallback)),
    section('Comparación contra run anterior', baselineSection(baseline)),
  ].filter(s => s && s.trim());

  const md = `# Evidencia QA — ${config.name}

> Ambiente: **${config.env || 'local'}** · URL: \`${config.baseUrl}\`
> Fecha: **${dateStr(timestamp)}** · Generado con webperf-cli
${ticket ? `> Ticket: **${ticket}**\n` : ''}
---

## Resumen

${summaryTable(results)}

---

${sections.join('\n\n---\n\n')}
---

## Hallazgos y acciones sugeridas

${findings(results)}

---

## Archivos generados

${generatedFilesSection(results)}

---

## Cómo re-ejecutar

\`\`\`bash
node cli.js run -c ${configPath ?? `configs/${config.name}.json`}${componentSelector ? ` --component '${componentSelector}'` : ''}
\`\`\`
`;

  const generalPath = path.join(outDir, 'report.md');
  writeFileSync(generalPath, md, 'utf-8');
  const paths = { general: generalPath };

  const hasComponentData = pages.some(p => p.component || p.a11yComponent || p.responsiveComponent);
  if (hasComponentData && componentSelector) {
    const compSections = [
      section('Accesibilidad (scope componente)', a11ySection(pages, 'a11yComponent')),
      section('Screenshots', responsiveSection(pages, 'responsiveComponent')),
    ].filter(s => s && s.trim());

    const compMd = `# Evidencia QA — Componente \`${componentSelector}\`

> Proyecto: **${config.name}** · Ambiente: **${config.env || 'local'}**
> Fecha: **${dateStr(timestamp)}**
${ticket ? `> Ticket: **${ticket}**\n` : ''}
---

## Componente

${componentSummary(pages)}
${compSections.length ? `\n---\n\n${compSections.join('\n---\n\n')}` : ''}
`;
    const compPath = path.join(outDir, 'report-component.md');
    writeFileSync(compPath, compMd, 'utf-8');
    paths.component = compPath;
  }

  return paths;
}
