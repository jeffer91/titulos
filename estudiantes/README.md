# Módulo Estudiantes

Pantalla pública de titulación del ITSQMET.

## Arquitectura vigente

- `utet-4387a`: consulta académica de `Estudiante` y `matriculas`.
- `titulos-ec2fa`: flujo de titulación.
- `firebase.service.js`: consulta de `envios` por cédula en servidor. Ante demora del SDK o ausencia de coincidencia del período, usa REST con cédula e identificación en texto/número, bajo las mismas reglas Firestore.
- `estudiante.repository.js`: datos académicos, configuración y escrituras del proceso. Selecciona el envío compatible con el período académico; los errores nunca se tratan como ausencia de registro.
- `seguimiento.service.js`: presentación del estado cuando ya existe un envío.

## Flujo

`cédula → datos académicos → servicio Firebase de estudiantes → envios → seguimiento o nuevo registro`

El flujo activo no utiliza iframe, `postMessage`, bridge ni buscadores legacy para consultar títulos.

## Ejecución

El módulo funciona como sitio estático mediante GitHub Pages y scripts clásicos, sin React, Vite, Netlify ni Electron.

## Consulta y recuperación (build 20261010-55)

- SDK limitado a 2,2 segundos; alternativa REST limitada a 4,2 segundos, con cancelación.
- La denegación de permisos no activa la alternativa. Una respuesta incompleta tampoco habilita un registro nuevo.
- Watchdog del repositorio de 7 segundos y de la pantalla de 8 segundos.
- Diagnóstico mantiene identidad, período, rutas y tiempo transcurrido; al fallar permite reintentar.
- Los observadores visuales evitan ciclos provocados por sus propias modificaciones.
- Validación automatizada con datos simulados, sin modificar expedientes de Firebase.
