# Títulos

Repositorio modular para el sistema de títulos académicos.

## Acceso principal

Abrir:

```text
index.html
```

Desde esa pantalla se accede a estudiantes, coordinadores, administradores, reportes, seguridad y pruebas finales.

## Estructura general

```text
titulos/
├─ index.html
├─ seguridad.html
├─ pruebas.html
├─ _headers
├─ _redirects
├─ .gitignore
├─ firestore.rules.example
├─ cloudflare-pages.config.md
├─ docs/
│  ├─ SEGURIDAD.md
│  ├─ CLOUDFLARE_PAGES.md
│  ├─ PRE_PUBLICACION_CHECKLIST.md
│  ├─ PRUEBAS_FINALES.md
│  ├─ LIMPIEZA_PROYECTO.md
│  ├─ REVISION_VISUAL.md
│  └─ ESTADO_FINAL.md
├─ shared/
│  ├─ css/
│  │  ├─ navigation.css
│  │  └─ visibility-fixes.css
│  └─ js/
├─ estudiantes/
├─ coordinadores/
└─ administradores/
```

## Reglas principales

- `estudiantes/` funciona solo con doble click en el HTML o con Live Server.
- `coordinadores/` funciona con doble click, Live Server y un instalador Electron propio.
- `administradores/` funciona con doble click, Live Server y un instalador Electron propio.
- Cada módulo tiene sus propios archivos CSS, JS y assets.
- Los tres módulos comparten el mismo proyecto Firebase.
- El instalador de coordinadores no será el mismo que el instalador de administradores.

## Pantallas principales

```text
estudiantes/estudiante.html
coordinadores/coordinador.html
coordinadores/revision.html
administradores/administrador.html
administradores/coordinadores.html
administradores/reportes.html
seguridad.html
pruebas.html
```

## Electron

```text
coordinadores/electron/
administradores/electron/
```

Cada módulo tiene su propio instalador.

## Cloudflare Pages

Revisar:

```text
docs/CLOUDFLARE_PAGES.md
docs/PRE_PUBLICACION_CHECKLIST.md
cloudflare-pages.config.md
```

## Seguridad

Antes de publicar en web, revisar:

```text
docs/SEGURIDAD.md
firestore.rules.example
```

## Pruebas finales

Antes de usar el sistema con estudiantes reales, revisar:

```text
pruebas.html
docs/PRUEBAS_FINALES.md
docs/LIMPIEZA_PROYECTO.md
docs/ESTADO_FINAL.md
docs/REVISION_VISUAL.md
```

## Orden de desarrollo completado

1. Estructura base del repositorio.
2. Pantalla de estudiantes completa.
3. Módulo administradores.
4. Módulo coordinadores.
5. Navegación centralizada.
6. Seguridad visual y reglas de referencia.
7. Reportes y exportación.
8. Electron coordinadores.
9. Electron administradores.
10. Preparación Cloudflare Pages.
11. Pruebas finales y limpieza del proyecto.
12. Revisión visual y corrección de visibilidad.
