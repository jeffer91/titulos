# Bloque 2: Estudiantes — backend verificable

## Corrección realizada

Se añadió al backend de estudiantes una ruta segura por operación:

- GET /configuracion: configuración sanitizada, sin claves de IA ni tokens Sheets.
- GET /expediente: valida cédula del token y matrícula del proyecto utet-4387a, y solo entrega el envío de su propio período en titulos-ec2fa.
- GET /historial: versiones y eventos de ese expediente exclusivamente.
- POST /envio: valida identidad, período y tres propuestas en servidor. Graba título, versión y evento en una transacción, rechazando duplicados y reenvíos no autorizados.
- GET /proveedores y POST /ia: la clave TITULOS_GEMINI_API_KEY reside en Google Secret Manager; cuota de hasta 20 solicitudes de IA por estudiante y día.

El frontend incorpora autenticación Firebase Auth por correo/contraseña, adaptadores a esos endpoints, mensajes de diagnóstico y modo de compatibilidad.

## IMPORTANTE: activación gradual

El archivo estudiantes/js/secure.config.js tiene habilitado: false. Sigue operativo el flujo antiguo para no bloquear estudiantes sin credenciales de Firebase Auth. Esta implementación por sí sola NO protege Firestore si sus reglas actuales permiten acceso desde el SDK público.

Para activar el modo seguro:
1. Habilitar Firebase Authentication por correo/contraseña, sin autoregistro público.
2. Dar de alta cada cuenta tras comprobar su identidad y asignar por Firebase Admin los claims roles: ['estudiante'] y cedula: '10 dígitos'. Nunca permitir que el navegador establezca esos claims.
3. Desplegar Cloud Functions en titulos-ec2fa, tras verificar costos, IAM e índices. La cuenta de servicio de funciones debe tener acceso de solo lectura a utet-4387a.
4. Crear el secreto TITULOS_GEMINI_API_KEY y dar acceso a la función si se desea IA remota. Si no, el cliente utilizará generación local de respaldo.
5. Validar pruebas de integración reales con datos anonimizados. Habilitar solo después el modo seguro. En modo seguro no se envía sheetsToken ni se respalda desde el navegador: respaldo remoto queda pendiente de integrar del lado servidor.
6. Tras migrar los cuatro módulos y completar el bloque 6, activar reglas de Firestore restrictivas, incluyendo prohibición de acceso directo a colección ia y datos académicos sin identidad verificada.

El bloqueo de cédula en la interfaz es solo UX. Toda autorización válida proviene de token verificado y matrícula consultada en el backend.

## Cambios de compatibilidad

- El servicio del estudiante admite leer versiones_envio, que antes rechazaba internamente, dejando vacía la cronología.
- Si falla una consulta de Estudiante o matriculas en Firebase legado, la app ya no lo debe presentar como simple "estudiante no encontrado".
- Se conserva la interfaz y los cuatro pasos del formulario.

## Pruebas

Ejecutar: node --test functions/test/*.test.js

Las pruebas con simulaciones no sustituyen una integración real con ambos Firebase, sus reglas ni el provisionamiento Auth.
