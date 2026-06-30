# webperf-cli

CLI de auditoría de performance y calidad para apps web. Mide Web Vitals, accesibilidad, bundle size, cache BFF y eventos de GA/RUM. Los reportes se guardan en el sistema operativo, fuera del repo auditado.

## Requisitos

- Node.js >=20.12.0 (la CLI usa `process.loadEnvFile`, disponible desde esa versión)
- Acceso a la URL del proyecto (VPN si es entorno `dev` o `qa`)

## Instalación

```bash
cd ~/tools/webperf-cli   # o donde lo hayas clonado
npm install
npm run setup            # descarga Chromium (una sola vez)
```

Opcional — para correrlo desde cualquier directorio:

```bash
npm link
# luego: webperf run -c ...
```

## Configuración

Copiá el template y completalo con los datos del proyecto:

```bash
cp configs/project.example.json configs/mi-proyecto.json
```

Los archivos en `configs/*.json` están en `.gitignore`. Solo se commitea el template `.example.json`.

### Campos del config

| Campo | Requerido | Descripción |
|---|---|---|
| `name` | ✓ | Identificador del proyecto (usado en historial y nombre del reporte) |
| `baseUrl` | ✓ | URL base del ambiente a auditar |
| `env` | ✓ | Entorno: `local`, `dev`, `qa`, `staging`, `prod` |
| `projectPath` | — | Ruta local al repo (para referencia, no se usa todavía) |
| `pages` | ✓ | Lista de rutas a auditar |
| `breakpoints` | — | Ancho en px por viewport. Default: desktop 1280, tablet 768, mobile 375 |
| `ga.measurementId` | — | ID de GA4 (`G-XXXXXXX`). Opcional, solo para documentar qué propiedad se espera |
| `ga.watchEvents` | — | Eventos de `dataLayer` esperados. El reporte marca cuáles se detectaron |
| `rum.provider` | — | `datadog` o vacío. Intercepta requests al endpoint de RUM |
| `bff.endpoints` | — | Endpoints del BFF a testear en el módulo de fallback |
| `bff.fallbackTest` | — | Si es `true`, el módulo fallback bloquea los endpoints y verifica que la UI tenga contenido |
| `cache.endpoints` | — | Endpoints del BFF a verificar (304, ETag, Cache-Control) |
| `component.selector` | — | Selector CSS del componente a auditar por defecto (se puede sobreescribir con `--component`) |

> **Entornos `dev` y `qa`**: si la URL no responde, la herramienta muestra un mensaje de error con indicación de conectar VPN antes de reintentar.

> **Validación**: `run` e `history` validan el config antes de hacer nada más (sin abrir browser ni crear reportes). Si falta un campo requerido, `baseUrl` no es una URL válida con `http:`/`https:`, `env` no es uno de los valores permitidos, o `pages` no es un array de rutas que empiecen con `/`, la CLI termina con un mensaje claro y exit code `1`.

---

## Comandos

### `webperf run`

Corre la auditoría completa (o los módulos indicados con `--only`).

```bash
node cli.js run -c configs/mi-proyecto.json
```

**Opciones:**

| Flag | Default | Descripción |
|---|---|---|
| `-c, --config <path>` | — | Ruta al archivo de config (requerido) |
| `-o, --out <dir>` | `~/webperf-reports` (o `$WEBPERF_OUT_DIR`) | Directorio base de salida |
| `--only <módulos>` | todos menos fallback | Módulos separados por coma |
| `--compare-last [env]` | — | Compara vitals contra el último run guardado |
| `--component <selector>` | — | Limita auditoría a un componente específico (ver sección) |
| `--headed` | — | Abre Chromium en modo visible (útil para debug) |

**Módulos disponibles para `--only`:**

| Módulo | Qué hace |
|---|---|
| `vitals` | LCP, CLS, FCP, INP, TTFB vía web-vitals |
| `a11y` | Violaciones WCAG 2.1 AA con axe-core + navegación por teclado |
| `responsive` | Screenshots en desktop / tablet / mobile |
| `bundle` | Total de JS descargado y top scripts por tamaño |
| `cache` | Verifica 304 y headers Cache-Control en endpoints BFF |
| `ga` | Captura eventos de `dataLayer` y requests a GA / Datadog RUM |
| `fallback` | Bloquea endpoints BFF y verifica que la página renderiza igual |
| `lighthouse` | Ejecuta Lighthouse programático (score + FCP/LCP/CLS/TBT/TTI/TTFB + console errors) |

**Ejemplos:**

```bash
# Auditoría completa
node cli.js run -c configs/mi-proyecto.json

# Solo vitals y accesibilidad
node cli.js run -c configs/mi-proyecto.json --only vitals,a11y

# Activar fallback explícitamente
node cli.js run -c configs/mi-proyecto.json --only vitals,fallback

# Comparar contra el último run del mismo entorno
node cli.js run -c configs/mi-proyecto.json --compare-last

# Comparar contra el último run de qa específicamente
node cli.js run -c configs/mi-proyecto-staging.json --compare-last qa

# Debug con browser visible
node cli.js run -c configs/mi-proyecto.json --headed --only vitals

# Auditar solo el footer
node cli.js run -c configs/mi-proyecto.json --component '[data-testid="footer"]'

# Lighthouse + a11y (sin los otros módulos)
node cli.js run -c configs/mi-proyecto.json --only lighthouse,a11y
```

> **Nota:** `lighthouse` no está incluido por defecto porque suma ~40s por página. Habilitarlo con `--only` o agregarlo al run completo explícitamente: `--only vitals,a11y,bundle,cache,ga,responsive,lighthouse`.

---

### Auditoría de componente (`--component`)

Limita la auditoría a un elemento específico de la página, pasando cualquier selector CSS válido.

```bash
# Por data-testid
node cli.js run -c configs/mi-proyecto.json --component '[data-testid="footer"]'

# Por ID
node cli.js run -c configs/mi-proyecto.json --component "#newsletter-section"

# Por clase
node cli.js run -c configs/mi-proyecto.json --component ".promo-banner"
```

Cuando se activa `--component`, la herramienta:

| Módulo | Comportamiento |
|---|---|
| `a11y` | Corre axe-core solo sobre el elemento (menos ruido, más foco) |
| `responsive` | Las screenshots recortan exactamente el componente en cada breakpoint |
| `component` | Mide posición (above/below fold), dimensiones, CLS del elemento y si fue SSR |

El módulo `vitals` sigue midiendo la página completa (LCP, CLS global, FCP, TTFB, INP).

**Config fija (sin flag en cada run):**

```json
{
  "component": {
    "selector": "[data-testid=\"footer\"]"
  }
}
```

El flag `--component` en CLI siempre tiene prioridad sobre el config.

---

### `webperf history`

Muestra el historial de runs guardados para un proyecto.

```bash
node cli.js history -c configs/mi-proyecto.json
```

**Opciones:**

| Flag | Default | Descripción |
|---|---|---|
| `-c, --config <path>` | — | Config del proyecto (requerido) |
| `-o, --out <dir>` | `~/webperf-reports` (o `$WEBPERF_OUT_DIR`) | Directorio donde se guardó el historial (debe coincidir con el `--out` usado en `run`) |
| `--env <env>` | todos | Filtra por entorno |
| `--limit <n>` | 10 | Cantidad de runs a mostrar |

**Ejemplos:**

```bash
# Ver los últimos 10 runs de cualquier entorno
node cli.js history -c configs/mi-proyecto.json

# Ver solo runs de qa
node cli.js history -c configs/mi-proyecto.json --env qa

# Ver los últimos 20 runs
node cli.js history -c configs/mi-proyecto.json --limit 20
```

---

## Flujo típico: before/after de un cambio

```bash
# 1. Medís el estado actual (antes del cambio)
node cli.js run -c configs/mi-proyecto.json

# 2. Hacés el cambio en el código y deployás al ambiente

# 3. Medís de nuevo y comparás automáticamente contra el run anterior
node cli.js run -c configs/mi-proyecto.json --compare-last
```

El reporte generado en el paso 3 incluye una tabla con el delta por métrica (antes → después, con %).

---

## Dónde se guardan los reportes

Por defecto en `~/webperf-reports/`. Configurable con `-o, --out <dir>` o la variable de entorno `WEBPERF_OUT_DIR`.

```
~/webperf-reports/
  .history/
    mi-proyecto.jsonl        # historial de runs (un JSON por línea)
  2024-01-15/
    mi-proyecto/
      report.html            # reporte visual completo
      report.json            # datos raw en JSON
      screenshots/
        home_desktop.png
        home_tablet.png
        home_mobile.png
        component_data-testid_footer__desktop.png  # con --component
        component_data-testid_footer__tablet.png
        component_data-testid_footer__mobile.png
        fallback_api_footer.png
```

El historial en `.history/` es acumulativo — no se borra entre runs. Los reportes en `2024-01-15/` se sobrescriben si corrés más de una vez en el mismo día para el mismo proyecto.

> Si usás `--out` en `run`, pasá el mismo valor (o configurá `WEBPERF_OUT_DIR`) al correr `history`, así lee el historial del mismo directorio.

---

## Agregar un proyecto nuevo

1. Copiá el template: `cp configs/project.example.json configs/nombre.json`
2. Editá `baseUrl`, `pages`, y los campos opcionales según necesidad
3. Corré: `node cli.js run -c configs/nombre.json`

Para ambientes protegidos por VPN, configurá `"env": "dev"` o `"env": "qa"` — la herramienta verifica conectividad antes de arrancar y muestra el mensaje apropiado si no hay acceso.
