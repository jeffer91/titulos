# Módulo Investigadores

Segunda etapa de revisión del Sistema de Títulos Académicos.

## Flujo de acceso

1. Administración registra previamente al investigador por cédula.
2. En el primer ingreso el investigador crea un PIN de 4 a 8 dígitos.
3. El PIN queda pendiente y no permite entrar.
4. Administración activa el PIN desde `administradores/administrador.html#investigadores`.
5. En los siguientes ingresos se valida cédula + PIN.

El PIN no se guarda como texto: el navegador calcula un hash SHA-256 antes de almacenarlo.

## Regla de revisión

El investigador solo puede listar y revisar títulos que ya tengan una primera revisión de Coordinación con estado `APROBADO` o `APROBADO_CON_OBSERVACION`.

La segunda revisión se guarda de forma separada en `revisionInvestigador` y `estadoInvestigador`, sin borrar la revisión previa de Coordinación.
