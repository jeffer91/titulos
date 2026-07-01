# Guía de seguridad

Este documento corresponde al Bloque 17.

## Objetivo

Antes de publicar el sistema en la web, el proyecto debe revisar accesos, roles y alcance de cada pantalla.

## Módulos

```text
estudiantes/
coordinadores/
administradores/
```

## Roles recomendados

```text
estudiante
coordinador
administrador
```

## Revisión mínima antes de publicar

```text
1. Confirmar que cada pantalla use solo las colecciones que necesita.
2. Confirmar que estudiantes no tengan acceso a pantallas administrativas.
3. Confirmar que coordinadores solo vean carreras asignadas.
4. Confirmar que administradores sean los únicos que modifiquen configuración general.
5. Revisar cuidadosamente la configuración del proyecto antes de subirlo a hosting.
```

## Colecciones del sistema

```text
Estudiantes
periodos
titulos
titulos_config
titulos_logs
coordinadores
IA
```

## Nota importante

La separación visual de pantallas ayuda a ordenar el sistema, pero la protección real debe configurarse en Firebase antes de publicar la app.
