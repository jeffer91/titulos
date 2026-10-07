# Módulo Estudiantes

Pantalla pública de titulación del ITSQMET.

## Arquitectura vigente

- `utet-4387a`: consulta académica de `Estudiante` y `matriculas`.
- `titulos-ec2fa`: flujo de titulación.
- `/consulta-estado/consulta.service.js`: único motor autorizado para localizar registros en `envios`.
- `estudiante.repository.js`: datos académicos, configuración y escrituras del proceso. No contiene un segundo buscador de envíos.
- `seguimiento.service.js`: presentación del estado cuando ya existe un envío.

## Flujo

`cédula → datos académicos → consulta-estado → envios → seguimiento o nuevo registro`

El flujo activo no utiliza iframe, `postMessage`, bridge ni buscadores legacy para consultar títulos.

## Ejecución

El módulo funciona como sitio estático mediante GitHub Pages y scripts clásicos, sin React, Vite, Netlify ni Electron.
