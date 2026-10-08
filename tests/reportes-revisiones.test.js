'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

const serviceCode = read('shared/js/reporte-revisiones.service.js');
const pdfCode = read('shared/js/pdf-revisiones.service.js');
const invServiceCode = read('investigadores/js/reporte-revisiones.service.js');
const invPdfCode = read('investigadores/js/pdf-revisiones.service.js');
const invHtml = read('investigadores/investigador.html');
const invRepo = read('investigadores/js/investigador.repository.js');
const invApp = read('investigadores/js/investigador.app.js');
const adminHtml = read('administradores/administrador.html');
const adminApp = read('administradores/js/administrador.app.js');
const adminRepo = read('administradores/js/administrador.repository.js');
const adminReports = read('administradores/js/reportes.revisiones.admin.js');

assert(invHtml.includes('id="panelRevisados"'), 'Investigadores debe tener panel Mis revisiones.');
assert(invHtml.includes('id="btnDescargarRevisadosPdf"'), 'Investigadores debe permitir descargar PDF.');
assert(invRepo.includes('function listarRevisadosPorInvestigador'), 'Repository investigador debe exponer historial propio.');
assert(invApp.includes('function descargarRevisionesPdf'), 'App investigador debe generar PDF.');
assert(invServiceCode.includes('TARevisionReportService'), 'Investigadores debe tener motor de reportes local.');
assert(invPdfCode.includes('TARevisionPdfService'), 'Investigadores debe tener motor PDF local.');
assert(adminHtml.includes('data-admin-tab="reportes"'), 'Administrador debe tener Reportes en sidebar.');
assert(adminHtml.includes('id="panelReportes"'), 'Administrador debe tener panel Reportes.');
assert(adminHtml.includes('id="btnDescargarReportesRevisionPdf"'), 'Administrador debe descargar PDF.');
assert(adminApp.includes('reportes: window.TAAdminReportesRevision'), 'Administrador debe registrar módulo Reportes.');
assert(adminRepo.includes('function listarRevisionesInvestigacion'), 'Repository administrador debe listar revisiones.');
assert(adminReports.includes('function descargarPdf'), 'Módulo administrador debe generar PDF.');
assert(pdfCode.includes("doc.save(filename)"), 'Servicio PDF debe descargar archivo real.');
assert(pdfCode.includes("REPORTE"), 'Servicio PDF debe construir reporte institucional.');

const context = {
  console,
  Date,
  Intl,
  Object,
  Array,
  Number,
  String,
  RegExp,
  window: {}
};
vm.createContext(context);
vm.runInContext(serviceCode, context, { filename: 'reporte-revisiones.service.js' });

const service = context.window.TARevisionReportService;
assert(service, 'Debe exponerse TARevisionReportService.');

const docs = [
  {
    id: '2026-04__2026-09__1111111111',
    cedula: '1111111111',
    nombres: 'ESTUDIANTE UNO',
    carrera: 'EDUCACIÓN BÁSICA',
    periodoId: '2026-04__2026-09',
    estado: 'APROBADO_FINAL',
    estadoProceso: 'APROBADO_FINAL',
    estadoInvestigador: 'APROBADO',
    investigacionRevisada: true,
    tituloFinal: 'Título aprobado uno',
    revisionInvestigador: {
      estado: 'APROBADO',
      investigadorId: 'INV-1',
      investigadorCedula: '9999999999',
      investigadorNombre: 'INVESTIGADOR UNO',
      fechaLocal: '2026-10-08T10:00:00.000Z'
    }
  },
  {
    id: '2026-04__2026-09__2222222222',
    cedula: '2222222222',
    nombres: 'ESTUDIANTE DOS',
    carrera: 'MARKETING',
    periodoId: '2026-04__2026-09',
    estado: 'DEVUELTO',
    estadoProceso: 'DEVUELTO',
    estadoInvestigador: 'DEVUELTO',
    investigacionRevisada: true,
    revisionInvestigador: {
      estado: 'DEVUELTO',
      investigadorId: 'INV-2',
      investigadorCedula: '8888888888',
      investigadorNombre: 'INVESTIGADOR DOS',
      observacion: 'Corregir delimitación',
      fechaLocal: '2026-10-07T11:00:00.000Z'
    }
  },
  {
    id: 'pendiente',
    cedula: '3333333333',
    nombres: 'PENDIENTE',
    carrera: 'MARKETING',
    periodoId: '2026-04__2026-09',
    estado: 'PENDIENTE_INVESTIGADOR',
    estadoInvestigador: 'PENDIENTE'
  }
];

const normalized = service.normalizarLista(docs);
assert.strictEqual(normalized.length, 2, 'Solo deben entrar revisiones resueltas.');

const summary = service.resumen(normalized);
assert.strictEqual(summary.total, 2);
assert.strictEqual(summary.aprobados, 1);
assert.strictEqual(summary.devueltos, 1);
assert.strictEqual(summary.investigadores, 2);

const own = normalized.filter((item) => service.coincideInvestigador(item, {
  id: 'INV-1',
  cedula: '9999999999',
  nombre: 'INVESTIGADOR UNO'
}));
assert.strictEqual(own.length, 1, 'Investigador solo debe ver sus revisiones.');

const filtered = service.filtrar(normalized, {
  carrera: 'MARKETING',
  resultado: 'DEVUELTO'
});
assert.strictEqual(filtered.length, 1);
assert.strictEqual(filtered[0].cedula, '2222222222');

console.log('OK reportes-revisiones: historial propio, filtros, resumen y PDF integrados.');
