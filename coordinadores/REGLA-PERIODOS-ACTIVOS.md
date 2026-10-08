# Corrección: períodos activos en Coordinadores

Se aplica únicamente a **Coordinadores**. La fuente de verdad es el documento
\`configuracion/general\` de \`titulos-ec2fa\`, mantenido por Administración.

- \`periodosActivos\` es la lista autoritativa. Si es \`[]\`, no se muestra **ningún expediente**, aunque \`periodoActivoId\` conserve un valor antiguo.
- Si un documento legacy no contiene el array \`periodosActivos\`, se admite solamente un \`periodoActivoId\` completo. IDs abreviados (\`2026-02\`) o etiquetas no se consideran períodos válidos.
- Un título entra a la lista únicamente si el período completo de ese expediente pertenece a los períodos activos; también debe pertenecer a una carrera asignada.
- Si la configuración no está disponible o Firestore devuelve error, la app no muestra títulos. No hay fallback a mostrar todo.
- En el frontend legado, la lectura de configuración precede la lectura de títulos. Las revisiones intentan releer la configuración antes de guardar.
- El modo seguro aplica la misma validación en el **servidor**, incluida otra lectura transaccional inmediatamente antes de aprobar o devolver. La UI legacy no equivale a una garantía transaccional; para cerrar esa posibilidad se requiere migrar completamente al backend seguro y restringir las escrituras directas con Firestore Rules.
- La pantalla legacy escucha cambios en \`configuracion/general\` y actualiza automáticamente sus filas, sin tener que recargar el navegador.
- Los documentos, sus títulos, sus revisiones y su historial no se eliminan ni modifican al desactivar un período.
- Reactivar el período vuelve a incluir los expedientes correspondientes al actualizar la lista.

Pruebas nuevas en \`functions/test/coordinadores.test.js\` y \`functions/test/coordinadores-periodos-client.test.js\`.

**Despliegue:** el flujo actual se sirve desde GitHub Pages. El backend seguro permanece pendiente de desplegar y activar, como en el bloque 6.
