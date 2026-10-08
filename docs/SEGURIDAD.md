# Auditoría de seguridad del sistema ITSQMET

## Bloque 1 / 6

Se prepara backend con cuatro Cloud Functions v2 aisladas por rol y Firebase Auth verificado en servidor. Ver functions/README.md y functions/test para pruebas concretas.

### Estado real de la seguridad
- El cliente aún usa Firebase SDK directamente en los cuatro módulos. Sus listas permitidas de colecciones NO son políticas de acceso.
- El PIN de Investigadores se validaba en navegador, incluyendo reactivación de acceso. Se corrigió la reactivación y se bloqueó la revisión de expedientes sin carrera asignada; falta reemplazar el mecanismo por Auth.
- Los secretos de proveedores IA y tokens de integraciones aún se manejan en frontend. Migrar a Secret Manager en bloques 2 y 5.
- Las reglas efectivas de las bases titulos-ec2fa y utet-4387a no están accesibles en esta auditoría, y NO se han desplegado ni modificado. El ejemplo firestore.rules.example deniega por defecto y no se debe desplegar todavía.
- Las cuatro Functions nuevas todavía no han sido desplegadas ni tienen operaciones de datos. No protegen por sí solas el SDK antiguo.

### Requisitos para el cierre
1. Estudiantes: identidad o mecanismo verificable, consultas mínimas por cédula y período, secretos IA fuera del navegador.
2. Coordinadores: permiso de carrera comprobado en servidor, escrituras y registros transaccionales.
3. Investigadores: sesiones seguras Firebase Auth, colas filtradas y permisos de expediente.
4. Administrador: acceso autenticado, gestión de claves y de permisos desde backend.
5. Desplegar reglas Firestore restrictivas SOLO después de migrar los cuatro módulos y probar Firebase Emulator.
6. Verificar IAM y que utet-4387a sea sólo lectura desde la aplicación de titulación.

Si se ha compartido una clave privada de una cuenta de servicio, revocarla y rotarla en Google Cloud IAM. Un apiKey Web SDK público no es equivalente a una private_key de service_account.
