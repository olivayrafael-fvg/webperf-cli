# Working Agreement — webperf-cli

Cómo trabajamos en este repo de ahora en adelante. Esto aplica a cualquier cambio, sea un agente LLM o de una persona del equipo.

## Reglas de iteración

1. **Una iteración, un objetivo.** No mezclar hardening + feature nueva + refactor en el mismo cambio, salvo que sean estrictamente dependientes entre sí.
2. **Cada iteración mapea a un release del `ROADMAP.md`.** Si una tarea no entra en el alcance de la release activa, se anota como tarea futura — no se hace "de paso".
3. **Cambios pequeños y testeables por encima de cambios grandes y completos.** Si una tarea del roadmap es grande, se parte en sub-iteraciones.
4. **No tocar varias áreas sensibles a la vez si no es necesario.** Áreas sensibles de este repo: `runner.js` (orquestación central), `markdown.js`/`reporter.js` (contrato de salida), `component.js` (diferencial de producto). Si una iteración toca una de estas, evitar que toque otra del mismo grupo en el mismo cambio.

## Compatibilidad y dependencias

5. **Mantener compatibilidad salvo que se declare breaking change explícitamente.** Un breaking change es: cambio de estructura del config, cambio de estructura del reporte HTML/MD/JSON, cambio de flags del CLI, cambio del path de salida de reportes/historial.
6. **No modificar el output público (HTML, Markdown, JSON, estructura de carpetas) sin documentarlo** en el resumen de la iteración y, si corresponde, en `CHANGELOG.md`.
7. **No agregar dependencias nuevas sin justificación explícita.** La justificación debe explicar qué problema resuelve y por qué no se puede resolver con lo que ya está en `package.json`. Esto incluye dependencias de desarrollo (lint, test runner, etc.) — también se justifican, aunque el estándar sea más bajo.

## Formato de cada cambio

Cada cambio (PR, commit individual, o respuesta de iteración) debe terminar con:

- **Resumen**: qué se hizo y por qué, en 2-4 líneas.
- **Archivos modificados**: lista concreta de paths.
- **Cómo probar**: comandos exactos a correr para verificar el cambio (no "correr la suite de tests" en abstracto si no existe esa suite todavía).
- **Riesgos**: qué podría romperse y por qué, aunque sea "ninguno detectado".
- **Próximos pasos**: qué queda pendiente o qué iteración sigue, referenciando el roadmap si aplica.

## Versionado y releases

8. **SemVer real**, no decorativo:
   - `MAJOR`: breaking change (ver definición arriba).
   - `MINOR`: feature nueva sin romper compatibilidad (nuevo módulo, nuevo flag opcional).
   - `PATCH`: fix sin cambio de comportamiento esperado.
9. **Una sola fuente de verdad para la versión**: `package.json`. Todo lo demás (CLI, `package-lock.json`) debe derivar de ahí o estar sincronizado por `npm install`.
10. **Mantener `CHANGELOG.md`** (a partir de v0.2.0) con una entrada por versión publicada: qué cambió, qué se agregó, qué se rompió.

## Branches y commits

11. Nombrar branches con versión completa de 3 valores: `release/x.y.z` para el trabajo de una release (ej. `release/0.2.0`), o `feature/<descripcion-corta>` / `fix/<descripcion-corta>` para cambios puntuales. `release/0.1` (sin tercer valor) queda como excepción histórica — no se renombra, pero ninguna branch nueva se crea con ese formato de dos valores.
12. Seguir el formato de commit `tipo(scope): descripción`. Sin `Co-Authored-By`.
13. No hacer `git commit` ni `git push` salvo pedido explícito de la persona a cargo.

## Qué NO hacer

- No refactors grandes "porque se puede mejorar" sin que estén en el roadmap o sin justificarlo explícitamente en el resumen del cambio.
- No cambiar comportamiento funcional como efecto secundario de un cambio documental o de hardening.
- No introducir abstracciones (config schema con librería externa, sistema de plugins, etc.) antes de que el roadmap llegue a ese punto.
- No silenciar o eliminar mensajes de error/limitaciones conocidas (ej. heurística de SSR) sin reemplazarlos por algo mejor — si no se puede arreglar todavía, se documenta como limitación conocida.
