# Bloque 2 de 6 · Investigadores y persistencia de PIN

## Cambios de código

- El PIN permanece en el documento \`investigadores/<id>\` como \`pinHash\`, \`pinRevision\` y fechas. No se guardan PIN reales ni claves en el repositorio.
- Administración guarda el hash y un evento de auditoría en una transacción; solo confirma al leer del servidor.
- Los cambios de PIN exigen la revisión actual: un modal abierto antes de otro cambio no puede sobrescribir el PIN nuevo sin actualizar.
- Cambiar un PIN ya no reactiva una cuenta con \`activo:false\` o \`pinActivo:false\`. La activación y desactivación se hace por separado mediante transacción + evento en \`workflow_events\`.
- Los métodos genéricos de Administración bloquean crear, reemplazar, actualizar, eliminar por documento o por lote perfiles en \`investigadores\`. Solo los métodos transaccionales de credenciales y acceso pueden cambiarlos desde este cliente.
- Investigadores autentica buscando exclusivamente la cédula por documento y consultas indexables sobre \`cedula\`, \`identificacion\` o \`numeroIdentificacion\`, en vez de listar hasta 1001 perfiles y traer hashes ajenos. Detecta discrepancias y duplicados.
- La creación y el cambio de estado del Investigador en modo API seguro usan \`crearInvestigador\` e \`investigadorEstado\`, sin exigir ni ofrecer PIN; no se activó el modo seguro porque las credenciales Auth y las reglas reales aún necesitan despliegue.
- Se incrementa la versión de scripts para invalidar cachés del navegador.

## Cómo comprobar

1. Desde Administrador > Investigadores, selecciona un perfil activo.
2. Verifica el PIN registrado; si no coincide, guarda uno nuevo y espera confirmación.
3. Cierra y vuelve a abrir Investigadores; entra con la misma cédula y PIN.
4. Desactiva el acceso desde Administración y cambia el PIN; debe continuar desactivado hasta pulsar **Reactivar**.
5. Si aparece un mensaje sobre registros duplicados o revisiones desactualizadas, **no borres documentos a ciegas**: audita la cédula y el documento real de Firebase.
6. Los PIN antiguos que fueron expuestos en un chat deben renovarse por canales seguros.

## Límites

**No se han actualizado en Firebase los PIN reales de las personas.** Las pruebas de GitHub Actions usan datos simulados. La API segura todavía no está desplegada ni activada; la persistencia final y las reglas Firestore de producción deberán comprobarse en el bloque 6. El esquema de PIN de cuatro cifras y hash SHA-256 en cliente sigue siendo una solución heredada débil. No representa autenticación robusta frente a ataques; la solución final es Firebase Auth, reglas cerradas y validación servidor.
