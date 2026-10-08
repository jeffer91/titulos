# Bloque 3 — Coordinadores ITSQMET

## API segura añadida

El backend de Coordinadores reside en functions/services/coordinadores.js y se expone exclusivamente por coordinadoresApi del proyecto titulos-ec2fa.

- GET /perfil: el servidor obtiene al coordinador desde el UID de Firebase Auth vinculado al documento coordinadores, o por correo institucional verificado y único si no existe authUid.
- GET /titulos: consulta exclusivamente por nombres o códigos de carreras asignadas, usando filtros en Firestore. No descarga toda la colección envios para filtrar en el navegador.
- GET /historial?tituloId: valida que el título sea de una carrera asignada y solo entonces obtiene versiones y eventos.
- POST /revision: valida identidad, carrera asignada, estado pendiente y número de título; registra la decisión y el evento workflow_events en una sola transacción, sin aceptar como identidad un coordinador enviado por el navegador.

Se elimina en el backend la autorización mediante coincidencia parcial de nombres de carreras. No se conceden permisos con comodines, ni por ausencia de carreras. Las asignaciones vigentes se vuelven a leer al guardar cada revisión.

## Activación gradual — MUY IMPORTANTE

Por ahora coordinadores/js/secure.config.js tiene habilitado: false. Se mantiene el sistema anterior para no interrumpir la operación institucional. No se han desplegado funciones en Firebase ni cambiado reglas de Firestore. Por ello el sistema antiguo puede continuar con permisos inseguros hasta finalizar la migración.

Al habilitar el modo seguro, el frontend muestra acceso Firebase Authentication por correo/contraseña; el desplegable solo muestra al coordinador que corresponde a la sesión.

## Requisitos de activación

1. Crear o vincular cuentas Firebase Authentication del personal y asignar desde un proceso administrativo de confianza el custom claim roles: ['coordinador'].
2. Añadir el campo authUid a cada documento real de coordinadores, o confirmar su correo verificado, único y en minúsculas en el documento. Las cuentas no se pueden registrar libremente.
3. Comprobar con datos reales los campos de carrera usados en envios: carreraNombre, carrera, nombreCarrera, carreraCodigo, codigoCarrera. Los nombres/códigos deben ser exactamente equivalentes a los asignados al coordinador; de lo contrario habrá que normalizar esos datos o añadir identificadores estables.
4. Desplegar Cloud Functions v2, revisar facturación y autenticación, y probar en entorno de pruebas con dos coordinadores de carreras diferentes.
5. Atender paginación: cada combinación campo/carrera tiene un límite temporal de 500 resultados. La respuesta señala truncado si se alcanza el límite. Corregir esta limitación antes de operar carreras de alto volumen.
6. El instalador Electron que use file:// deberá tener una estrategia de origen/autenticación segura; no se permite Origin: null.
7. Una vez migrados los cuatro módulos, aplicar reglas reales de Firestore que impidan consultas y escrituras directas desde el navegador (bloque 6).

El backend está separado, pero la seguridad de producción no se considera terminada hasta activar identidades, desplegar Functions y restringir Firestore.

## Pruebas

node --test functions/test/coordinadores.test.js

Incluyen acceso cruzado entre carreras, suplantación, cuentas deshabilitadas, revisión atómica, devolución y corrección de títulos.
