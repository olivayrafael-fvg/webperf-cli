# Changelog

## [0.2.0] - En progreso

### Changed
- Se unificó el versionado del CLI usando `package.json` como fuente única de verdad.
- Se declaró `engines.node` con la versión mínima soportada (`>=20.12.0`, requerida por `process.loadEnvFile`).
- Se corrigió el README para reflejar el requisito real de Node.

### Fixed
- Se eliminó la versión hardcodeada (`1.0.0`) del CLI; `webperf --version` ahora lee de `package.json`.
- Se sincronizó `package-lock.json` con la versión y `engines` de `package.json`.
