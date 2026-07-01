# Módulo Coordinadores

Este módulo es independiente del módulo de estudiantes y del módulo de administradores.

## Formas de uso

- Doble click en `coordinador.html` para listado general de títulos.
- Doble click en `revision.html` para registrar decisiones de revisión.
- Live Server abriendo directamente archivos dentro de `coordinadores/`.
- Instalador Electron propio del módulo coordinadores.

## Archivos principales

```text
coordinadores/
├─ coordinador.html
├─ revision.html
├─ css/
│  └─ coordinador.css
├─ js/
│  ├─ app.config.js
│  ├─ firebase.service.js
│  ├─ coordinador.repository.js
│  ├─ coordinador.app.js
│  ├─ revision.service.js
│  └─ revision.app.js
├─ assets/
└─ electron/
```

## Funciones construidas

- Conexión Firebase del módulo coordinadores.
- Identificación de coordinador por correo.
- Filtro por carreras asignadas.
- Listado de títulos enviados por período y estado.
- Visualización de propuestas.
- Registro de decisiones de revisión: aprobado, aprobado con observación o devuelto.

## Regla técnica

El instalador de coordinadores será independiente del instalador de administradores.
