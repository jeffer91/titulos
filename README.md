# Títulos

Repositorio modular para el sistema de títulos académicos.

## Estructura general

```text
titulos/
├─ estudiantes/
├─ coordinadores/
└─ administradores/
```

## Reglas principales

- `estudiantes/` funciona solo con doble click en el HTML o con Live Server.
- `coordinadores/` funciona con doble click, Live Server y un instalador Electron propio.
- `administradores/` funciona con doble click, Live Server y un instalador Electron propio.
- Cada módulo tiene sus propios archivos CSS, JS y assets.
- Los tres módulos compartirán el mismo proyecto Firebase.
- El instalador de coordinadores no será el mismo que el instalador de administradores.

## Orden de desarrollo

1. Estructura base del repositorio.
2. Pantalla de estudiantes completa.
3. Módulo coordinadores.
4. Módulo administradores.
