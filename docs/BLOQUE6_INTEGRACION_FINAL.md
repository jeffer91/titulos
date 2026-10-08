# ITSQMET — Bloque 6 de 6: integración y seguridad

Fecha de auditoría del código: 8 de octubre de 2026.

## Estado verificado

**Los cuatro backends están programados y sus pruebas pueden ejecutarse desde GitHub; no están desplegados ni activados en Firebase.** Los cuatro archivos de configuración segura mantienen habilitado:false deliberadamente. GitHub Pages solo publica archivos estáticos; publicar la web no despliega Cloud Functions ni cambia reglas Firestore.

| Perfil | Backend propio | Alcance de API preparada |
| --- | --- | --- |
| Estudiantes | estudiantesApi | Sesión, expediente por cédula verificada y período, configuración sin secretos, envío atómico de tres títulos, historial, IA con secreto servidor |
| Coordinadores | coordinadoresApi | Sesión, perfil, cola por carreras asignadas, historial autorizado, revisión atómica |
| Investigadores | investigadoresApi | Sesión, perfil, cola multiperíodo FIFO, mis revisiones, aprobación/devolución atómica |
| Administrador | administradoresApi | Sesión, configuración permitida, períodos, carreras, perfiles, asignaciones, datos académicos y títulos de solo lectura, reportes, archivar intento con auditoría |

Los nuevos envíos contienen carreraClave normalizada para localizar títulos independientemente de tildes y mayúsculas. Las consultas históricas conservan variantes exactas; no se concede acceso por coincidencia parcial de carreras.

## Riesgos encontrados y mitigaciones preparadas

1. **El entorno real continúa en modo legado.** No se puede afirmar que está protegido hasta habilitar Firebase Auth y reglas reales.
2. **Una cuenta de servicio divulgada requiere revocación de su clave**, no solo eliminar el texto del chat o del repositorio. No cargar JSON privados de servicio en GitHub. Cambiar también secretos que puedan haberse almacenado en documentos IA o Sheets. Las apiKey públicas del Web SDK Firebase no equivalen a claves privadas de servicio.
3. **La base académica utet-4387a es compartida.** Restringir directamente Estudiante o matriculas puede afectar otras aplicaciones. No desplegar los fragmentos de ejemplo sin auditar propietarios y reglas vigentes.
4. **Reglas superpuestas:** añadir allow false a una colección no elimina un permiso allow true de una regla global. Revisar las reglas completas, incluyendo comodines. Los ejemplos de seguridad/propuesta-*.rules.txt son fragmentos NO DESPLEGABLES.
5. **Firebase Auth:** el administrador inicial debe provisionarse fuera del navegador. El API de roles no crea otro administrador y no permite asignar rol estudiante sin verificación de identidad académica. La asignación de roles operativos exige perfil institucional existente, activo y vinculado.
6. **Control del registro académico:** las Functions deben tener permisos mínimos de lectura en utet-4387a, concedidos a su identidad de ejecución de titulos-ec2fa. No dar rol de propietario o escritura en académico.
7. **Cuentas y claves IA:** almacenar TITULOS_GEMINI_API_KEY exclusivamente en Google Secret Manager; el administrador no debe introducir claves en Firestore desde el modo seguro.
8. **Históricos y límites:** las consultas administrativas paginan hasta 5000 registros y rechazan exceso en lugar de presentar totales falsamente completos. Las colas de investigadores/coordinadores requieren paginación adicional si se alcanza el aviso de truncado. Normalizar asignaciones de carrera y documentos antiguos sin identificadores de revisión.
9. **Funciones que requieren extensión antes de producción:** respaldo a Google Sheets desde servidor, normalización masiva, cambio seguro y prueba de otros proveedores IA, depuración/recuperación de credenciales anteriores. Permanecen bloqueadas en modo seguro, nunca se abren lecturas directas para compensarlo.

## Plan de activación sin afectar otras aplicaciones

### Etapa 1 — Preparación / staging

- Exportar copias de seguridad de Firestore y conservar las reglas actuales de ambos proyectos.
- Inventariar las aplicaciones que usan titulos-ec2fa y utet-4387a; identificar cuáles necesitan seguir leyendo académicos desde SDK.
- Crear los cuatro usuarios de prueba en Firebase Authentication de titulos-ec2fa; asignar claims roles, vincular authUid y, para estudiantes, cedula tras comprobar identidad y matrícula.
- Configurar lectura IAM al proyecto académico y acceso Secret Manager solo a la función necesaria.
- Desplegar únicamente Functions del codebase titulos-seguro en titulos-ec2fa, sin publicar reglas generales: ejemplo, una vez verificado CLI y proyecto:
  firebase deploy --only functions:titulos-seguro --project titulos-ec2fa
- Verificar las URLs reales de Functions antes de modificar apiBase en los cuatro frontends.

### Etapa 2 — Pruebas con cuentas reales

- Ejecutar en el repositorio: node --test functions/test/*.test.js
- Usar el script manual scripts/verificar-apis.mjs con variables API_BASE, TOKEN_ESTUDIANTE, TOKEN_COORDINADOR, TOKEN_INVESTIGADOR, TOKEN_ADMINISTRADOR. No guardar ni imprimir tokens en reportes.
- Confirmar 4 inicios de sesión, 12 intentos de acceso a módulos ajenos denegados, origen CORS esperado y rechazo de cédula falsa.
- Realizar prueba funcional completa en datos ficticios: estudiante envía tres títulos -> coordinador valida/devuelve -> investigador resuelve -> administrador ve resultado, auditoría y versiones.
- Comprobar errores de red, falta de IAM académico, sesión revocada, usuario sin carrera, duplicados, doble revisión, período antiguo, retorno de revisión y cuotas IA.
- Ejecutar pruebas con Firebase Emulator o un entorno de staging. Los tests automáticos incluidos usan dobles de Firestore y NO sustituyen la integración real.

### Etapa 3 — Migración controlada y reglas

- Acordar con responsables de otras apps qué accesos a Estudiante y matriculas deben seguir funcionando. Diseñar la política final del archivo de reglas COMPLETO por proyecto; comprobar que ninguna regla de alcance más amplio vuelve a permitir acceso indebido.
- Aprobar ventana de cambio y procedimiento de reversión de código y reglas.
- Conectar cada módulo cambiando su propio secure.config.js a habilitado:true solo después de probar su API y su cuenta. Probar uno por uno con sesión real, incluidos reportes y respuestas de error.
- Una vez confirmadas las cuatro migraciones, retirar accesos Firestore directos del navegador donde ya exista backend, desplegar reglas revisadas y volver a probar otras apps.
- Rotar/eliminar secretos antiguos; revisar logs; verificar exportación y restauración de respaldo.

## Criterio de cierre

Se puede marcar el código del bloque 6 como implementado cuando GitHub Actions apruebe sintaxis, flujos previos, pruebas por rol y pruebas de integración simulada.

La **migración de producción no queda cerrada** hasta disponer de evidencia de despliegue Firebase, identidad y claims verificados, permisos IAM, reglas reales no disruptivas, cuatro módulos activos, pruebas con Firebase real y revocación de secretos comprometidos. No ejecutar cambios a los proyectos compartidos solo para obtener un resultado de pruebas verde.

Referencias oficiales Firebase: documentación sobre codebases de Functions, despliegues parciales CLI y superposición de reglas Firestore.
