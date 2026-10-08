# ITSQMET — Bloque 4 de 6: Investigadores

## Nuevo backend independiente

Se incorporó `investigadoresApi` con código exclusivo en `functions/services/investigadores.js` y `functions/services/investigadores.revision.js`.

- `GET /perfil`: comprueba token Firebase Auth, rol investigador y correspondencia del UID con el documento de investigadores; permite vinculación por email verificado y único como alternativa cuando no hay `authUid`. No devuelve `pinHash`.
- `GET /cola`: consulta `envios` mediante campos de carrera, sin descargar toda la base; atiende diversos períodos por orden de validación de Coordinación.
- `GET /revisados`: historial propio por identificadores del investigador en `revisionInvestigador`, independientemente de una posterior reasignación de carrera; no presenta expedientes de otra persona.
- `POST /revision`: valida sesión, acceso activo, carrera exacta, validación previa de Coordinación y expediente aún pendiente. Soporta APROBAR, APROBAR_OBSERVACION y DEVOLVER. Guarda decisión y evento de auditoría en una única transacción con nueva lectura del perfil para detectar permisos revocados.

La comparación de carreras no concede acceso por palabras parciales ni comodines. Las respuestas solo contienen campos de negocio necesarios: se excluye el hash del PIN.

## PIN antiguo y modo de compatibilidad

El PIN que se comprueba mediante JavaScript y SHA-256 no se considera una autenticación fuerte. El nuevo modo requiere Firebase Auth y verifica el vínculo `authUid` o correo verificado. Además exige `pinActivo: true` **solo como permiso administrativo heredado**, no como prueba de identidad.

**El modo nuevo sigue desactivado**: `investigadores/js/secure.config.js` tiene `habilitado: false`. Se conservan temporalmente los formularios y el flujo PIN anteriores para no interrumpir las defensas y revisiones. No se han desplegado funciones en Firebase, cambiado sus reglas ni alterado registros reales. En consecuencia el acceso directo anterior sigue dependiendo de reglas Firestore aún no verificadas.

## Antes de activar

1. Provisionar cada investigador en Firebase Authentication de `titulos-ec2fa`, con email/contraseña sin registro público libre. Asignar mediante Firebase Admin SDK el claim de rol `roles: ['investigador']`.
2. Vincular documento `investigadores` con su `authUid`, o verificar un email institucional único; confirmar `activo`, `pinActivo` y carreras autorizadas.
3. Revisar nombres/códigos de carrera reales e índices Firestore. Consultas iguales a nombre/código deben coincidir con los valores guardados.
4. Desplegar `investigadoresApi` en Cloud Functions v2 y probar el acceso con dos investigadores de carreras diferentes y una cuenta suspendida.
5. Garantizar que el cliente Electron, si se utiliza, tiene un origen y estrategia Auth seguros; no habilitar genéricamente `Origin: null`.
6. Controlar paginación cuando las respuestas estén marcadas `truncado`: las consultas de cola se limitan temporalmente a 400 por campo y carrera, y las de revisiones a 500 por criterio.
7. Finalizar los bloques 5 y 6 para bloquear escrituras y lecturas directas desde los SDK del navegador mediante reglas reales de Firestore.

## Pruebas

`node --test functions/test/investigadores.test.js`

Las pruebas simulan Firestore y validan roles, perfiles activos, carreras, múltiples períodos, orden FIFO, auditoría y protección frente a revisiones ajenas/repetidas. No sustituyen la validación real con dos bases y Firebase Emulator.

## Posible incompatibilidad de datos antiguos

Si un expediente aprobado anteriormente carece de `revisionInvestigador.investigadorId`, `investigadorCedula` y `investigadorEmail`, el backend nuevo no puede atribuirlo automáticamente a una cuenta; hay que normalizar el dato antes de activar la consulta histórica.
