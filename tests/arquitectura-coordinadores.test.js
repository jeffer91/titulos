'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

const html = read('coordinadores/coordinador.html');
const revisionHtml = read('coordinadores/revision.html');
const config = read('coordinadores/js/app.config.js');
const firebaseConfig = read('coordinadores/js/firebase.config.js');
const firebaseService = read('coordinadores/js/firebase.service.js');
const repository = read('coordinadores/js/coordinador.repository.js');
const app = read('coordinadores/js/coordinador.app.js');
const revisionService = read('coordinadores/js/revision.service.js');
const revisionApp = read('coordinadores/js/revision.app.js');

const jsDir = path.join(ROOT, 'coordinadores', 'js');
const jsCode = fs.readdirSync(jsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => fs.readFileSync(path.join(jsDir, name), 'utf8'))
  .join('\n');

assert(
  html.includes('js/firebase.config.js') &&
  html.includes('js/firebase.service.js') &&
  html.includes('js/coordinador.repository.js') &&
  html.includes('js/coordinador.app.js'),
  'Coordinadores debe cargar su backend desde su propia carpeta.'
);

[
  '../administradores/',
  '../investigadores/',
  '../estudiantes/',
  '../shared/'
].forEach((ruta) => {
  assert.strictEqual(
    html.includes(ruta) || jsCode.includes(ruta),
    false,
    'Coordinadores no debe importar lógica de otra app: ' + ruta
  );
});

[
  'TAFirebaseService',
  'TAAdminFirebaseService',
  'TAEstudianteFirebaseService',
  'TAInvestigadorFirebaseService'
].forEach((globalName) => {
  assert.strictEqual(
    jsCode.includes(globalName),
    false,
    'Coordinadores no debe depender del backend ajeno/global: ' + globalName
  );
});

assert(
  firebaseConfig.includes('TA_COORDINADORES_FIREBASE_CONFIG'),
  'Coordinadores debe tener configuración Firebase propia.'
);

assert(
  firebaseService.includes('window.TACoordinadorFirebaseService = Object.freeze') &&
  repository.includes('window.TACoordinadorFirebaseService') &&
  revisionService.includes('window.TACoordinadorFirebaseService') &&
  revisionApp.includes('window.TACoordinadorFirebaseService') &&
  app.includes('window.TACoordinadorFirebaseService'),
  'Todo Coordinadores debe usar TACoordinadorFirebaseService.'
);

assert(
  firebaseService.includes("APP_NAME = 'ta-titulos-coordinadores'") &&
  firebaseService.includes('window.firebase.firestore(app)'),
  'Coordinadores debe usar una instancia Firebase nombrada propia.'
);

assert(
  firebaseService.includes('COLECCIONES_LECTURA') &&
  firebaseService.includes('COLECCIONES_ESCRITURA') &&
  firebaseService.includes('COLECCION_NO_AUTORIZADA_COORDINADORES') &&
  firebaseService.includes('ESCRITURA_NO_AUTORIZADA_COORDINADORES'),
  'El backend de Coordinadores debe limitar lectura y escritura por colección.'
);

['envios', 'versiones_envio', 'configuracion', 'workflow_events', 'coordinadores'].forEach((collection) => {
  assert(firebaseService.includes(collection + ': true'), 'Debe autorizar lectura de ' + collection + '.');
});

assert(
  revisionService.includes('firebaseService.guardarDocumento') &&
  revisionService.includes('firebaseService.agregarDocumento') &&
  !revisionService.includes('.collection('),
  'La revisión debe pasar por el backend propio y no escribir directo en Firestore.'
);

assert(
  app.includes("partes.push('[' + codigo + ']'") &&
  app.includes("partes.push('colección ' + String(error.coleccion))"),
  'La interfaz principal debe mostrar código y colección cuando falla Firebase.'
);

assert(
  revisionApp.includes("partes.push('[' + codigo + ']'") &&
  revisionApp.includes("partes.push('colección ' + String(error.coleccion))"),
  'La pantalla legacy de revisión también debe mostrar error técnico.'
);

assert(
  config.includes("version: '4.3.0-backend-coordinadores-aislado'"),
  'Debe quedar registrada la versión de aislamiento de Coordinadores.'
);

assert(
  revisionHtml.includes('url=coordinador.html'),
  'revision.html debe redirigir al flujo integrado de Coordinadores.'
);

console.log('OK arquitectura-coordinadores: backend propio, colecciones aisladas y errores visibles.');
