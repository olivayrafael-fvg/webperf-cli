import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateConfig, loadConfig, validateOnlyOption, ConfigError } from '../src/config.js';

const VALID_CONFIG = {
  name: 'demo',
  baseUrl: 'http://localhost:3000',
  env: 'local',
  pages: ['/'],
};

function writeTempConfig(t, content) {
  const dir = mkdtempSync(path.join(tmpdir(), 'webperf-config-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.json');
  writeFileSync(file, content, 'utf-8');
  return file;
}

describe('validateConfig — config válido', () => {
  test('un config mínimo válido no produce errores', () => {
    assert.deepEqual(validateConfig(VALID_CONFIG), []);
  });
});

describe('validateConfig — campos requeridos', () => {
  test('falla si falta "name"', () => {
    const { name, ...rest } = VALID_CONFIG;
    assert.ok(validateConfig(rest).some(e => e.includes('"name"')));
  });

  test('falla si falta "baseUrl"', () => {
    const { baseUrl, ...rest } = VALID_CONFIG;
    assert.ok(validateConfig(rest).some(e => e.includes('"baseUrl"')));
  });

  test('falla si falta "env"', () => {
    const { env, ...rest } = VALID_CONFIG;
    assert.ok(validateConfig(rest).some(e => e.includes('"env"')));
  });

  test('falla si falta "pages"', () => {
    const { pages, ...rest } = VALID_CONFIG;
    assert.ok(validateConfig(rest).some(e => e.includes('"pages"')));
  });
});

describe('validateConfig — validaciones específicas', () => {
  test('"name" string vacío falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, name: '   ' });
    assert.ok(errors.some(e => e.includes('"name"')));
  });

  test('"baseUrl" sin protocolo falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, baseUrl: 'localhost:3000' });
    assert.ok(errors.some(e => e.includes('"baseUrl"')));
  });

  test('"baseUrl" con protocolo no permitido (ftp) falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, baseUrl: 'ftp://example.com' });
    assert.ok(errors.some(e => e.includes('"baseUrl"')));
  });

  test('"env" desconocido falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, env: 'testing' });
    assert.ok(errors.some(e => e.includes('"env"')));
  });

  test('"pages" como string en vez de array falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, pages: '/' });
    assert.ok(errors.some(e => e.includes('"pages"')));
  });

  test('"pages" array vacío falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, pages: [] });
    assert.ok(errors.some(e => e.includes('"pages"')));
  });

  test('una page sin "/" inicial falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, pages: ['ruta-sin-barra'] });
    assert.ok(errors.some(e => e.includes('pages[0]')));
  });
});

describe('validateConfig — campos opcionales', () => {
  test('"breakpoints" con valor no numérico falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, breakpoints: { desktop: 'grande' } });
    assert.ok(errors.some(e => e.includes('breakpoints.desktop')));
  });

  test('"ga.watchEvents" no array falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, ga: { watchEvents: 'page_view' } });
    assert.ok(errors.some(e => e.includes('ga.watchEvents')));
  });

  test('"bff.endpoints" con endpoint sin "/" falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, bff: { endpoints: ['api/footer'] } });
    assert.ok(errors.some(e => e.includes('bff.endpoints')));
  });

  test('"cache.endpoints" con endpoint sin "/" falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, cache: { endpoints: ['api/footer'] } });
    assert.ok(errors.some(e => e.includes('cache.endpoints')));
  });

  test('"component.selector" vacío falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, component: { selector: '' } });
    assert.ok(errors.some(e => e.includes('component.selector')));
  });

  test('"interactions[].action" inválida falla', () => {
    const errors = validateConfig({
      ...VALID_CONFIG,
      interactions: [{ selector: '#btn', action: 'hover' }],
    });
    assert.ok(errors.some(e => e.includes('interactions[0].action')));
  });

  test('"mockRoutes[].url" faltante falla', () => {
    const errors = validateConfig({ ...VALID_CONFIG, mockRoutes: [{ status: 200 }] });
    assert.ok(errors.some(e => e.includes('mockRoutes[0].url')));
  });
});

describe('loadConfig', () => {
  test('lee y valida un JSON válido desde un archivo', (t) => {
    const file = writeTempConfig(t, JSON.stringify(VALID_CONFIG));
    const config = loadConfig(file);
    assert.equal(config.name, 'demo');
  });

  test('lanza ConfigError si el archivo no es JSON válido', (t) => {
    const file = writeTempConfig(t, '{ invalid json');
    assert.throws(() => loadConfig(file), ConfigError);
  });

  test('lanza ConfigError si el archivo no existe', () => {
    assert.throws(() => loadConfig('/no/existe/webperf-config.json'), ConfigError);
  });

  test('lanza ConfigError con la lista de errores de validateConfig', (t) => {
    const file = writeTempConfig(t, JSON.stringify({ baseUrl: 'localhost:3000' }));
    try {
      loadConfig(file);
      assert.fail('debería haber lanzado ConfigError');
    } catch (err) {
      assert.ok(err instanceof ConfigError);
      assert.ok(err.errors.length > 0);
    }
  });
});

describe('validateOnlyOption', () => {
  test('undefined no falla', () => {
    assert.deepEqual(validateOnlyOption(undefined), []);
  });

  test('string vacío no falla', () => {
    assert.deepEqual(validateOnlyOption(''), []);
  });

  test('módulos válidos no fallan', () => {
    assert.deepEqual(validateOnlyOption('vitals,a11y'), []);
  });

  test('un módulo desconocido falla con mensaje claro', () => {
    const errors = validateOnlyOption('vitals,foo');
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('"foo"'));
  });

  test('acumula errores si hay varios módulos desconocidos', () => {
    const errors = validateOnlyOption('foo,bar');
    assert.equal(errors.length, 2);
    assert.ok(errors.some(e => e.includes('"foo"')));
    assert.ok(errors.some(e => e.includes('"bar"')));
  });
});
