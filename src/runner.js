import { readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import chalk from 'chalk';
import { checkConnectivity } from './network.js';
import { setupVitalsCollection, collectVitals } from './vitals.js';
import { setupGACollection, collectGA } from './ga.js';
import { runA11y } from './a11y.js';
import { runResponsive } from './responsive.js';
import { auditComponent } from './component.js';
import { setupBundleCollection, collectBundle } from './bundle.js';
import { runCacheCheck } from './cache.js';
import { runFallback } from './fallback.js';
import { runLighthouse } from './lighthouse.js';
import { blockExternalNavigation, mockRoutes, runInteractions } from './interactions.js';
import { appendRun, getLastRun, compareWithRun } from './history.js';
import { generateReport } from './reporter.js';
import { generateMarkdownReport } from './markdown.js';

// goto resolves after the first navigation, but Next.js SPAs fire a second
// client-side router.replace on hydration that destroys the execution context.
// We poll until the context is alive AND the page is at networkidle.
async function navigateTo(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      await page.evaluate(() => null);
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.evaluate(() => null); // confirm context still alive after networkidle
      break;
    } catch {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  await new Promise(r => setTimeout(r, 500));
}

export async function run(options) {
  const configPath = path.resolve(options.config);
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  const ALL_MODULES = ['vitals', 'a11y', 'ga', 'responsive', 'bundle', 'cache', 'fallback', 'lighthouse'];
  const activeModules = options.only
    ? options.only.split(',').map(m => m.trim())
    : ALL_MODULES.filter(m => m !== 'fallback' && m !== 'lighthouse');

  const has = m => activeModules.includes(m);

  const dateSlug = new Date().toISOString().split('T')[0];
  const outDir = path.join(options.out, dateSlug, config.name);
  mkdirSync(outDir, { recursive: true });

  console.log(chalk.bold(`\nwebperf-cli — ${config.name}`));
  console.log(chalk.gray(`Entorno: ${config.env || 'local'} · Salida: ${outDir}\n`));

  const connectivity = await checkConnectivity(config.baseUrl, config.env);
  if (!connectivity.ok) {
    console.error(chalk.red(`✗ ${connectivity.message}`));
    if (connectivity.vpnRequired) {
      console.error(chalk.yellow('  → Conectate a la VPN e intentá de nuevo.'));
    }
    process.exit(1);
  }
  console.log(chalk.green('✓ Conectividad OK'));

  // --component flag overrides config.component.selector
  const componentSelector = options.component ?? config.component?.selector ?? null;
  if (componentSelector) {
    console.log(chalk.cyan(`Componente: ${componentSelector}\n`));
  }

  const browser = await chromium.launch({ headless: !options.headed });
  const results = { config, timestamp: new Date().toISOString(), pages: [], componentSelector };

  for (const pagePath of config.pages) {
    const url = `${config.baseUrl}${pagePath}`;
    console.log(chalk.bold(`\n→ ${url}`));

    const pageResult = { url, path: pagePath };
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // Pre-navigation setup (order matters)
    const gaCollector = has('ga')
      ? await setupGACollection(page, config.ga, config.rum)
      : null;
    const bundleCollector = has('bundle') ? setupBundleCollection(page) : null;
    if (has('vitals')) await setupVitalsCollection(page);

    await navigateTo(page, url);

    // Scroll the full page height step-by-step to reveal lazy-loaded sections.
    // This is required for accurate CLS: lazy sections without reserved dimensions
    // cause layout shifts that only appear when scrolled into view.
    await page.evaluate(async () => {
      const step = Math.floor(window.innerHeight * 0.75);
      const total = document.body.scrollHeight;
      for (let y = step; y <= total + step; y += step) {
        window.scrollTo({ top: y });
        await new Promise(r => setTimeout(r, 200));
      }
      window.scrollTo({ top: 0 });
    });
    await page.mouse.move(400, 400);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    // CLS needs ~5s after last shift to finalize; INP reports after interaction+frame
    await page.waitForTimeout(4000);

    if (has('vitals')) {
      process.stdout.write('  vitals...');
      pageResult.vitals = await collectVitals(page);
      const summary = Object.entries(pageResult.vitals)
        .map(([k, v]) => `${k}:${v.rating === 'good' ? chalk.green(v.rating) : v.rating === 'needs-improvement' ? chalk.yellow('~') : chalk.red('!')}`)
        .join(' ');
      console.log(` ${summary}`);
    }

    if (has('a11y')) {
      process.stdout.write('  a11y...');
      pageResult.a11y = await runA11y(page, null);
      console.log(pageResult.a11y.violations.length === 0
        ? chalk.green(' ✓ sin violaciones')
        : chalk.yellow(` ⚠ ${pageResult.a11y.violations.length} violación(es)`)
      );

      if (componentSelector) {
        process.stdout.write(`  a11y (${componentSelector})...`);
        pageResult.a11yComponent = await runA11y(page, componentSelector);
        console.log(pageResult.a11yComponent.violations.length === 0
          ? chalk.green(' ✓')
          : chalk.yellow(` ⚠ ${pageResult.a11yComponent.violations.length}`)
        );
      }
    }

    if (componentSelector) {
      process.stdout.write(`  componente (${componentSelector})...`);
      pageResult.component = await auditComponent(page, componentSelector);
      console.log(pageResult.component.exists ? chalk.green(' ✓') : chalk.red(' ✗ no encontrado'));
    }

    if (has('ga') && gaCollector) {
      if (config.interactions?.length) {
        // Route handlers run in reverse registration order (last registered wins
        // for matching URLs). blockExternalNavigation must go first so the more
        // specific mockRoutes patterns get checked first and short-circuit before
        // falling through to its catch-all '**' continue().
        await blockExternalNavigation(page, pagePath);
        if (config.mockRoutes?.length) await mockRoutes(page, config.mockRoutes);
        process.stdout.write('  interactions...');
        pageResult.interactions = await runInteractions(page, config.interactions);
        const failed = pageResult.interactions.filter(i => !i.ok).length;
        console.log(failed === 0
          ? chalk.green(' ✓ todas OK')
          : chalk.yellow(` ⚠ ${failed} fallida(s)`)
        );
      }
      pageResult.ga = await collectGA(page, gaCollector);
    }

    if (has('bundle') && bundleCollector) {
      pageResult.bundle = collectBundle(bundleCollector);
      console.log(`  bundle: ${chalk.bold(pageResult.bundle.totalKB + 'KB')} JS (${pageResult.bundle.scriptCount} scripts)`);
    }

    await context.close();

    if (has('responsive')) {
      process.stdout.write('  responsive...');
      pageResult.responsive = await runResponsive(browser, url, config.breakpoints, outDir, pagePath, null);
      console.log(chalk.green(' ✓'));

      if (componentSelector) {
        process.stdout.write(`  responsive (${componentSelector})...`);
        pageResult.responsiveComponent = await runResponsive(browser, url, config.breakpoints, outDir, pagePath, componentSelector);
        console.log(chalk.green(' ✓'));
      }
    }

    if (has('lighthouse')) {
      const formFactor = config.lighthouse?.formFactor ?? 'mobile';
      process.stdout.write(`  lighthouse (${formFactor})...`);
      pageResult.lighthouse = await runLighthouse(url, { formFactor });
      const { score, metrics } = pageResult.lighthouse;
      const scoreColor = score >= 90 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
      console.log(` score:${scoreColor(score)} LCP:${metrics.LCP?.value ?? '?'}ms TBT:${metrics.TBT?.value ?? '?'}ms`);
    }

    results.pages.push(pageResult);
  }

  if (has('cache') && config.cache?.endpoints?.length) {
    process.stdout.write('\ncache BFF...');
    results.cache = await runCacheCheck(config.baseUrl, config.cache.endpoints);
    const ok = results.cache.every(c => c.ok);
    console.log(ok ? chalk.green(' ✓') : chalk.yellow(' ⚠ algunos endpoints sin 304'));
  }

  if (has('fallback') && config.bff?.fallbackTest && config.bff?.endpoints?.length) {
    process.stdout.write('fallback...');
    results.fallback = await runFallback(browser, config, outDir);
    const ok = results.fallback.every(f => f.ok);
    console.log(ok ? chalk.green(' ✓') : chalk.red(' ✗ fallback sin contenido'));
  }

  await browser.close();

  // Buscar el run anterior ANTES de guardar el actual — si no, se compara contra sí mismo.
  if (options.compareLast) {
    const prev = getLastRun(config.name, options.compareLast === true ? config.env : options.compareLast);
    results.baseline = compareWithRun(results, prev);
    if (results.baseline.error) {
      console.log(chalk.yellow(`\n⚠ ${results.baseline.error}`));
    } else {
      console.log(chalk.gray(`\nComparando contra run: ${results.baseline.previousId} [${results.baseline.previousEnv}]`));
    }
  }

  // Siempre guardamos en el historial
  appendRun(results);

  const { general, component: componentReport } = generateReport(results, outDir);
  const { general: mdGeneral, component: mdComponent } = generateMarkdownReport(results, outDir, {
    ticket: options.ticket,
    configPath: options.config,
  });

  console.log(chalk.bold(`\n✓ Reporte: ${general}`));
  if (componentReport) console.log(chalk.cyan(`  Componente: ${componentReport}`));
  console.log(chalk.gray(`  Markdown: ${mdGeneral}`));
  if (mdComponent) console.log(chalk.gray(`  Markdown componente: ${mdComponent}`));
  console.log();
}
