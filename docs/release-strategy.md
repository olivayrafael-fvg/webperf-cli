# Estrategia de release — webperf-cli

## Versionado esperado

SemVer real (`MAJOR.MINOR.PATCH`), con `package.json` como única fuente de verdad. El CLI debe leer la versión desde ahí (no hardcodearla — ver riesgo de versionado en `ROADMAP.md`).

- **MAJOR**: rompe compatibilidad. Ejemplos concretos para este proyecto: cambia la estructura del config esperado, cambia la estructura del reporte HTML/MD/JSON, cambia/elimina un flag del CLI, cambia el esquema de carpetas de salida o de `.history/*.jsonl`.
- **MINOR**: agrega capacidad sin romper lo existente. Ejemplos: nuevo módulo de auditoría, nuevo flag opcional, nuevo campo opcional en el config.
- **PATCH**: corrige comportamiento sin cambiar el contrato. Ejemplos: fix de un selector, ajuste de timeout, corrección de un cálculo que ya debía dar otro resultado.

## Qué significa una release `0.x`

Mientras el proyecto esté en `0.x`:

- Se acepta romper compatibilidad de forma más laxa que en `1.x`, pero **igual debe declararse** en el `CHANGELOG.md` y en el resumen del cambio (ver `WORKING_AGREEMENT.md`).
- El objetivo de cada `0.x` es acercarse a una herramienta usable por cualquier proyecto del monorepo sin intervención del autor original — no es "versión de prueba sin compromiso".
- No se taguea cada commit; se taguea al cierre de cada release del roadmap (`v0.2.0`, `v0.3.0`, etc.) una vez cumplidos sus criterios de aceptación.

## Qué condiciones mínimas debe cumplir una release

Antes de tagear cualquier versión (incluso dentro de `0.x`):

1. Los criterios de aceptación de esa release, definidos en `ROADMAP.md`, están cumplidos.
2. `npm run lint` y `npm run test` (cuando existan, desde v0.2.0) pasan en CI.
3. El README refleja el comportamiento real del CLI a esa versión (flags, requisitos de Node, ejemplos).
4. Si hubo breaking change, está documentado en `CHANGELOG.md` con la migración necesaria (qué tiene que cambiar quien ya usaba la herramienta).
5. La versión en `package.json` fue incrementada acorde a SemVer y `package-lock.json` está sincronizado.

## Qué implica llegar a `1.0`

`1.0.0` significa: la herramienta es una dependencia confiable del flujo de trabajo de cualquier equipo que la adopte, no un script que mantiene una sola persona.

Condiciones específicas (detalladas también en la sección v1.0.0 de `ROADMAP.md`):

- Todos los riesgos "Alto" y "Medio-Alto" relevados en `ROADMAP.md` están resueltos o explícitamente aceptados por escrito (con razón documentada de por qué no se resuelven).
- El contrato de salida (Markdown/HTML/JSON) es estable: cualquier cambio futuro de estructura es un `MAJOR` con changelog explícito.
- Hay smoke test de cada módulo (`vitals`, `a11y`, `responsive`, `bundle`, `cache`, `ga`, `fallback`, `lighthouse`, `component`).
- CI es obligatorio para mergear a `main`, no opcional.
- Existe documentación completa y vigente: README, `ROADMAP.md`, `WORKING_AGREEMENT.md`, `docs/architecture.md`, este documento, y `CHANGELOG.md`.
- Después de `1.0`, cualquier breaking change requiere una discusión explícita antes de implementarse — deja de ser una decisión unilateral de quien hace el cambio.

## Cómo nombrar branches

- `release/x.y.z` — trabajo de una release completa del roadmap, siempre con los 3 valores de la versión (ej. `release/0.2.0`). Así un fix puntual sobre una release ya cerrada tiene dónde vivir sin ambigüedad (`release/0.2.1`).
- `feature/<descripcion-corta>` — una tarea puntual dentro de una release (ej. `feature/config-validation`).
- `fix/<descripcion-corta>` — corrección puntual sin cambio de alcance (ej. `fix/cache-head-timeout`).

> `release/0.1` (sin tercer valor) es la rama actual del repo y queda como excepción histórica — no se renombra retroactivamente. A partir de la próxima release se usa el formato de 3 valores.

Evitar branches genéricos (`fix`, `wip`, `cambios`) — el nombre debe identificar el problema sin tener que abrir el PR.

## Cómo redactar PRs

Cada PR debe incluir, como mínimo, lo que pide el `WORKING_AGREEMENT.md` para cualquier cambio:

```markdown
## Resumen
Qué se hizo y por qué (2-4 líneas).

## Archivos modificados
- src/...
- docs/...

## Cómo probar
Comandos exactos. Si no hay tests automatizados todavía, pasos manuales reproducibles.

## Riesgos
Qué podría romperse y por qué. "Ninguno detectado" es una respuesta válida si es honesta.

## Próximos pasos
Qué queda pendiente, referenciando la release del ROADMAP.md si aplica.
```

El título del PR debe usar el mismo formato de commit del proyecto: `tipo(scope): descripción` (ej. `fix(component): documentar limitación de heurística SSR`).

## Checklist de release

Antes de tagear una versión y actualizar `CHANGELOG.md`:

- [ ] Todos los criterios de aceptación de la release (según `ROADMAP.md`) están cumplidos.
- [ ] `npm install` corre limpio (sin diffs en `package-lock.json`).
- [ ] `npm run lint` pasa (desde que exista, v0.2.0+).
- [ ] `npm run test` / `npm run smoke` pasan (desde que exista, v0.2.0+).
- [ ] CI en verde en la rama de release.
- [ ] README actualizado si cambió algún flag, módulo, requisito de Node o ejemplo de uso.
- [ ] `CHANGELOG.md` actualizado con la nueva versión y, si aplica, instrucciones de migración.
- [ ] Versión en `package.json` incrementada según SemVer; CLI refleja la misma versión (lectura dinámica, no hardcodeada).
- [ ] Si hubo breaking change: comunicado explícitamente a los equipos que ya usan la CLI, no solo documentado en el repo.
- [ ] Tag de git creado (`vX.Y.Z`) sobre el commit final de la release.
