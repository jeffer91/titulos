# Revisión de bloques de funcionalidad

Este documento corresponde al Bloque 24.

## Objetivo

Revisar y reforzar el funcionamiento principal del sistema después de la construcción visual y modular.

## Pantallas revisadas

```text
estudiantes/estudiante.html
coordinadores/coordinador.html
coordinadores/revision.html
administradores/administrador.html
administradores/coordinadores.html
administradores/reportes.html
```

## Correcciones aplicadas

### Estudiantes

```text
- Se actualizó estudiantes/js/app.config.js para reflejar la etapa funcional actual.
- La IA queda habilitada por configuración por defecto, alineada con administración.
- Se actualizaron textos de IA, envío y Google Sheets para que no digan bloques antiguos.
```

### Coordinadores

```text
- Se reforzó coordinadores/js/firebase.service.js con escritura, logs y timestamp.
- Se corrigió el filtro de carreras para que un título sin carrera no aparezca indebidamente.
- Se agregó soporte para coordinadores con acceso a todas las carreras usando *, TODOS, TODAS o ALL.
- Se reforzó revisarTitulo para evitar registrar decisiones sobre carreras no asignadas.
- Se mejoró la pantalla coordinadores/revision.html mediante revision.app.js para listar propuestas completas, validar observación y recargar después de guardar.
```

## Flujo funcional esperado

### Flujo estudiante

```text
1. Administrador crea período activo.
2. Administrador carga estudiantes.
3. Estudiante consulta cédula.
4. Estudiante completa 3 propuestas.
5. Estudiante genera sugerencias IA si IA está configurada.
6. Estudiante envía propuestas.
7. Se guarda en titulos/{periodoId}__{cedula}.
8. Se registra log en titulos_logs.
9. Se intenta respaldo Google Sheets si existe URL.
```

### Flujo coordinador

```text
1. Administrador crea coordinador con carreras asignadas.
2. Coordinador entra con su correo.
3. Coordinador consulta títulos por período.
4. Solo ve títulos de sus carreras.
5. Coordinador aprueba, aprueba con observación o devuelve.
6. El estado cambia en titulos.
7. Se registra log en titulos_logs.
```

### Flujo administrador

```text
1. Configura Firebase en app.config.js.
2. Configura período activo.
3. Carga estudiantes.
4. Crea coordinadores.
5. Configura proveedor IA.
6. Consulta reportes.
7. Exporta CSV.
```

## Pendiente de prueba real

```text
- Probar con un período real.
- Probar con un estudiante real cargado por Excel o CSV.
- Probar con un coordinador asignado a la carrera del estudiante.
- Probar aprobación y devolución.
- Verificar que los estados cambien en Firebase.
```
