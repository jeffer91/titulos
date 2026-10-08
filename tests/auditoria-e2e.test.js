'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'auditoria-estudiantes', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'auditoria-estudiantes', 'auditoria.js'), 'utf8');

assert(html.includes('auditoria_envios'), 'La auditoría debe declarar auditoria_envios.');
assert(html.includes('auditoria_eventos'), 'La auditoría debe declarar auditoria_eventos.');
assert(js.includes("var COL_ENV = 'auditoria_envios';"), 'Debe usar colección aislada de envíos.');
assert(js.includes("var COL_EVT = 'auditoria_eventos';"), 'Debe usar colección aislada de eventos.');

[
  'PENDIENTE_COORDINADOR',
  'PENDIENTE_INVESTIGADOR',
  'APROBADO_FINAL',
  "estadoCoordinador: 'VALIDADO'",
  "estadoInvestigador: 'APROBADO'"
].forEach((needle) => {
  assert(js.includes(needle), 'Falta transición crítica de auditoría: ' + needle);
});

[
  'paso1CrearEnvio',
  'paso2ConsultarEstudiante',
  'paso3ValidarCoordinacion',
  'paso4VerificarInvestigacion',
  'paso5AprobarInvestigacion',
  'paso6ConsultarFinal',
  'paso7Limpiar'
].forEach((fn) => {
  assert(js.includes('function ' + fn + '('), 'Falta paso E2E: ' + fn);
});

assert.strictEqual(
  /guardarDocumento\(\s*['"]envios['"]/.test(js),
  false,
  'La auditoría no debe escribir en la colección productiva envios.'
);
assert.strictEqual(
  /guardarDocumento\(\s*['"]Estudiante['"]/.test(js),
  false,
  'La auditoría no debe escribir en Estudiante.'
);
assert.strictEqual(
  /guardarDocumento\(\s*['"]matriculas['"]/.test(js),
  false,
  'La auditoría no debe escribir en matriculas.'
);

const stepButtons = (html.match(/data-run-step="/g) || []).length;
assert.strictEqual(stepButtons, 7, 'Debe existir un botón de ejecución por cada paso.');

assert(
  js.includes('leerPorRestAislado(COL_ENV, audit.docId)'),
  'La auditoría debe validar la lectura del estudiante por REST en la colección aislada.'
);
assert(
  js.includes("consultarColeccion(COL_ENV, 'estadoProceso', '==', 'PENDIENTE_INVESTIGADOR'"),
  'La auditoría debe comprobar la llegada a la cola de Investigación.'
);

console.log('OK auditoria-e2e: flujo aislado de 7 pasos y sin escrituras productivas.');
