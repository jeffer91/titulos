'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function firstMatch(text, regex, label) {
  const match = text.match(regex);
  assert(match, 'No se pudo detectar versión en ' + label);
  return match[1];
}

const html = read('estudiantes/estudiante.html');
const app = read('estudiantes/js/estudiante.app.js');
const loader = read('estudiantes/estudiante-loader.html');
const index = read('estudiantes/index.html');
const repo = read('estudiantes/js/estudiante.repository.js');
const controller = read('estudiantes/js/estudiante.consulta.controller.js');
const firebaseService = read('estudiantes/js/firebase.service.js');
const runtimeDiag = read('estudiantes/js/diagnostico.runtime.js');
const estudianteCss = read('estudiantes/css/estudiante.css');
const consultaConfig = read('consulta-estado/consulta.config.js');
const consultaApp = read('consulta-estado/consulta.app.js');
const workflow = read('.github/workflows/pages.yml');

const eliminados = [
  'estudiantes/js/consulta-estado.bridge.js',
  'estudiantes/js/seguimiento.lookup.js',
  'estudiantes/js/seguimiento.fast.js',
  'estudiantes/js/seguimiento.compat.js'
];

eliminados.forEach((rel) => {
  assert.strictEqual(exists(rel), false, 'El archivo legacy debe permanecer eliminado: ' + rel);
});

[
  'TAConsultaEstadoBridge',
  'consulta-estado.bridge',
  'seguimiento.lookup',
  'seguimiento.fast',
  'seguimiento.compat'
].forEach((needle) => {
  assert.strictEqual(html.includes(needle), false, 'HTML activo no debe contener ' + needle);
  assert.strictEqual(app.includes(needle), false, 'App activa no debe contener ' + needle);
  assert.strictEqual(repo.includes(needle), false, 'Repository activo no debe contener ' + needle);
});

[
  'buscarEnvioDirectoRapido',
  'buscarEnvioRestPorCedula',
  'buscarEnvioPorCedulaRapido',
  'leerEnvioRest',
  'seleccionarEnvioCompatible'
].forEach((needle) => {
  assert.strictEqual(repo.includes(needle), false, 'Repository no debe recuperar buscador legacy: ' + needle);
});

assert(html.includes('js/diagnostico.runtime.js'), 'Estudiantes debe cargar diagnóstico runtime.');
assert.strictEqual(
  /addEventListener\(\s*['"]keydown['"]/.test(runtimeDiag),
  false,
  'El diagnóstico runtime no debe interceptar F12 ni atajos de DevTools.'
);
assert.strictEqual(
  /addEventListener\(\s*['"]contextmenu['"]/.test(runtimeDiag),
  false,
  'El diagnóstico runtime no debe interceptar el clic derecho.'
);
assert.strictEqual(
  /event\.preventDefault\s*\(/.test(runtimeDiag),
  false,
  'El diagnóstico runtime no debe cancelar acciones nativas del navegador.'
);
assert.strictEqual(
  /event\.stopImmediatePropagation\s*\(/.test(runtimeDiag),
  false,
  'El diagnóstico runtime no debe cortar la propagación de eventos de DevTools.'
);
assert(html.includes('../consulta-estado/consulta.config.js'), 'Estudiantes debe cargar consulta.config.js directamente');
assert(html.includes('../consulta-estado/consulta.service.js'), 'Estudiantes debe cargar consulta.service.js directamente');
assert(
  controller.includes('repository.consultarEnvio'),
  'El controlador debe delegar la lectura optimizada al repository.'
);
assert(
  repo.includes("motor: 'RESOLVER_FLEXIBLE'") &&
  repo.includes("ruta: 'SDK_ID_EXACTO'") &&
  repo.includes("ruta: 'REST_ID_EXACTO'") &&
  repo.includes("ruta: 'SDK_IDENTIDAD'"),
  'Repository debe resolver por SDK/REST exactos y fallback flexible.'
);
assert(
  repo.includes('periodosCandidatos') && repo.includes('puntuarCandidato'),
  'El resolver debe usar contexto académico y puntuar candidatos.'
);
assert(
  firebaseService.includes('function leerDocumentoServidor'),
  'Firebase service debe ofrecer lectura fresca del documento exacto desde servidor.'
);
assert(
  controller.includes('TIMEOUT_TITULOS_MS = 8000') &&
  controller.includes('consultarEstadoTituloRapido(estudiante, repository)'),
  'Paso 3 debe tener watchdog propio y pasar el contexto académico completo.'
);
assert(
  controller.includes('ta:consulta-titulo-ruta') &&
  controller.includes('Copiar diagnóstico') &&
  controller.includes('ERROR FINAL:'),
  'Paso 3 debe mostrar traza en vivo, error final y permitir copiar el diagnóstico.'
);
assert(
  controller.includes('function activarInterfazConsultaLibre') &&
  controller.includes("document.body.classList.add('ta-query-active')") &&
  controller.includes("details.open = true"),
  'La consulta debe mantener la pantalla interactiva y abrir el diagnóstico desde el inicio.'
);
assert(
  estudianteCss.includes('body.ta-query-active .ia-loading-modal') &&
  estudianteCss.includes('pointer-events: none !important') &&
  estudianteCss.includes('#consultaProcesoBloque .consulta-bloque__diagnostico'),
  'CSS debe ocultar overlays de IA y mantener interactivo el diagnóstico durante la consulta.'
);
assert.strictEqual(loader.includes('document.write'), false, 'Loader no debe volver a usar document.write');
assert.strictEqual(html.includes('shared/css/base.css'), false, 'No debe existir referencia al CSS inexistente base.css');

const premium = read('estudiantes/js/seguimiento.premium.js');
assert.strictEqual(
  premium.includes("icon.textContent = 'T'"),
  false,
  'El seguimiento en proceso no debe volver a mostrar la T azul decorativa.'
);

const order = [
  'js/diagnostico.runtime.js',
  '../consulta-estado/consulta.config.js',
  '../consulta-estado/consulta.service.js',
  'js/estudiante.repository.js',
  'js/estudiante.state.js',
  'js/estudiante.consulta.controller.js',
  'js/estudiante.app.js'
];
let previous = -1;
order.forEach((needle) => {
  const current = html.indexOf(needle);
  assert(current > previous, 'Orden de carga incorrecto para ' + needle);
  previous = current;
});

const versions = {
  app: firstMatch(app, /var BUILD = '([^']+)'/, 'estudiante.app.js'),
  loader: firstMatch(loader, /var BUILD = '([^']+)'/, 'estudiante-loader.html'),
  index: firstMatch(index, /build=([^"&<]+)/, 'estudiantes/index.html'),
  consultaConfig: firstMatch(consultaConfig, /version: '([^']+)'/, 'consulta.config.js'),
  consultaApp: firstMatch(consultaApp, /var VERSION = '([^']+)'/, 'consulta.app.js'),
  runtimeDiag: firstMatch(runtimeDiag, /var BUILD = '([^']+)'/, 'diagnostico.runtime.js')
};

const expected = versions.app;
Object.entries(versions).forEach(([name, value]) => {
  assert.strictEqual(value, expected, 'Build inconsistente: ' + name + '=' + value + ', esperado=' + expected);
});

const htmlVersions = Array.from(html.matchAll(/\?v=([0-9-]+)/g)).map((m) => m[1]);
assert(htmlVersions.length > 10, 'Se esperaban múltiples assets versionados en estudiante.html');
htmlVersions.forEach((value) => {
  assert.strictEqual(value, expected, 'Asset de estudiante.html con build distinto: ' + value);
});

assert(
  workflow.includes('node tests/consulta-estado.test.js') &&
  workflow.includes('node tests/arquitectura-estudiantes.test.js'),
  'GitHub Actions debe ejecutar las pruebas de regresión antes de publicar.'
);

console.log('OK arquitectura-estudiantes: resolver flexible paralelo, watchdog y build consistente ' + expected + '.');
