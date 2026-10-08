'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

const html = read('administradores/administrador.html');
const legacyCoord = read('administradores/coordinadores.html');
const legacyReports = read('administradores/reportes.html');
const config = read('administradores/js/app.config.js');
const firebaseConfig = read('administradores/js/firebase.config.js');
const firebaseService = read('administradores/js/firebase.service.js');
const repository = read('administradores/js/administrador.repository.js');
const app = read('administradores/js/administrador.app.js');
const ajustes = read('administradores/js/ajustes.admin.js');
const reportService = read('administradores/js/reporte-revisiones.service.js');
const pdfService = read('administradores/js/pdf-revisiones.service.js');
const localVisibility = read('administradores/css/visibility-fixes.css');

const jsDir = path.join(ROOT, 'administradores', 'js');
const jsCode = fs.readdirSync(jsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => fs.readFileSync(path.join(jsDir, name), 'utf8'))
  .join('\n');

assert(
  html.includes('js/firebase.config.js') &&
  html.includes('js/firebase.service.js') &&
  html.includes('js/administrador.repository.js') &&
  html.includes('js/administrador.app.js'),
  'Administrador debe cargar su backend desde su propia carpeta.'
);

assert.strictEqual(
  html.includes('../shared/'),
  false,
  'Administrador no debe importar recursos desde shared.'
);

assert.strictEqual(
  legacyCoord.includes('../shared/') || legacyReports.includes('../shared/'),
  false,
  'Las páginas legacy del Administrador tampoco deben depender de shared.'
);

[
  'TAFirebaseService',
  'TAEstudianteFirebaseService',
  'TAInvestigadorFirebaseService',
  'TACoordinadorFirebaseService'
].forEach((globalName) => {
  assert.strictEqual(
    jsCode.includes(globalName),
    false,
    'Administrador no debe depender del backend global/ajeno: ' + globalName
  );
});

assert(
  repository.includes('var firebaseService = window.TAAdminFirebaseService;') &&
  ajustes.includes('var firebaseService = window.TAAdminFirebaseService;'),
  'Repository y Ajustes deben usar exclusivamente TAAdminFirebaseService.'
);

assert(
  firebaseConfig.includes('window.TA_ADMIN_FIREBASE_CONFIG') &&
  firebaseConfig.includes('window.TA_ADMIN_ACADEMICO_FIREBASE_CONFIG'),
  'Administrador debe tener sus dos configuraciones Firebase propias.'
);

assert(
  firebaseService.includes("obtenerOCrearApp('ta-admin-titulos'") &&
  firebaseService.includes("obtenerOCrearApp('ta-admin-academico'"),
  'Administrador debe mantener instancias Firebase nombradas propias para Títulos y Académico.'
);

assert(
  firebaseService.includes('COLECCIONES_TITULOS_LECTURA') &&
  firebaseService.includes('COLECCIONES_TITULOS_ESCRITURA') &&
  firebaseService.includes('COLECCION_NO_AUTORIZADA_ADMIN') &&
  firebaseService.includes('ESCRITURA_NO_AUTORIZADA_ADMIN') &&
  firebaseService.includes('ESCRITURA_ACADEMICA_BLOQUEADA_ADMIN'),
  'Backend Administrador debe limitar colecciones y bloquear escritura académica.'
);

['envios','versiones_envio','configuracion','workflow_events','ia','coordinadores','investigadores','periodos','carreras','resoluciones'].forEach((collection) => {
  assert(
    firebaseService.includes(collection + ': true'),
    'Administrador debe autorizar su colección operativa: ' + collection
  );
});

assert(
  firebaseService.includes('Estudiante: true') &&
  firebaseService.includes('matriculas: true'),
  'Administrador debe reconocer únicamente las colecciones académicas autorizadas.'
);

assert(
  repository.includes("errorBackend.codigo = 'BACKEND_ADMIN_NO_DISPONIBLE'") &&
  !repository.includes('window.TAFirebaseService ||'),
  'Administrador debe fallar claramente si falta su backend propio.'
);

assert(
  app.includes('function obtenerMensaje') &&
  app.includes("partes.push('[' + codigo + ']'") &&
  app.includes("partes.push('colección ' + String(error.coleccion))"),
  'Administrador debe mostrar código, operación, colección y mensaje de error.'
);

assert(
  html.includes('js/reporte-revisiones.service.js') &&
  html.includes('js/pdf-revisiones.service.js') &&
  html.includes('css/visibility-fixes.css') &&
  reportService.includes('TARevisionReportService') &&
  pdfService.includes('TARevisionPdfService') &&
  localVisibility.length > 100,
  'Reportes, PDF y correcciones visuales deben vivir dentro de Administrador.'
);

assert(
  config.includes("version: '1.3.0-backend-administrador-aislado'"),
  'Debe quedar registrada la versión de aislamiento del Administrador.'
);

assert(
  legacyCoord.includes('js/firebase.config.js') &&
  legacyReports.includes('js/firebase.config.js'),
  'Las páginas legacy deben cargar configuración Firebase propia antes del servicio.'
);

console.log('OK arquitectura-administrador: backend dual propio, recursos locales y errores visibles.');
