#!/usr/bin/env node

import { Command } from 'commander';
import { run } from './src/runner.js';
import { printHistory } from './src/history.js';
import { readFileSync } from 'fs';
import path from 'path';

const program = new Command();

program
  .name('webperf')
  .description('Auditoría de performance y calidad para apps web')
  .version('1.0.0');

program
  .command('run')
  .description('Ejecuta auditoría de performance')
  .requiredOption('-c, --config <path>', 'Ruta al archivo de configuración')
  .option('-o, --out <dir>', 'Directorio de salida', `${process.env.HOME}/webstore-reports`)
  .option('--only <modules>', 'Módulos a ejecutar: vitals,a11y,ga,responsive,bundle,cache,fallback,lighthouse')
  .option(
    '--compare-last [env]',
    'Compara contra el último run. Sin valor usa el mismo entorno del config; o pasá un env específico: --compare-last qa'
  )
  .option('--component <selector>', 'Scoping a un componente específico. Ej: "#footer", ".newsletter", "[data-testid=footer]"')
  .option('--ticket <id>', 'ID de ticket a incluir en el reporte Markdown (ej. WBTD-753)')
  .option('--headed', 'Ejecutar browser en modo visible')
  .action(run);

program
  .command('history')
  .description('Muestra el historial de runs para un proyecto')
  .requiredOption('-c, --config <path>', 'Ruta al archivo de configuración')
  .option('--env <env>', 'Filtrar por entorno (local, qa, staging)')
  .option('--limit <n>', 'Cantidad de runs a mostrar', '10')
  .action(options => {
    const config = JSON.parse(readFileSync(path.resolve(options.config), 'utf-8'));
    printHistory(config.name, { env: options.env, limit: parseInt(options.limit, 10) });
  });

program.parse();
