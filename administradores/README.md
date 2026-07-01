# Módulo Administradores

Este módulo es independiente del módulo de estudiantes y del módulo de coordinadores.

## Formas de uso

- Doble click en `administrador.html`.
- Doble click en `coordinadores.html` para gestión directa de coordinadores.
- Doble click en `reportes.html` para reportes y exportación.
- Live Server abriendo directamente archivos dentro de `administradores/`.
- Instalador Electron propio del módulo administradores.

## Archivos principales

```text
administradores/
├─ administrador.html
├─ coordinadores.html
├─ reportes.html
├─ css/
│  └─ administrador.css
├─ js/
│  ├─ app.config.js
│  ├─ firebase.service.js
│  ├─ administrador.repository.js
│  ├─ administrador.app.js
│  ├─ estudiantes.import.service.js
│  ├─ estudiantes.admin.js
│  ├─ coordinadores.admin.js
│  └─ reportes.admin.js
├─ assets/
└─ electron/
```

## Funciones construidas

- Configuración general del proceso.
- Gestión de períodos.
- Carga, listado y limpieza de estudiantes.
- Gestión de coordinadores.
- Configuración de IA.
- Diagnóstico básico.
- Reportes de títulos y estudiantes.
- Exportación CSV.

## Regla técnica

El instalador de administradores será independiente del instalador de coordinadores.
