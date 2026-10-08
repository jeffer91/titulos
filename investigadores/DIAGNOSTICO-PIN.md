# Diagnóstico de acceso por PIN — Investigadores

## Problema reportado

El formulario devuelve `PIN incorrecto` cuando el hash SHA-256 del PIN introducido no coincide con `investigadores/<id>.pinHash`. Las dos pantallas usan el mismo cálculo: SHA-256 de la cadena `titulos-investigador-v1|<cedula>|<pin>`. **No se han cargado PINs reales en el código, las pruebas ni en GitHub**.

Se corrigió un error de ejecución del módulo de Investigadores de Administración: invocaba `modoSeguro()` sin definirlo, de modo que sus botones podían quedar sin inicializar.

## Comprobar un acceso SIN modificarlo

1. Abre `https://jeffer91.github.io/titulos/administradores/administrador.html`.
2. Entra en **Investigadores**, localiza a la persona por su cédula y pulsa **Cambiar PIN**.
3. Escribe temporalmente el PIN que se desea comprobar y pulsa **Comprobar PIN registrado**. Esta acción vuelve a consultar el documento en Firebase; no guarda el PIN y no modifica ningún registro.
4. Si responde **NO coincide**, el hash guardado no corresponde al PIN probado. Pulsa **Guardar y verificar** para reemplazar el PIN de esa persona, si tienes autorización administrativa.
5. Si responde que **coincide, pero el acceso está desactivado**, hay que activar el acceso en la tabla de Investigadores, no cambiar el PIN.
6. Si indica que **la cédula no corresponde al registro**, revisa el documento y los duplicados antes de modificar nada.
7. Vuelve a la pantalla `https://jeffer91.github.io/titulos/investigadores/investigador.html`, actualiza la página y prueba de nuevo con los datos autorizados.

**Importante:** ninguna de estas acciones se ejecuta al actualizar el código GitHub. La versión guardada de los PINs permanece en Firestore hasta que una persona autorizada los compruebe y, si procede, restablezca. El código no conoce los PINs compartidos en esta conversación.

## Seguridad y límites

El flujo heredado con PIN de 4 dígitos y SHA-256 client-side es débil frente a ataques por fuerza bruta, y el frontend legacy depende de reglas Firestore todavía no verificadas. La solución de producción es migrar a Firebase Authentication, claims de investigador y backend seguro, y restringir lecturas/escrituras directas del SDK. No usar PINs como alternativa permanente.

Las pruebas añadidas usan **identidades y PINs ficticios**, sin consultar Firestore real. No sustituir el dato de producción sin validar la identidad de cada investigador.
