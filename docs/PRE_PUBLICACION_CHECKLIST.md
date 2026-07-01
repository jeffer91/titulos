# Checklist antes de publicar

Este documento corresponde al Bloque 21.

## Archivos obligatorios

```text
index.html
_headers
_redirects
seguridad.html
docs/SEGURIDAD.md
firestore.rules.example
```

## Revisar Firebase

```text
1. Configuración Firebase en estudiantes/js/app.config.js
2. Configuración Firebase en coordinadores/js/app.config.js
3. Configuración Firebase en administradores/js/app.config.js
4. Reglas Firestore adaptadas al proyecto real
5. Colecciones iniciales creadas
```

## Revisar rutas

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

## Revisar datos sensibles

```text
1. No publicar claves privadas.
2. No dejar reglas Firestore abiertas.
3. No dejar IA accesible sin control.
4. No permitir escritura pública en configuración.
```

## Después de publicar

```text
1. Probar ingreso de estudiante.
2. Probar envío de 3 propuestas.
3. Probar revisión de coordinador.
4. Probar reportes de administrador.
5. Revisar consola del navegador.
```
