'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

const html = read('investigadores/investigador.html');
const config = read('investigadores/js/app.config.js');
const firebaseConfig = read('investigadores/js/firebase.config.js');
const firebaseService = read('investigadores/js/firebase.service.js');
const repository = read('investigadores/js/investigador.repository.js');
const app = read('investigadores/js/investigador.app.js');
const reportService = read('investigadores/js/reporte-revisiones.service.js');
const pdfService = read('investigadores/js/pdf-revisiones.service.js');
const localVisibility = read('investigadores/css/visibility-fixes.css');

const jsDir = path.join(ROOT, 'investigadores', 'js');
const jsCode = fs.readdirSync(jsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => fs.readFileSync(path.join(jsDir, name), 'utf8'))
  .join('\n');

assert(
  html.includes('js/firebase.config.js') &&
  html.includes('js/firebase.service.js') &&
  html.includes('js/investigador.repository.js') &&
  html.includes('js/investigador.app.js'),
  'Investigadores debe cargar su backend desde su propia carpeta.'
);

[
  '../administradores/',
  '../estudiantes/',
  '../coordinadores/',
  '../shared/'
].forEach((ruta) => {
  assert.strictEqual(
    html.includes(ruta) || jsCode.includes(ruta),
    false,
    'Investigadores no debe importar lógica o recursos de otra app: ' + ruta
  );
});

[
  'TAAdminFirebaseService',
  'TAFirebaseService',
  'TAEstudianteFirebaseService',
  'TACoordinadorFirebaseService'
].forEach((globalName) => {
  assert.strictEqual(
    jsCode.includes(globalName),
    false,
    'Investigadores no debe depender del backend ajeno/global: ' + globalName
  );
});

assert(
  firebaseConfig.includes('window.TA_INVESTIGADORES_FIREBASE_CONFIG'),
  'Investigadores debe tener configuración Firebase propia.'
);

assert(
  config.includes('window.TA_INVESTIGADORES_FIREBASE_CONFIG') &&
  !config.includes('TA_ADMIN_FIREBASE_CONFIG'),
  'app.config de Investigadores debe usar únicamente su propia configuración Firebase.'
);

assert(
  firebaseService.includes('window.TAInvestigadorFirebaseService = Object.freeze') &&
  repository.includes('window.TAInvestigadorFirebaseService') &&
  app.includes('window.TAInvestigadorFirebaseService'),
  'Todo Investigadores debe usar TAInvestigadorFirebaseService.'
);

assert(
  firebaseService.includes("APP_NAME = 'ta-titulos-investigadores'") &&
  firebaseService.includes('window.firebase.firestore(app)'),
  'Investigadores debe usar una instancia Firebase nombrada propia.'
);

assert(
  firebaseService.includes('COLECCIONES_LECTURA') &&
  firebaseService.includes('COLECCIONES_ESCRITURA') &&
  firebaseService.includes('COLECCION_NO_AUTORIZADA_INVESTIGADORES') &&
  firebaseService.includes('ESCRITURA_NO_AUTORIZADA_INVESTIGADORES'),
  'El backend de Investigadores debe limitar explícitamente lectura y escritura.'
);

['investigadores', 'envios', 'configuracion', 'workflow_events'].forEach((collection) => {
  assert(
    firebaseService.includes(collection + ': true'),
    'Debe autorizar la colección requerida: ' + collection
  );
});

assert(
  repository.includes('firebaseService.guardarDocumento') &&
  repository.includes('firebaseService.agregarDocumento') &&
  !repository.includes('.collection('),
  'Repository de Investigadores debe pasar por su backend y no escribir directo en Firestore.'
);

assert(
  html.includes('js/reporte-revisiones.service.js') &&
  html.includes('js/pdf-revisiones.service.js') &&
  html.includes('css/visibility-fixes.css') &&
  reportService.includes('TARevisionReportService') &&
  pdfService.includes('TARevisionPdfService') &&
  localVisibility.length > 100,
  'Reportes, PDF y correcciones visuales deben vivir dentro de Investigadores.'
);

assert(
  app.includes('function errorMensaje') &&
  app.includes("partes.push('[' + codigo + ']'") &&
  app.includes("partes.push('colección ' + String(error.coleccion))"),
  'Los errores de Investigadores deben mostrar código, operación, colección y mensaje.'
);

assert(
  config.includes("version: '1.6.0-backend-investigadores-aislado'"),
  'Debe quedar registrada la versión de aislamiento de Investigadores.'
);

console.log('OK arquitectura-investigadores: backend propio, recursos locales y errores visibles.');
