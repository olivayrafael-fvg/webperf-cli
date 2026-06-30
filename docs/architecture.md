# Arquitectura — webperf-cli

Estado relevado sobre `release/0.1` (commit `7890d8b`). Este documento describe lo que el código hace hoy, no lo que debería hacer — ver `ROADMAP.md` para eso.

## CLI entrypoint

`cli.js` es el único entrypoint (`bin.webperf` en `package.json`). Responsabilidades:

- Carga `.env` (si existe) con `process.loadEnvFile('.env')` antes de leer cualquier variable de entorno. **Esto requiere Node ≥20.6** — ver riesgo en `ROADMAP.md`.
- Define dos comandos con Commander:
  - `run`: ejecuta la auditoría completa. Delega toda la lógica a `src/runner.js#run`.
  - `history`: lee el config, parsea JSON directo (sin pasar por el runner) y llama a `src/history.js#printHistory`.
- Declara la versión del CLI **hardcodeada como string literal** (`'1.0.0'`), no leída de `package.json` — es una de las tres fuentes de versión inconsistentes del proyecto.

No hay lógica de negocio en `cli.js`: es estrictamente parsing de argumentos y despacho.

## Runner principal (`src/runner.js`)

Es el orquestador central. Flujo de `run(options)`:

1. Lee y parsea el config JSON (sin validación de esquema).
2. Resuelve qué módulos están activos: todos menos `fallback` y `lighthouse` por defecto, o lo que indique `--only`.
3. Calcula el directorio de salida: `<out>/<YYYY-MM-DD>/<config.name>/`. Si ya existe (mismo proyecto, mismo día), los archivos se sobreescriben en la generación final del reporte.
4. Verifica conectividad (`src/network.js#checkConnectivity`) antes de lanzar el browser; si falla y el ambiente es `dev`/`qa`, sugiere conectar VPN.
5. Lanza un browser Playwright (Chromium) una sola vez para todo el run.
6. Por cada página en `config.pages`:
   - Abre un `BrowserContext` nuevo (viewport 1280×800).
   - Setup pre-navegación de los colectores que necesitan estar activos *antes* del primer request: `ga` (intercepta `dataLayer` + requests), `bundle` (intercepta responses JS), `vitals` (inyecta `web-vitals` vía `addInitScript`).
   - Navega con una función `navigateTo` propia (duplicada también en `responsive.js`) que tolera el caso Next.js donde un segundo `router.replace` post-hidratación invalida el execution context de Playwright.
   - Hace scroll completo de la página (revela contenido lazy-loaded, necesario para CLS real) y dos `Tab` para activar navegación por teclado antes de medir.
   - Espera 4s adicionales (CLS necesita asentarse, INP necesita una interacción+frame).
   - Ejecuta en orden: `vitals` → `a11y` (+ `a11y` scoped a `--component` si aplica) → `component` (si hay selector) → `ga`/`interactions` (si aplica) → `bundle`.
   - Cierra el context de la página.
   - Ejecuta `responsive` (y su variante scoped a componente) — esto abre contexts nuevos por breakpoint, fuera del context de medición de la página.
   - Ejecuta `lighthouse` si está activo (proceso completamente aparte: lanza su propio Chrome vía `chrome-launcher`).
7. Después del loop de páginas, ejecuta los módulos **globales** (no por página): `cache` (fetch directo, sin browser) y `fallback` (browser nuevo, bloquea rutas BFF).
8. Cierra el browser.
9. Si `--compare-last`, busca el run anterior en el historial (`history.js#getLastRun`) **antes** de guardar el run actual, y calcula el delta (`compareWithRun`).
10. Guarda el run actual en el historial (`history.js#appendRun`) — esto pasa siempre, no es opcional.
11. Genera el reporte HTML (`reporter.js#generateReport`) y el Markdown (`markdown.js#generateMarkdownReport`).

El orden entre pasos 9 y 10 es deliberado (comentario en el código): si se guardara antes de comparar, un run se compararía contra sí mismo.

## Módulos actuales

| Módulo | Archivo | Qué hace | Notas de fragilidad |
|---|---|---|---|
| **vitals** | `src/vitals.js` | Inyecta el build IIFE de `web-vitals` vía `addInitScript` y escucha `onCLS/onLCP/onFCP/onTTFB/onINP`, acumulando en `window.__wvResults`. | Resuelve el path al IIFE manualmente porque `web-vitals` v4 no lo expone en `exports` — atado a la estructura interna del paquete instalado; puede romperse en un upgrade de `web-vitals`. INP depende de que haya ocurrido una interacción real (ver runner, paso de Tab). |
| **a11y** | `src/a11y.js` | Inyecta `axe-core` y corre `axe.run()` sobre `document.body` o un selector. Suma un chequeo simple de navegación por teclado (cuenta elementos focusables, tabula y mira `document.activeElement`). | El chequeo de teclado es superficial: no valida foco visible ni orden lógico, solo que algo recibe foco. |
| **responsive** | `src/responsive.js` | Screenshots en 3 breakpoints (desktop/tablet/mobile, configurables), full-page o recortado a un selector. | Duplica su propia copia de `navigateTo` (no reutiliza la del runner) — cualquier fix a ese helper hay que aplicarlo en dos lugares. |
| **bundle** | `src/bundle.js` | Escucha eventos `response`, filtra por content-type JS, suma bytes excluyendo cacheados (304 o service worker). | Depende de que `res.body()` no falle por estar ya consumido (try/catch silencioso) — puede subestimar el total sin avisar. |
| **cache** | `src/cache.js` | Dos `fetch` por endpoint: el primero captura ETag/Last-Modified, el segundo repite con headers condicionales y verifica 304. | No usa el browser — es fetch directo a `baseUrl + endpoint`, fuera del contexto de cookies/sesión que pueda tener la página. |
| **ga** | `src/ga.js` | Intercepta `window.dataLayer.push` vía `Proxy` y registra requests a dominios de GA/Datadog. | Solo detecta eventos disparados *durante* el run (carga + interacciones explícitas); eventos que dependen de scroll real más allá del scroll automático del runner pueden no dispararse. |
| **interactions** | `src/interactions.js` | Soporte de `ga`: bloquea navegación externa, mockea rutas BFF, y ejecuta una secuencia `click`/`fill`/`press` definida en config para disparar eventos de GA atados a interacción real. | El orden de registro de `route()` importa (comentado en el código) — frágil si se agregan más capas de mocking. |
| **fallback** | `src/fallback.js` | Bloquea (`route().abort()`) los endpoints BFF configurados y verifica que la página siga mostrando contenido (>100 caracteres de texto). | Solo testea contra `config.pages[0]`, no contra todas las páginas configuradas. |
| **lighthouse** | `src/lighthouse.js` | Corre Lighthouse programático en un Chrome separado (vía `chrome-launcher`), con throttling simulado. Mapea métricas a thresholds propios (duplicados de los de `reporter.js`/`markdown.js`). | Es el módulo más pesado (~40s/página, por eso está fuera del run por defecto). Lanza un proceso de Chrome adicional al que ya usa Playwright. |
| **component** | `src/component.js` | Mide geometría, posición (above/below fold), CLS aislado (sumando `layout-shift` entries cuyo nodo está dentro del elemento) y una heurística de SSR. | **La heurística de SSR es el punto más frágil del proyecto**: solo chequea `el.innerHTML.trim().length > 0` en el momento de la medición, sin comparar contra el HTML inicial real. Un componente client-rendered que ya pintó se reporta como SSR. Es el módulo diferencial del producto — cualquier cambio acá debe priorizar no perder confiabilidad percibida. |
| **history** | `src/history.js` | Persiste cada run como una línea JSONL en `.history/<proyecto>.jsonl` (acumulativo, nunca se trunca). Expone `getLastRun`, `compareWithRun` (delta de vitals) y `printHistory` (vista de consola). | El delta solo compara métricas de `vitals`, no de `lighthouse` ni `bundle`. El archivo JSONL crece indefinidamente sin rotación. |
| **reporter** | `src/reporter.js` | Genera `report.html` (y `report-component.html` si aplica) con CSS inline, secciones condicionales según qué módulos corrieron. | Thresholds de vitals y lighthouse redefinidos localmente (tercera copia, junto con `markdown.js` y `lighthouse.js`). |
| **markdown** | `src/markdown.js` | Genera `report.md` (y `report-component.md`) — **el artefacto pensado explícitamente para pegar en PRs/Jira/tickets**. Incluye tabla de resumen, secciones por módulo, una sección de "Hallazgos y acciones sugeridas" generada heurísticamente, y el comando exacto para reproducir el run. | Es el output con más consumidores externos al código (gente pegándolo en texto plano). Cualquier cambio de estructura acá es, en la práctica, un breaking change de producto aunque no rompa nada en código. |
| **network** | `src/network.js` | `checkConnectivity`: un `HEAD` con `AbortController` a 5s. Marca `vpnRequired` si el env es `dev`/`qa`. | Un servidor que no soporta `HEAD` (405) o responde lento en cold start puede dar falso negativo. |

## Flujo general de ejecución

```
cli.js (parseo de args)
  └─ run command → src/runner.js#run
       ├─ lee config (sin validar esquema)
       ├─ checkConnectivity (network.js)
       ├─ launch browser (Playwright)
       ├─ por cada page:
       │    ├─ setup pre-nav (ga, bundle, vitals)
       │    ├─ navigateTo + scroll + tab
       │    ├─ vitals / a11y / component / ga+interactions / bundle
       │    ├─ responsive (contexts nuevos por breakpoint)
       │    └─ lighthouse (proceso Chrome separado)
       ├─ cache (fetch directo, global)
       ├─ fallback (browser, global, solo pages[0])
       ├─ close browser
       ├─ compareWithRun (si --compare-last) usando history.js
       ├─ appendRun (history.js) — siempre
       ├─ generateReport (reporter.js) → report.html [+ report-component.html]
       └─ generateMarkdownReport (markdown.js) → report.md [+ report-component.md]

  └─ history command → lee config directo + history.js#printHistory (no pasa por runner.js)
```

## Dónde se guardan los reportes

Base: `$WEBPERF_OUT_DIR` o `~/webperf-reports/` (default en `history.js#DEFAULT_OUT_DIR`).

```
<out>/
  .history/
    <proyecto>.jsonl          # acumulativo, una línea JSON por run, nunca se borra
  <YYYY-MM-DD>/
    <proyecto>/
      report.html
      report.json             # resultado crudo completo (results), sin filtrar
      report.md
      report-component.html   # solo si se usó --component
      report-component.md
      screenshots/
        *.png
```

**Riesgo conocido**: si se corre más de una vez el mismo día para el mismo proyecto, el contenido de `<fecha>/<proyecto>/` se sobreescribe completo. El historial en `.history/` sí persiste cada run por separado.

## Cómo funciona el historial

`history.js` no usa una base de datos: cada run agrega una línea a un archivo `.jsonl` por proyecto. Cada entrada guarda un subconjunto reducido del resultado (`id`, `env`, `baseUrl`, y por página: `path`, `vitals`, `bundle.totalKB`, `a11y.violations.length`) — **no guarda el resultado completo**, así que el historial no permite reconstruir un run viejo completo, solo comparar vitals/bundle/a11y de forma resumida.

`compareWithRun` busca el run anterior que matchee el mismo `env` (o cualquiera si no se especifica) y calcula delta por página y métrica (`LCP`, `CLS`, `FCP`, `INP`, `TTFB`), con porcentaje de cambio y flag de mejora/regresión.

## Partes más frágiles hoy

En orden de impacto sobre la confiabilidad del producto:

1. **Heurística de SSR en `component.js`** — compromete el módulo más diferencial si alguien confía en el resultado sin conocer la limitación.
2. **Falta de validación de config** — cualquier typo en el JSON falla profundo, sin contexto.
3. **Thresholds duplicados en 3 archivos** (`reporter.js`, `markdown.js`, `lighthouse.js`) — alto riesgo de drift silencioso.
4. **`navigateTo` duplicado** entre `runner.js` y `responsive.js` — mismo riesgo de drift si se ajusta el manejo de Next.js hydration en un solo lugar.
5. **Reportes sobreescribibles el mismo día** — rompe el caso de uso "antes/después" si ambas mediciones ocurren el mismo día sin mover el output.
6. **Versionado desincronizado** (`package.json` / `package-lock.json` / CLI hardcodeada).

## Qué debería estabilizarse antes de v1.0

- Esquema de config validado en el borde.
- Una sola fuente de versión.
- Thresholds centralizados (una sola fuente para `reporter.js`/`markdown.js`/`lighthouse.js`).
- Política explícita de output (overwrite vs. run-id) documentada y, si cambia, comunicada como breaking change.
- Heurística de SSR documentada como limitación conocida en el propio reporte (mínimo), mejorada si es viable sin romper compatibilidad (deseable).
- Cobertura de smoke test sobre todos los módulos listados en la tabla de arriba.
