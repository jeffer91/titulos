# Pruebas finales del sistema

Este documento corresponde al Bloque 22.

## Objetivo

Validar que el sistema funcione antes de usarlo con estudiantes, coordinadores y administradores reales.

## 1. Prueba estudiantes

Abrir:

```text
estudiantes/estudiante.html
```

Revisar:

```text
1. La pantalla carga sin errores visuales.
2. Firebase conecta correctamente.
3. La cédula consulta un estudiante cargado.
4. El estudiante puede completar 3 propuestas.
5. La app no permite enviar con campos vacíos.
6. La app guarda el envío en titulos/{periodoId}__{cedula}.
7. La app muestra comprobante final.
```

## 2. Prueba administradores

Abrir:

```text
administradores/administrador.html
```

Revisar:

```text
1. Firebase conecta correctamente.
2. Se puede cargar y guardar configuración general.
3. Se puede crear un período.
4. Se puede activar un período.
5. Se puede cargar estudiantes.
6. Se puede listar estudiantes.
7. Se puede limpiar estudiantes por período.
```

## 3. Prueba coordinadores administrativos

Abrir:

```text
administradores/coordinadores.html
```

Revisar:

```text
1. Se puede crear un coordinador.
2. El correo queda como ID del documento.
3. Las carreras se guardan como arreglo.
4. Se puede editar.
5. Se puede eliminar.
```

## 4. Prueba revisión coordinadores

Abrir:

```text
coordinadores/coordinador.html
coordinadores/revision.html
```

Revisar:

```text
1. El correo del coordinador existe en coordinadores/{email}.
2. El coordinador solo ve títulos de carreras asignadas.
3. Se puede listar por período.
4. Se puede filtrar por estado.
5. Se puede aprobar.
6. Se puede aprobar con observación.
7. Se puede devolver con observación.
8. El estado cambia en titulos.
9. Se registra log en titulos_logs.
```

## 5. Prueba reportes

Abrir:

```text
administradores/reportes.html
```

Revisar:

```text
1. Consulta títulos por período.
2. Filtra títulos por estado.
3. Consulta estudiantes por período.
4. Exporta CSV.
5. El CSV abre correctamente en Excel.
```

## 6. Prueba Cloudflare

Revisar:

```text
docs/CLOUDFLARE_PAGES.md
cloudflare-pages.config.md
_headers
_redirects
```

Luego probar rutas:

```text
/
/estudiantes
/coordinadores
/coordinadores/revision
/administradores
/administradores/coordinadores
/administradores/reportes
/seguridad
/pruebas
```

## 7. Prueba Electron

Coordinadores:

```bash
cd coordinadores/electron
npm install
npm start
```

Administradores:

```bash
cd administradores/electron
npm install
npm start
```

## Resultado esperado

El sistema queda listo para pruebas reales controladas, siempre que Firebase esté correctamente configurado y las reglas de Firestore estén adaptadas al proyecto real.
