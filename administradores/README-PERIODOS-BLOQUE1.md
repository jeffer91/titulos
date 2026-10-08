# Bloque 1 de 6 — Períodos académicos

Corrección de código, publicada en GitHub Pages. **No modifica ni borra documentos académicos, expedientes o períodos en Firestore por sí sola.**

## Regla institucional

- El campo \`configuracion/general.periodosActivos\` es la fuente de verdad cuando es un arreglo, incluso si está vacío.
- \`periodoActivoId\` solo se considera como compatibilidad cuando el documento **no tiene** el arreglo \`periodosActivos\` y no marca \`periodoActivoDesactivado\`.
- Se reconocen IDs completos \`AAAA-MM__AAAA-MM\` (ejemplo: \`2026-02__2026-08\`); identificadores parciales como \`2026-02\` y etiquetas no se interpretan como períodos, ni activan nada.
- El panel deduplica el catálogo por ID canónico y construye las etiquetas desde las fechas del ID. No infiere períodos a partir de etiquetas incorrectas.
- Activar/desactivar en Administración se realiza **en una transacción** que vuelve a leer la lista actual y guarda los IDs activos, ID principal, etiquetas y evento de auditoría conjuntamente. Eso evita que una operación recupere un período desactivado debido a un valor principal obsoleto.
- La API segura \`administradoresApi\` ofrece \`POST /periodos/estado\` con la misma regla. Solo operará cuando las Cloud Functions y la autenticación estén desplegadas y activadas.
- Coordinadores (frontend y backend) continúan filtrando expedientes por período activo. Los registros de períodos desactivados permanecen almacenados; simplemente no se presentan para nuevas revisiones.
- Inicio mantiene la consulta histórica de los períodos desactivados, identificándolos claramente; el cálculo de pendientes activos ignora todos los períodos desactivados.

## Alcance y límites

No se eliminan documentos \`periodos\` con IDs anteriores; el panel simplemente omite IDs abreviados del catálogo. Una migración destructiva de documentos históricos debe realizarse separadamente y solo tras copia de seguridad.

**Advertencia:** la interfaz actual sigue usando Firestore de forma directa. Las transacciones del navegador dependen de las reglas reales de Firebase, todavía no verificadas. La solución completa de seguridad requiere activar backend Auth + permisos y revisar las reglas compartidas.

Pruebas: \`functions/test/administradores.test.js\`, \`functions/test/periodos-admin-client.test.js\`, \`functions/test/coordinadores.test.js\` y \`functions/test/coordinadores-periodos-client.test.js\`.
