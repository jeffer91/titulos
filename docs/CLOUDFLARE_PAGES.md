# Publicación en Cloudflare Pages

Este documento corresponde al Bloque 21.

## Tipo de proyecto

Este repositorio es una app estática modular. No necesita proceso de build para publicar las pantallas HTML.

## Configuración recomendada en Cloudflare Pages

```text
Framework preset: None
Build command: dejar vacío
Build output directory: /
Root directory: /
Branch: main
```

## Archivos importantes

```text
index.html
_headers
_redirects
```

## Rutas públicas

```text
/
/estudiantes
/coordinadores
/coordinadores/revision
/administradores
/administradores/coordinadores
/administradores/reportes
/seguridad
```

## Antes de publicar

Revisar:

```text
docs/SEGURIDAD.md
firestore.rules.example
```

## Firebase

Cada módulo debe tener configurado Firebase en su propio archivo:

```text
estudiantes/js/app.config.js
coordinadores/js/app.config.js
administradores/js/app.config.js
```

## Advertencia

Cloudflare solo publica los archivos. La seguridad real de lectura y escritura depende de Firebase, autenticación y reglas de Firestore.
