import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import path from 'path';
import os from 'os';

export const DEFAULT_OUT_DIR = path.join(os.homedir(), 'webperf-reports');

function historyFile(configName, baseDir = DEFAULT_OUT_DIR) {
  const dir = path.join(baseDir, '.history');
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${configName}.jsonl`);
}

export function appendRun(results, baseDir) {
  const entry = {
    id: results.timestamp,
    env: results.config.env || 'local',
    baseUrl: results.config.baseUrl,
    pages: results.pages.map(p => ({
      path: p.path,
      vitals: p.vitals ?? null,
      bundle: p.bundle ? { totalKB: p.bundle.totalKB } : null,
      a11y: p.a11y ? { violations: p.a11y.violations.length } : null,
    })),
  };
  appendFileSync(historyFile(results.config.name, baseDir), JSON.stringify(entry) + '\n');
}

export function loadHistory(configName, baseDir) {
  const file = historyFile(configName, baseDir);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

// Returns the last run matching the given env (or any env if not specified)
export function getLastRun(configName, env, baseDir) {
  const runs = loadHistory(configName, baseDir);
  const filtered = env ? runs.filter(r => r.env === env) : runs;
  return filtered.at(-1) ?? null;
}

export function compareWithRun(results, previous) {
  if (!previous) {
    return { error: `No hay historial para "${results.config.name}". Corré al menos una vez primero.` };
  }

  const METRICS = ['LCP', 'CLS', 'FCP', 'INP', 'TTFB'];

  const delta = results.pages.map(current => {
    const prev = previous.pages.find(p => p.path === current.path);
    if (!prev?.vitals || !current.vitals) return { path: current.path, metrics: {} };

    const metrics = {};
    for (const m of METRICS) {
      const after  = current.vitals[m]?.value;
      const before = prev.vitals[m]?.value;
      if (after === undefined || before === undefined) continue;
      const diff = after - before;
      metrics[m] = {
        before,
        after,
        diff,
        pct: `${diff >= 0 ? '+' : ''}${((diff / before) * 100).toFixed(1)}%`,
        improved: diff < 0,
      };
    }
    return { path: current.path, metrics };
  });

  return { previousId: previous.id, previousEnv: previous.env, delta };
}

export function printHistory(configName, { limit = 10, env, baseDir } = {}) {
  const runs = loadHistory(configName, baseDir);
  const filtered = env ? runs.filter(r => r.env === env) : runs;
  const shown = filtered.slice(-limit).reverse();

  if (shown.length === 0) {
    console.log(`Sin historial${env ? ` para entorno "${env}"` : ''}.`);
    return;
  }

  const METRICS = ['LCP', 'CLS', 'FCP', 'INP', 'TTFB'];
  console.log(`\nHistorial — ${configName}${env ? ` (${env})` : ''}\n`);

  for (const run of shown) {
    console.log(`  ${run.id}  [${run.env}]  ${run.baseUrl}`);
    for (const page of run.pages) {
      if (!page.vitals) continue;
      const vitals = METRICS.map(m => {
        const v = page.vitals[m];
        if (!v) return `${m}:—`;
        const val = m === 'CLS' ? v.value.toFixed(3) : `${Math.round(v.value)}ms`;
        return `${m}:${val}(${v.rating[0]})`;
      }).join('  ');
      console.log(`    ${page.path.padEnd(20)} ${vitals}`);
    }
    console.log();
  }
}
