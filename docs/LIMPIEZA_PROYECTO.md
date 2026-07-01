# Limpieza del proyecto

Este documento corresponde al Bloque 22.

## Objetivo

Dejar el repositorio ordenado antes de las pruebas reales y publicación.

## Archivos temporales

No deben quedar archivos temporales como:

```text
*_tmp.js
*_test.js
test_*.js
prueba_*.html
*.bak
*.old
```

## Dependencias

No subir al repositorio:

```text
node_modules/
dist/
*.log
```

Estas carpetas se regeneran localmente con:

```bash
npm install
npm run dist
```

## Estructura esperada

```text
estudiantes/
coordinadores/
administradores/
shared/
docs/
```

## Archivos de publicación

```text
index.html
seguridad.html
pruebas.html
_headers
_redirects
firestore.rules.example
cloudflare-pages.config.md
```

## Validación manual

Antes de publicar:

```text
1. Abrir index.html.
2. Abrir cada ruta principal.
3. Revisar consola del navegador.
4. Revisar Firebase.
5. Revisar reglas Firestore.
6. Probar exportación CSV.
7. Probar instaladores Electron localmente.
```

## Recomendación

Mantener el proyecto modular. No mezclar lógica de estudiantes, coordinadores y administradores en un mismo archivo global.
