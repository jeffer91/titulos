# ITSQMET · Persistencia y verificación de PIN de Investigadores

**Implementación en código; no se han cambiado los PIN de usuarios reales.**

## Diagnóstico

- La aplicación heredada guardaba pinHash en Firestore, no el PIN en texto plano.
- La comprobación anterior utilizaba lecturas Firestore normales que podían depender del estado local, sin verificar la revisión de la credencial.
- El acceso podía ser ambiguo si había varios documentos asociados a una misma cédula.
- No había historial dedicado a cambios de PIN que permitiera determinar cuándo fue reemplazado.
- Estas condiciones pueden explicar confirmaciones temporales incorrectas, pero **no demuestran que Firebase borrara un PIN**. La causa exacta de los problemas anteriores requiere inspeccionar los documentos y reglas vigentes.

## Correcciones

1. Administración guarda pinHash, pinActivo, pinCreado, pinRevision, pinHashActualizadoEn y metadatos en UNA transacción Firestore, preservando los demás campos del investigador.
2. La misma transacción escribe un evento de auditoría en workflow_events con identificador, fecha y revisión; NUNCA con PIN ni hash.
3. Tras el guardado, Administración relee el documento directamente del servidor (source:server) y confirma el hash y número de revisión. Si falla la red o las reglas, no anuncia éxito.
4. Investigadores consulta el servidor durante cada nuevo acceso, no utiliza una sesión local desactualizada para validar el PIN.
5. Administración e Investigadores detectan y rechazan duplicados por cédula. Máximo transitorio: 1000 perfiles; después se necesita paginación.
6. Las escrituras genéricas de Administración no pueden sustituir documentos de investigadores ni alterar pinHash/pinRevision; la página de Investigadores no puede escribir en investigadores.
7. El PIN visible deja de mantenerse en una tabla de sesión, pero aparece en el recibo al asignar o restablecerlo.

## Comprobación funcional después de publicar

- En https://jeffer91.github.io/titulos/administradores/administrador.html entrar en Investigadores y elegir el perfil.
- Pulsar Cambiar PIN, Comprobar PIN registrado y, solo si procede, Guardar y verificar.
- Esperar la confirmación del servidor. No cerrar la pantalla antes del resultado.
- En https://jeffer91.github.io/titulos/investigadores/investigador.html ingresar con la cédula vinculada.
- Cerrar y volver a abrir el navegador para verificar la persistencia. Inspeccionar workflow_events y reglas en la consola titulos-ec2fa si hay problemas.

## Limitaciones de seguridad

El modo PIN heredado sigue siendo vulnerable a fuerza bruta porque utiliza un PIN de cuatro cifras y SHA-256 en el navegador. La solución definitiva es activar Firebase Authentication con claims y reglas Firestore. No se publicaron las diez credenciales ni se modificaron los usuarios reales. La auditoría creada ahora no reconstruye modificaciones pasadas y las escrituras de otras aplicaciones siguen necesitando reglas del servidor.
