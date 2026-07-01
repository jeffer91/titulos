# Revisión visual y corrección de visibilidad

Este documento corresponde al Bloque 23.

## Objetivo

Revisar que las pantallas principales muestren correctamente formularios, botones, tablas, tarjetas, mensajes, estados y comprobantes.

## Archivo visual compartido

Se creó:

```text
shared/css/visibility-fixes.css
```

Este archivo aplica correcciones visuales comunes sin mezclar la lógica de estudiantes, coordinadores y administradores.

## Pantallas revisadas

```text
index.html
seguridad.html
pruebas.html
estudiantes/estudiante.html
coordinadores/coordinador.html
coordinadores/revision.html
administradores/administrador.html
administradores/coordinadores.html
administradores/reportes.html
```

## Correcciones aplicadas

```text
1. Textos largos no rompen tarjetas ni tablas.
2. Botones se acomodan bien en escritorio y móvil.
3. Tablas tienen scroll horizontal controlado.
4. Paneles de revisión tienen estilos visibles.
5. Mensajes de estado no ocupan espacio vacío cuando no tienen contenido.
6. Tarjetas, formularios y badges no se desbordan.
7. Rutas principales siguen visibles desde index.html.
8. Las notas de bloque fueron actualizadas para revisión visual.
```

## Elementos verificados por pantalla

### Estudiantes

```text
- Consulta por cédula.
- Datos del estudiante.
- Formulario de tres propuestas.
- Sugerencias.
- Vista previa.
- Modal de confirmación.
- Comprobante final.
```

### Coordinadores

```text
- Identificación por correo.
- Período.
- Filtro por estado.
- Listado de títulos.
- Tarjetas de propuestas.
- Acciones de revisión.
```

### Administradores

```text
- Configuración general.
- Períodos.
- Carga de estudiantes.
- Configuración IA.
- Gestión de coordinadores.
- Reportes.
- Diagnóstico.
```

## Recomendación de prueba

Después de hacer `git pull`, abrir primero:

```text
index.html
```

Luego entrar a cada módulo desde el panel principal y revisar en escritorio y móvil.
