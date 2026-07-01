# Títulos

Repositorio modular para el sistema de títulos académicos.

## Acceso principal

Abrir:

```text
index.html
```

Desde esa pantalla se accede a estudiantes, coordinadores, administradores y seguridad.

## Estructura general

```text
titulos/
├─ index.html
├─ seguridad.html
├─ firestore.rules.example
├─ docs/
│  └─ SEGURIDAD.md
├─ shared/
│  ├─ css/
│  │  └─ navigation.css
│  └─ js/
│     └─ security.check.js
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
seguridad.html
```

## Seguridad

Antes de publicar en web, revisar:

```text
docs/SEGURIDAD.md
firestore.rules.example
```

## Orden de desarrollo

1. Estructura base del repositorio.
2. Pantalla de estudiantes completa.
3. Módulo administradores.
4. Módulo coordinadores.
5. Navegación centralizada.
6. Seguridad visual y reglas de referencia.
