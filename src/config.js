import { readFileSync } from 'fs';
import chalk from 'chalk';

export const VALID_ENVS = ['local', 'dev', 'qa', 'staging', 'prod'];
export const VALID_MODULES = ['vitals', 'a11y', 'ga', 'responsive', 'bundle', 'cache', 'fallback', 'lighthouse'];
const VALID_INTERACTION_ACTIONS = ['click', 'fill', 'press'];

export class ConfigError extends Error {
  constructor(errors) {
    super(errors.join(' / '));
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isStringArrayStartingWith(value, prefix) {
  return Array.isArray(value) && value.every(v => typeof v === 'string' && v.startsWith(prefix));
}

// Validación manual deliberada (sin Zod/AJV): el config tiene pocos campos y
// la regla del proyecto es no sumar dependencias sin justificarlo.
export function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['El config debe ser un objeto JSON.'];
  }

  const errors = [];

  if (!isNonEmptyString(config.name)) {
    errors.push('"name" es requerido y debe ser un string no vacío.');
  }

  if (!isNonEmptyString(config.baseUrl)) {
    errors.push('"baseUrl" es requerido y debe ser un string no vacío.');
  } else if (!isHttpUrl(config.baseUrl)) {
    errors.push(`"baseUrl" debe ser una URL válida con protocolo http: o https: (recibido: "${config.baseUrl}").`);
  }

  if (!isNonEmptyString(config.env)) {
    errors.push('"env" es requerido y debe ser un string no vacío.');
  } else if (!VALID_ENVS.includes(config.env)) {
    errors.push(`"env" debe ser uno de: ${VALID_ENVS.join(', ')} (recibido: "${config.env}").`);
  }

  if (!Array.isArray(config.pages) || config.pages.length === 0) {
    errors.push('"pages" es requerido y debe ser un array no vacío.');
  } else {
    config.pages.forEach((p, i) => {
      if (typeof p !== 'string' || !p.startsWith('/')) {
        errors.push(`"pages[${i}]" debe ser un string que empiece con "/" (recibido: ${JSON.stringify(p)}).`);
      }
    });
  }

  if (config.breakpoints !== undefined) {
    if (typeof config.breakpoints !== 'object' || config.breakpoints === null || Array.isArray(config.breakpoints)) {
      errors.push('"breakpoints" debe ser un objeto.');
    } else {
      for (const [name, value] of Object.entries(config.breakpoints)) {
        if (!Number.isInteger(value) || value <= 0) {
          errors.push(`"breakpoints.${name}" debe ser un número entero positivo (recibido: ${JSON.stringify(value)}).`);
        }
      }
    }
  }

  if (config.ga?.watchEvents !== undefined && !isStringArrayStartingWith(config.ga.watchEvents, '')) {
    errors.push('"ga.watchEvents" debe ser un array de strings.');
  }

  if (config.bff?.endpoints !== undefined && !isStringArrayStartingWith(config.bff.endpoints, '/')) {
    errors.push('"bff.endpoints" debe ser un array de strings que empiecen con "/".');
  }

  if (config.cache?.endpoints !== undefined && !isStringArrayStartingWith(config.cache.endpoints, '/')) {
    errors.push('"cache.endpoints" debe ser un array de strings que empiecen con "/".');
  }

  if (config.component?.selector !== undefined && !isNonEmptyString(config.component.selector)) {
    errors.push('"component.selector" debe ser un string no vacío.');
  }

  if (config.interactions !== undefined) {
    if (!Array.isArray(config.interactions)) {
      errors.push('"interactions" debe ser un array.');
    } else {
      config.interactions.forEach((step, i) => {
        if (!step || typeof step !== 'object') {
          errors.push(`"interactions[${i}]" debe ser un objeto.`);
          return;
        }
        if (!isNonEmptyString(step.selector)) {
          errors.push(`"interactions[${i}].selector" es requerido y debe ser un string no vacío.`);
        }
        if (!VALID_INTERACTION_ACTIONS.includes(step.action)) {
          errors.push(`"interactions[${i}].action" debe ser uno de: ${VALID_INTERACTION_ACTIONS.join(', ')} (recibido: ${JSON.stringify(step.action)}).`);
        }
        if (step.value !== undefined && typeof step.value !== 'string') {
          errors.push(`"interactions[${i}].value" debe ser un string.`);
        }
      });
    }
  }

  if (config.mockRoutes !== undefined) {
    if (!Array.isArray(config.mockRoutes)) {
      errors.push('"mockRoutes" debe ser un array.');
    } else {
      config.mockRoutes.forEach((mock, i) => {
        if (!mock || typeof mock !== 'object') {
          errors.push(`"mockRoutes[${i}]" debe ser un objeto.`);
          return;
        }
        if (!isNonEmptyString(mock.url)) {
          errors.push(`"mockRoutes[${i}].url" es requerido y debe ser un string no vacío.`);
        }
        if (mock.status !== undefined && typeof mock.status !== 'number') {
          errors.push(`"mockRoutes[${i}].status" debe ser un número.`);
        }
        if (mock.body !== undefined && typeof mock.body !== 'string') {
          errors.push(`"mockRoutes[${i}].body" debe ser un string.`);
        }
        if (mock.contentType !== undefined && typeof mock.contentType !== 'string') {
          errors.push(`"mockRoutes[${i}].contentType" debe ser un string.`);
        }
      });
    }
  }

  return errors;
}

export function loadConfig(configPath) {
  let raw;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch (err) {
    throw new ConfigError([`No se pudo leer el archivo: ${err.message}`]);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError([`El archivo no es JSON válido: ${err.message}`]);
  }

  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new ConfigError(errors);
  }

  return config;
}

export function validateOnlyOption(onlyString) {
  if (!onlyString) return [];
  const modules = onlyString.split(',').map(m => m.trim()).filter(Boolean);
  return modules
    .filter(m => !VALID_MODULES.includes(m))
    .map(m => `Módulo desconocido en --only: "${m}". Módulos válidos: ${VALID_MODULES.join(', ')}`);
}

export function printConfigErrorAndExit(err, configPath) {
  console.error(chalk.red(`Config inválido en ${configPath}:`));
  for (const e of err.errors) console.error(chalk.red(`- ${e}`));
  process.exit(1);
}

export function printOptionErrorsAndExit(errors) {
  console.error(chalk.red('Opciones inválidas:'));
  for (const e of errors) console.error(chalk.red(`- ${e}`));
  process.exit(1);
}
