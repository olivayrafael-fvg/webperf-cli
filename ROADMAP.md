# Roadmap — webperf-cli

## Visión del producto

`webperf-cli` no inventa nuevas formas de medir performance, accesibilidad o calidad — las herramientas para eso ya existen (Lighthouse, axe-core, web-vitals, DevTools, etc.). Lo que hace es **orquestar esas herramientas en un solo flujo automatizado** y devolver el resultado en un informe único, legible y listo para pegar en una PR o un ticket.

El problema que resuelve es el trabajo manual que hoy se repite en cada auditoría: abrir el browser, navegar página por página, sacar capturas a mano en cada breakpoint, entrar a dos o tres web-tools distintas para sacar cada métrica, y después armar a mano un resumen para justificar el hallazgo. `webperf-cli` automatiza esa secuencia completa de punta a punta con un solo comando.

El criterio de éxito no es "cuántas métricas mide", sino **cuánto trabajo manual repetitivo le ahorra a quien hace la auditoría** — y cuántas veces el informe resultante se usa tal cual, sin tener que editarlo o completarlo a mano.

## Diferencial de la herramienta

- **Un comando reemplaza una rutina manual de varios pasos.** Conectividad, navegación, scroll, capturas en cada breakpoint, inyección de axe-core, captura de eventos de GA/RUM y, opcionalmente, Lighthouse — todo en un solo `run`, sin tocar el browser a mano.
- **Reporte Markdown como producto, no como subproducto.** Está pensado para pegarse directo en una PR o un ticket sin edición manual (resumen, tabla de hallazgos, sugerencias, cómo reproducir) — reemplaza el resumen que hoy alguien escribe a mano después de juntar datos de varias fuentes.
- **Auditoría por componente (`--component`)**, no solo por página completa: posición (above/below fold), CLS aislado, heurística de SSR, a11y y responsive acotados a un selector, sin tener que aislar el componente a mano en cada herramienta.
- **Comparación contra runs anteriores** (`--compare-last`) automática, con historial acumulativo por proyecto/ambiente — evita el "antes/después" armado a mano comparando dos capturas de pantalla.
- **Verificación de resiliencia del BFF/CMS** (`fallback`, `cache`) — un chequeo que hoy se hace manualmente bloqueando requests desde DevTools, automatizado en el mismo flujo.
- **Cero infraestructura**: corre local, no requiere backend propio, no requiere cuenta en un SaaS — es una capa de automatización sobre herramientas ya instaladas, no un servicio nuevo que mantener.

## Principios de diseño

1. **Orquestar, no reinventar.** Si una herramienta ya resuelve bien una medición (Lighthouse, axe-core, web-vitals), se integra y se usa — no se reimplementa su lógica.
2. **Automatizar el paso manual, siempre.** Cualquier feature nueva debe eliminar una tarea repetitiva concreta (capturar, comparar, entrar a una web-tool, redactar un resumen), no agregar una métrica por agregarla.
3. **Evidencia reproducible por encima de cobertura exhaustiva.** Preferimos menos métricas pero confiables, a más métricas con heurísticas frágiles sin documentar.
4. **El componente es ciudadano de primera clase.** Cualquier feature nueva de auditoría de página debería poder acotarse a un selector cuando tenga sentido.
5. **El Markdown es el contrato de salida.** Cambios en su estructura son breaking changes de producto (lo consume gente pegándolo en tickets), no solo de código.
6. **Cambios incrementales y reversibles.** Nada de big-bang rewrites; cada release deja la herramienta usable de punta a punta.
7. **Sin dependencias nuevas sin justificación explícita.** Cada dependencia es superficie de mantenimiento para un equipo chico.
8. **Fallar con mensaje claro, no con stack trace.** Un dev corriendo esto en CI o en su máquina debe entender qué pasó sin leer el código fuente.

## Estado actual observado

Relevamiento hecho sobre el código real en `release/0.1` (commit `7890d8b`):

- **CLI**: `cli.js` con dos comandos (`run`, `history`) vía Commander. Carga `.env` con `process.loadEnvFile`.
- **Runner** (`src/runner.js`): orquesta navegación Playwright, ejecución de módulos por página, módulos globales (`cache`, `fallback`), historial y generación de reportes.
- **Módulos**: `vitals`, `a11y`, `responsive`, `bundle`, `cache`, `ga` (+ `interactions` como soporte de `ga`), `fallback`, `lighthouse`, `component`, más `network` (connectivity check) y `history`.
- **Reporting**: `reporter.js` (HTML con CSS inline) y `markdown.js` (el artefacto pensado para pegar en PRs/tickets). Ambos duplican thresholds y formato de varias métricas de forma independiente.
- **Persistencia**: reportes en `$WEBPERF_OUT_DIR/<fecha>/<proyecto>/`, historial acumulativo en `.history/<proyecto>.jsonl`.
- **Configuración**: archivos JSON en `configs/*.json` (gitignored salvo `.example.json`), sin validación de esquema — se parsean y se usan directo.
- **Sin tests, sin lint, sin CI, sin `engines` en `package.json`.**
- **Tres números de versión distintos coexistiendo**: `package.json` declara `0.1.0`, `package-lock.json` quedó en `1.0.0`, y `cli.js` tiene hardcodeado `.version('1.0.0')` en el propio Commander — ninguno de los tres es la fuente de verdad real.
- Repo en GitHub (`olivayrafael-fvg/webperf-cli`), rama actual `release/0.1`, sin releases/tags todavía.

## Riesgos técnicos actuales

| # | Riesgo | Impacto | Detalle |
|---|---|---|---|
| 1 | Versionado inconsistente (`package.json` 0.1.0 / `package-lock.json` 1.0.0 / CLI hardcodeada 1.0.0) | Alto | `webperf --version` no es confiable. No hay forma de saber qué versión corrió un reporte viejo. |
| 2 | `engines` no declarado + README dice Node 18+ | Alto | `process.loadEnvFile` no existe en Node 18 (requiere ≥20.12.0). Un dev con Node 18 falla en el primer `node cli.js`. |
| 3 | Sin validación de config | Medio-Alto | Un config mal formado (falta `pages`, `baseUrl` mal tipado) falla en lo profundo del runner con errores poco claros, no en el borde. |
| 4 | Sin scripts de test/lint/smoke | Alto | No hay forma objetiva de saber si un cambio rompió un módulo antes de mergear. |
| 5 | Sin CI | Alto | Nada impide mergear código roto; depende 100% de que alguien corra manualmente. |
| 6 | Reportes se sobreescriben en el mismo día/proyecto | Medio | Corridas múltiples el mismo día pierden el HTML/MD/screenshots anteriores (el historial JSONL sí persiste, pero el reporte visual no). Afecta directamente el caso de uso "antes/después" si se hace en el mismo día. |
| 7 | INP medido sin interacción real garantizada | Medio | El runner solo simula `Tab`+`Tab`+mouse move; sin `interactions` configuradas, el INP capturado puede no representar el patrón de uso real. |
| 8 | Heurística de SSR en `component.js` | Medio-Alto | Solo verifica `innerHTML.trim().length > 0` en el momento de la medición. Un componente client-rendered que ya pintó para entonces se reporta como SSR. Esto compromete la credibilidad del módulo diferencial del producto si no se documenta o mejora. |
| 9 | Thresholds y formato duplicados en 3 archivos (`reporter.js`, `markdown.js`, `lighthouse.js`) | Medio | Riesgo de drift: cambiar un umbral en un lugar y olvidar el resto. No es urgente pero crece con cada módulo nuevo. |
| 10 | `fallback` solo testea contra `config.pages[0]` | Bajo-Medio | Si el fallback se rompe en una página distinta a la primera, no se detecta. |
| 11 | `checkConnectivity` usa `HEAD` con 5s timeout | Bajo | Algunos servidores responden 405 a HEAD o tardan más de 5s en frío; puede dar falso negativo de conectividad. |
| 12 | Sin tags/releases en git | Bajo | No hay forma de mapear un reporte viejo a una versión exacta del código que lo generó. |

Estos riesgos **no se resuelven en esta iteración** (es documental), pero quedan como input directo para v0.2.0.

---

## Roadmap por releases

### v0.2.0 — Hardening técnico

**Objetivo:** que la herramienta sea confiable y verificable antes de sumarle features nuevas. Cero superficie nueva de producto.

**Alcance:**
- Unificar versionado: una sola fuente de verdad (`package.json`), CLI la lee dinámicamente (no hardcodeada).
- Declarar `engines.node` correcto en `package.json` (`>=20.12.0`, versión mínima real que soporta `process.loadEnvFile`) y corregir el README.
- Validación de config en el borde (al inicio de `run`/`history`): campos requeridos (`name`, `baseUrl`, `env`, `pages`), con mensaje de error claro y accionable, sin librería nueva (validación manual simple).
- Scripts mínimos en `package.json`: `lint`, `test` (aunque sea smoke test mínimo), `smoke` (correr `run` contra un config de prueba local/mock).
- Resolver el overwrite de reportes en el mismo día (sufijo de hora o run-id en el path de salida) — discutir formato sin romper `history`/`compare-last`, que dependen de la estructura por fecha.
- CI básico (GitHub Actions): lint + smoke test en cada PR.

**Fuera de alcance:**
- Nuevas métricas o módulos.
- Cambios en el formato del reporte Markdown/HTML.
- Mejorar la heurística de SSR (es v0.3.0, ver abajo) — en v0.2.0 solo se documenta como limitación conocida en el propio output del reporte.

**Criterios de aceptación:**
- `webperf --version` devuelve exactamente el valor de `package.json`, y `package-lock.json` está sincronizado (`npm install` limpio sin diffs).
- Con Node en la versión declarada en `engines`, la instalación y un run de ejemplo funcionan de punta a punta.
- Un config inválido (sin `pages`, por ejemplo) falla con un mensaje específico antes de abrir el browser.
- `npm run lint` y `npm run test` existen, corren y pasan en CI.
- Dos runs el mismo día para el mismo proyecto no se pisan los reportes visuales.

**Riesgos:**
- Cambiar el path de salida de reportes puede romper integraciones existentes (scripts, accesos directos guardados por QA). Mitigar documentando el cambio como el primer breaking change formal del proyecto.
- Validación de config muy estricta puede romper configs reales ya en uso si hay campos que hoy son opcionales de facto pero no están documentados como tales.

**Tareas sugeridas:**
- [ ] CLI lee versión desde `package.json` (`createRequire` + `package.json`).
- [ ] Sincronizar `package.json`/`package-lock.json` (`npm install` limpio) y fijar `engines.node`.
- [ ] Actualizar README con el requisito real de Node.
- [ ] Función `validateConfig(config)` en un módulo nuevo o en `runner.js`, llamada antes de `mkdirSync`.
- [ ] Decidir y documentar el nuevo esquema de carpeta de salida (timestamp u orden de run dentro del día).
- [ ] Agregar `.github/workflows/ci.yml` con lint + smoke.
- [ ] Smoke test: correr `--only vitals` contra una URL pública estable o un servidor estático de fixture.

---

### v0.3.0 — Producto QA usable

**Objetivo:** que un QA o dev sin contexto del código pueda usar la herramienta con confianza y entender sus límites.

**Alcance:**
- Documentar (y si es trivial, mejorar) la heurística de SSR de `component.js`: como mínimo, dejar explícito en el reporte que es una heurística y bajo qué condiciones puede dar falso positivo/negativo.
- Mejorar mensajes de error end-to-end (selector no encontrado, timeout de navegación, BFF no disponible) para que sean accionables sin mirar logs de Playwright.
- Centralizar los thresholds de métricas (vitals/lighthouse) en un único módulo compartido, consumido por `reporter.js`, `markdown.js` y `lighthouse.js` — elimina el riesgo #9 de la tabla anterior.
- Revisar y documentar el flujo de `--component` end-to-end como feature de primer nivel en el README (ya existe documentación, pero falta cruzarla con las limitaciones reales).
- Opcional: flag `--quiet`/`--verbose` para controlar el nivel de logging en CI vs uso local.

**Fuera de alcance:**
- Integración con CI de otros repos (eso es v0.4.0).
- Nuevos módulos de auditoría.

**Criterios de aceptación:**
- El reporte Markdown incluye una nota explícita sobre la limitación de la detección de SSR.
- Los tres archivos que hoy duplican thresholds pasan a importar de una sola fuente; ningún número mágico repetido.
- Un QA puede seguir el README de punta a punta sin pedir ayuda a un dev, incluyendo interpretar un error común (selector no encontrado, VPN, config inválido).

**Riesgos:**
- Centralizar thresholds toca tres archivos a la vez — es el primer refactor real del proyecto. Hacerlo sin cambiar ningún valor de threshold ni el output visual (test de regresión manual: comparar HTML/MD antes/después byte a byte donde sea posible).

**Tareas sugeridas:**
- [ ] Módulo `src/thresholds.js` con `VITALS_THRESHOLDS` y `LH_THRESHOLDS` únicos.
- [ ] Nota de limitación de SSR en `markdown.js` (sección Componente) y `reporter.js`.
- [ ] Catálogo de errores comunes en el README ("Troubleshooting").
- [ ] Flag `--quiet`/`--verbose` opcional (solo si no complica el `runner.js` actual).

---

### v0.4.0 — CI / PR integration

**Objetivo:** que la herramienta se pueda invocar desde el CI de los proyectos auditados, no solo a mano.

**Alcance:**
- Modo de salida no interactivo / exit code significativo: `run` debe devolver código de salida ≠ 0 si hay hallazgos críticos (configurable qué cuenta como crítico — a11y serio/crítico, fallback roto, etc.).
- Soporte para correr headless en entornos CI (validar que `playwright install --with-deps` funciona en GitHub Actions o el runner de CI que use el equipo).
- Documentar un ejemplo de workflow de GitHub Actions que corra `webperf run` contra un preview/staging y publique el `report.md` como comentario de PR (puede ser un ejemplo en docs, no necesariamente una Action propia todavía).
- Definir qué config usar en CI (sin secretos en el repo, vía variables de entorno o un config generado en el job).

**Fuera de alcance:**
- Publicar una GitHub Action reusable propia (podría ser v1.0.0 o posterior).
- Dashboards o agregación histórica entre proyectos.

**Criterios de aceptación:**
- `webperf run` soporta un flag (ej. `--ci` o `--fail-on <nivel>`) que determina el exit code según hallazgos.
- Hay un ejemplo documentado y probado de workflow de GitHub Actions corriendo la CLI contra un ambiente real.
- El proceso no requiere intervención manual (headed mode, prompts) cuando corre en CI.

**Riesgos:**
- Performance en CI runners compartidos puede dar métricas de vitals no representativas (CPU/red distintas a producción) — esto debe documentarse como limitación, no resolverse con throttling artificial todavía.
- Exit codes mal calibrados pueden bloquear PRs por hallazgos menores — necesita validación con un equipo real antes de hacerlo obligatorio en algún pipeline.

**Tareas sugeridas:**
- [ ] Flag `--fail-on <a11y|fallback|none>` con exit code acorde.
- [ ] Probar instalación y ejecución en GitHub Actions (ubuntu-latest) de punta a punta.
- [ ] Documentar ejemplo de workflow en `docs/ci-integration.md` (futuro, no en esta iteración).
- [ ] Definir cómo se inyecta el config en CI sin commitear datos sensibles.

---

### v0.5.0 — Scenarios / flujos reales

**Objetivo:** auditar flujos de usuario completos (no solo páginas sueltas), aprovechando y extendiendo lo que ya hace `interactions.js`.

**Alcance:**
- Generalizar `interactions` (hoy acoplado a disparar eventos de GA) a un concepto de "escenario": secuencia de páginas + interacciones con medición de vitals/a11y en cada paso.
- Permitir definir flujos típicos (ej. "buscar producto → agregar al carrito → checkout step 1") en config, reutilizando `mockRoutes` para no generar efectos reales.
- Reporte por escenario (Markdown) además del reporte por página.

**Fuera de alcance:**
- Grabación automática de flujos (record & replay) — fuera de alcance del producto por ahora.
- Visual regression testing (comparación de screenshots pixel a pixel) — evaluar como propuesta separada, no parte de v0.5.0.

**Criterios de aceptación:**
- Un config puede declarar al menos un escenario multi-paso y el reporte resultante muestra métricas por paso, no solo agregadas.
- Los escenarios reutilizan `interactions`/`mockRoutes` existentes sin duplicar lógica.

**Riesgos:**
- Es el cambio de mayor superficie del roadmap — puede tocar `runner.js` en su estructura central. Debe diseñarse aparte antes de implementar (no se hace en esta iteración).
- Riesgo de explosión de tiempo de ejecución (cada escenario multiplica navegaciones); necesita control de scope (`--only` aplicado a escenarios también).

**Tareas sugeridas:**
- [ ] Diseño de esquema de config para `scenarios` (documento de diseño previo a código).
- [ ] Prototipo aislado antes de tocar `runner.js` en producción.
- [ ] Extensión de `markdown.js`/`reporter.js` para reporte por escenario.

---

### v1.0.0 — Release estable

**Objetivo:** declarar la herramienta lista para ser dependencia del flujo de trabajo estándar de equipos de QA/dev, con garantías mínimas de estabilidad.

**Alcance:**
- Todos los riesgos "Alto" y "Medio-Alto" de la tabla de riesgos actuales, resueltos o explícitamente aceptados y documentados.
- Output del Markdown/HTML estable y versionado (cualquier cambio de estructura futuro es un breaking change documentado en `CHANGELOG.md`).
- Cobertura de smoke test sobre todos los módulos (`vitals`, `a11y`, `responsive`, `bundle`, `cache`, `ga`, `fallback`, `lighthouse`, `component`).
- CI obligatorio en el repo (no opcional) para mergear a `main`.
- Documentación completa: README, `ROADMAP.md`, `WORKING_AGREEMENT.md`, `docs/architecture.md`, `docs/release-strategy.md`, `CHANGELOG.md`.

**Fuera de alcance:**
- Cualquier feature de v0.5.0 en adelante no esté ya estable.

**Criterios de aceptación:**
- Un proyecto nuevo del monorepo puede adoptar la CLI siguiendo solo el README, sin hablar con el autor original.
- `npm test`/`npm run lint`/`npm run smoke` pasan en CI en cada PR a `main`.
- Existe al menos un release tag (`v1.0.0`) con changelog.

**Riesgos:**
- Definir "estable" sin caer en perfeccionismo indefinido — usar la tabla de riesgos de este documento como checklist de salida, no como lista abierta.

**Tareas sugeridas:**
- [ ] Checklist de release formal (ver `docs/release-strategy.md`).
- [ ] `CHANGELOG.md` retroactivo desde v0.2.0.
- [ ] Tag `v1.0.0` en git una vez cumplidos los criterios.
