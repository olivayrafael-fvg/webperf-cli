#!/usr/bin/env node
// Chequeo de sintaxis sin dependencias: corre `node --check` sobre cada .js
// del proyecto. No reemplaza un linter de estilo (eso es tarea de v0.3.0+).
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const IGNORE_DIRS = new Set(['node_modules', '.git', 'configs']);

function collectJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const files = collectJsFiles(ROOT);
let failed = false;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed = true;
    console.error(`✗ ${path.relative(ROOT, file)}`);
    console.error((err.stderr ?? err.message).toString());
  }
}

if (failed) {
  console.error('\nErrores de sintaxis encontrados.');
  process.exit(1);
}

console.log(`✓ ${files.length} archivo(s) sin errores de sintaxis.`);
