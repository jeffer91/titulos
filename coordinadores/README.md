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
   ├─ package.json
   ├─ main.js
   ├─ preload.js
   ├─ README.md
   ├─ INICIAR_COORDINADORES.bat
   └─ BUILD_COORDINADORES.bat
```

## Funciones construidas

- Conexión Firebase del módulo coordinadores.
- Identificación de coordinador por correo.
- Filtro por carreras asignadas.
- Listado de títulos enviados por período y estado.
- Visualización de propuestas.
- Registro de decisiones de revisión: aprobado, aprobado con observación o devuelto.
- Base de instalador Electron independiente para coordinadores.

## Probar Electron

Desde la carpeta `coordinadores/electron`:

```bash
npm install
npm start
```

Para generar instalador:

```bash
npm run dist
```

## Regla técnica

El instalador de coordinadores será independiente del instalador de administradores.
