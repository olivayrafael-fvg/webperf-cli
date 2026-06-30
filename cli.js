#!/usr/bin/env node

import { Command } from 'commander';
import { run } from './src/runner.js';
import { printHistory, DEFAULT_OUT_DIR } from './src/history.js';
import { loadConfig, ConfigError, printConfigErrorAndExit } from './src/config.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

if (existsSync('.env')) process.loadEnvFile('.env');

const DEFAULT_OUT = process.env.WEBPERF_OUT_DIR || DEFAULT_OUT_DIR;

const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'package.json');
const { version } = JSON.parse(readFileSync(pkgPath, 'utf-8'));

const program = new Command();

program
  .name('webperf')
  .description('Auditoría de performance y calidad para apps web')
  .version(version);

program
  .command('run')
  .description('Ejecuta auditoría de performance')
  .requiredOption('-c, --config <path>', 'Ruta al archivo de configuración')
  .option('-o, --out <dir>', 'Directorio de salida', DEFAULT_OUT)
  .option('--only <modules>', 'Módulos a ejecutar: vitals,a11y,ga,responsive,bundle,cache,fallback,lighthouse')
  .option(
    '--compare-last [env]',
    'Compara contra el último run. Sin valor usa el mismo entorno del config; o pasá un env específico: --compare-last qa'
  )
  .option('--component <selector>', 'Scoping a un componente específico. Ej: "#footer", ".newsletter", "[data-testid=footer]"')
  .option('--ticket <id>', 'ID de ticket a incluir en el reporte Markdown (ej. TICKET-123)')
  .option('--headed', 'Ejecutar browser en modo visible')
  .action(run);

program
  .command('history')
  .description('Muestra el historial de runs para un proyecto')
  .requiredOption('-c, --config <path>', 'Ruta al archivo de configuración')
  .option('-o, --out <dir>', 'Directorio donde se guardó el historial', DEFAULT_OUT)
  .option('--env <env>', 'Filtrar por entorno (local, qa, staging)')
  .option('--limit <n>', 'Cantidad de runs a mostrar', '10')
  .action(options => {
    const configPath = path.resolve(options.config);
    let config;
    try {
      config = loadConfig(configPath);
    } catch (err) {
      if (err instanceof ConfigError) return printConfigErrorAndExit(err, configPath);
      throw err;
    }
    printHistory(config.name, { env: options.env, limit: parseInt(options.limit, 10), baseDir: options.out });
  });

program.parse();
