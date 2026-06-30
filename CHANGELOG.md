# Changelog

## [0.2.0] - 2026-06-30

### Added
- Validación manual de configuración al inicio de los comandos `run` e `history`.
- Validación de módulos permitidos en `--only`.
- Tests nativos con `node:test` para la validación de configuración (`test/config.test.js`).
- Script `lint` mínimo para chequeo de sintaxis sin dependencias externas (`scripts/check-syntax.js`).
- CI básico con GitHub Actions para ejecutar instalación limpia, lint y tests.
- Lighthouse ahora reporta los 4 scores de categoría: Performance, Accessibility, Best Practices y SEO.

### Changed
- Se unificó el versionado del CLI usando `package.json` como fuente única de verdad.
- Se declaró `engines.node` con la versión mínima soportada (`>=20.12.0`, requerida por `process.loadEnvFile`).
- Se corrigió el README para reflejar el requisito real de Node.
- Los reportes ahora se guardan en un directorio único por ejecución (`YYYY-MM-DD/<project>/<HH-mm-ss>/`) para evitar sobrescrituras entre runs del mismo día.
- La tarjeta de resumen "Lighthouse score" se renombró a "Lighthouse Performance" para no confundirse con un promedio de las 4 categorías (sigue siendo el promedio de Performance únicamente).

### Fixed
- Se eliminó la versión hardcodeada (`1.0.0`) del CLI; `webperf --version` ahora lee de `package.json`.
- Se sincronizó `package-lock.json` con la versión y `engines` de `package.json`.
- En `report.md`, un score de Lighthouse no disponible (camino de compatibilidad con reportes generados antes de esta versión) ya no se muestra como ❌ reprobado — se muestra como sin datos.
