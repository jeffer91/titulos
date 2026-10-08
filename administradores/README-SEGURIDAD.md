# ITSQMET — Bloque 5 de 6: Administrador

## Arquitectura preparada

Se incorporó un backend dedicado en `functions/modules/administradores.js`, con lógica de servidor en `functions/services/administradores.js`, `admin-config.js` y `admin-personal.js`. Comparte con los otros módulos únicamente verificación de Firebase Auth y control de CORS.

**Todas las rutas exigen token Firebase Auth válido y rol `administrador` emitido por Firebase Admin SDK.** No basta conocer una cédula, elegir un perfil o escribir un rol en el navegador. El sistema no admite autorregistro ni asignar otro rol administrador mediante la API.

### Rutas creadas

| Operación | Método | Alcance |
| --- | --- | --- |
| /sesion | GET | Comprobar identidad y rol del administrador |
| /configuracion | GET | Configuración operativa sin secretos |
| /configuracion/guardar | POST | Lista cerrada de campos permitidos; registro de auditoría transaccional |
| /periodos | GET | Períodos configurados (máximo temporal 500) |
| /carreras | GET | Catálogo de carreras operativas (máximo temporal 500) |
| /coordinadores | GET | Perfiles resumidos y carreras, sin datos ajenos |
| /coordinadores/crear | POST | Nuevo coordinador con correo/UID de Auth, sin confiar en identidad client-side |
| /coordinadores/estado | POST | Activación/desactivación, retiro de asignaciones al desactivar |
| /coordinadores/carrera | POST | Asignar/retirar carreras; impide compartir la misma carrera entre coordinadores activos |
| /investigadores | GET | Perfiles resumidos; no entrega hashes PIN |
| /investigadores/crear | POST | Alta por cuenta Auth real, sin PIN cliente |
| /investigadores/estado | POST | Control administrativo de acceso, revalidado al revisar |
| /investigadores/carrera | POST | Asignaciones de carreras |
| /proveedores | GET | Solo metadatos de IA; no incluye `apiKey`, `key`, tokens ni endpoint secreto |
| /usuarios/rol | POST | Asignación de rol coordinador/investigador a cuenta existente de Firebase Auth. Rechaza alta administrador y estudiante no verificado |

Las operaciones de cambio de coordinadores e investigadores, asignación y configuración escriben eventos en `workflow_events` dentro de la misma transacción Firestore. La operación de custom claims de Firebase Auth y su evento Firestore no son una transacción única y requieren conciliación si falla el registro del evento.

### Secretos e integraciones

La nueva API **no permite subir ni guardar secretos por HTTP**. Los campos sensibles (`sheetsToken`, `apiKey`, `key`, etc.) se rechazan en cambios de configuración y no aparecen en las lecturas. Los formularios de claves IA se deshabilitan al activar el modo seguro; se debe configurar Gemini mediante Google Cloud Secret Manager, con `TITULOS_GEMINI_API_KEY` utilizado por `estudiantesApi`.

**Esto no retira ni revoca las claves antiguas** que puedan seguir almacenadas en documentos `ia`, `configuracion` o scripts del sistema legado. Su extracción, revocación, limpieza y migración deben completarse antes de activar reglas definitivas.

### Modo de compatibilidad y funciones pendientes

`administradores/js/secure.config.js` conserva `habilitado: false` para no interrumpir el trabajo institucional. El modo nuevo **no está desplegado ni operativo en producción**. Cuando se active, el acceso directo desde el navegador a Firebase académico y operativo quedará bloqueado en `firebase.service.js`; el sistema solo ofrece las secciones migradas (Coordinadores, Investigadores, Períodos y lectura restringida de Ajustes). Consultas generales de estudiantes, faltantes, informes, normalización global, respaldos e integración Google Sheets todavía necesitan rutas específicas de backend y no deben habilitarse automáticamente.

La sección **Coordinadores** usa las rutas de perfil, alta, desactivación y carreras. **Investigadores** lista perfiles, crea vinculaciones sin PIN y permite suspender/reactivar acceso mediante API. **Períodos** obtiene datos y actualiza únicamente la configuración permitida. **Ajustes** ofrece metadatos de proveedores sin exponer credenciales; no permite editar ni probar secretos en el navegador.

### Requisitos antes de activar

1. Crear cuentas reales de Firebase Auth para administradores y asignar manualmente el primer `roles: ['administrador']` en un entorno servidor de confianza. No ofrecer alta pública de administradores.
2. Crear las cuentas de coordinadores/investigadores y vincular sus documentos con `authUid` real. Asignar roles operativos desde la API tras confirmar identidad y autorización.
3. Desplegar Cloud Functions v2 en `titulos-ec2fa`, configurar permisos IAM mínimos e inspeccionar las **reglas Firestore reales**. No subir service-account JSON ni claves privadas al repositorio.
4. Normalizar nombres e identificadores de carreras y confirmar catálogo `carreras`. Los filtros de módulos usan coincidencia exacta; carreras sin correspondencia no se asignarán por coincidencia parcial.
5. Comprobar límites de 500 registros (perfiles, carreras y períodos) y añadir paginación antes de operar volúmenes mayores.
6. Completar las rutas administrativas restantes, respaldos, IA/Sheets y pruebas con emuladores. Migrar los cuatro frontends antes de bloquear acceso directo en Firestore (bloque 6).
7. Rotar o revocar **cualquier clave de cuenta de servicio previamente expuesta**. Borrar el archivo o mensaje no invalida la credencial.

### Pruebas

`node --test functions/test/administradores.test.js`

Se comprueban secretos en respuestas, rechazo de escrituras indebidas, autenticación de rol, gestión de perfiles, carrera exclusiva, transacciones y denegación de creación de administrador por la API.

**No se han modificado ni borrado datos de Firebase ni desplegado funciones desde esta corrección de código.**
