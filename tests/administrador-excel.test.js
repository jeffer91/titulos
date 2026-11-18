'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TextEncoder } = require('node:util');

const ROOT = path.resolve(__dirname, '..');
const serviceSource = fs.readFileSync(path.join(ROOT, 'administradores/js/estudiantes.excel.service.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(ROOT, 'administradores/administrador.html'), 'utf8');
const controller = fs.readFileSync(path.join(ROOT, 'administradores/js/estudiantes.admin.js'), 'utf8');

function initService() {
  const sandbox = { window: {}, TextEncoder, Date, Blob, URL, setTimeout };
  vm.runInNewContext(serviceSource, sandbox);
  return sandbox.window.TAAdminExcelService;
}
function unzipStored(bytes) {
  const data = Buffer.from(bytes), result = {};
  let i = 0;
  while (i + 30 <= data.length && data.readUInt32LE(i) === 0x04034b50) {
    assert.equal(data.readUInt16LE(i + 8), 0, 'La compresión ZIP debe ser STORE.');
    const length = data.readUInt16LE(i + 26), extra = data.readUInt16LE(i + 28);
    const size = data.readUInt32LE(i + 18);
    const name = data.subarray(i + 30, i + 30 + length).toString('utf8');
    const start = i + 30 + length + extra;
    result[name] = data.subarray(start, start + size).toString('utf8');
    i = start + size;
  }
  assert.equal(data.readUInt32LE(i), 0x02014b50, 'Directorio central ZIP obligatorio.');
  return result;
}
const students = [
  {
    cedula: '0012345678', nombres: 'García & Niño', carrera: 'EDUCACIÓN BÁSICA',
    periodoId: '2026-05__2026-11', estado: 'APROBADO', tituloPreferidoNumero: 1,
    titulo: { estadoProceso: 'APROBADO_FINAL', tituloFinal: 'Diseño <pedagógico>' },
    titulosEnviados: [
      { numero: 1, tituloFinal: 'Diseño <pedagógico>' },
      { numero: 2, tituloFinal: '=HYPERLINK("url","click")' }
    ]
  },
  { cedula: '0999999999', nombres: 'Sin envío', estado: 'SIN_ENVIAR', titulosEnviados: [] },
  { cedula: '1700000002', nombres: 'En revisión', estado: 'PENDIENTE',
    tituloPreferidoNumero: 1, titulosEnviados: [{ numero: 1, tituloFinal: 'Propuesta pendiente' }] }
];

test('el panel incorpora un botón Excel vinculado al servicio local y a los datos filtrados', () => {
  assert.match(adminHtml, /id="btnDescargarExcelEstudiantes"/);
  assert.match(adminHtml, /id="estudiantesConteo"/);
  assert(adminHtml.indexOf('js/estudiantes.excel.service.js') < adminHtml.indexOf('js/estudiantes.admin.js'));
  assert.match(controller, /servicio\.exportar\(estado\.filtrados\.slice\(\)/);
  assert.match(controller, /repository\.listarEstudiantesConTitulos\(''\)/);
});

test('genera XLSX con las tres hojas y conserva las cédulas y estados', () => {
  const api = initService(), sheets = api.construirHojas(students, { periodo: '2026-05__2026-11' });
  assert.equal(sheets.length, 3);
  assert.equal(sheets[0].filas.length, 3);
  assert.equal(sheets[1].filas.length, 3);
  assert.equal(sheets[0].filas[0][0], '0012345678');
  assert.equal(sheets[0].filas[0][13], 'Diseño <pedagógico>');
  assert.equal(sheets[0].filas[1][13], '');
  assert.equal(sheets[2].filas.find(row => row[0] === 'Aprobado')[1], 1);
  assert.equal(sheets[2].filas.find(row => row[0] === 'Sin enviar')[1], 1);

  const archive = unzipStored(api.crearLibro(sheets));
  assert.equal(Object.keys(archive).length, 8);
  assert.match(archive['xl/workbook.xml'], /name="Estudiantes"/);
  assert.match(archive['xl/workbook.xml'], /name="Propuestas"/);
  assert.match(archive['xl/workbook.xml'], /name="Resumen"/);
  assert.match(archive['xl/worksheets/sheet1.xml'], /0012345678/);
  assert.match(archive['xl/worksheets/sheet1.xml'], /García &amp; Niño/);
  assert.match(archive['xl/worksheets/sheet1.xml'], /Diseño &lt;pedagógico&gt;/);
  assert.match(archive['xl/worksheets/sheet2.xml'], /t="inlineStr"/);
  assert.doesNotMatch(archive['xl/worksheets/sheet2.xml'], /<f>/);
  assert.match(archive['xl/worksheets/sheet1.xml'], /<autoFilter/);
});

test('recupera la carrera de matrícula, ficha académica o título sin inventarla', () => {
  const api = initService();
  const casos = [
    { cedula: '01', nombres: 'Uno', carrera: 'Sin carrera', raw: { nombreCarreraActual: 'EDUCACIÓN BÁSICA' } },
    { cedula: '02', nombres: 'Dos', carrera: '', titulo: { carreraNombre: 'PROCESAMIENTO EN ALIMENTOS' } },
    { cedula: '03', nombres: 'Tres', carrera: 'GESTIÓN DEL TALENTO HUMANO' },
    { cedula: '04', nombres: 'Cuatro', carrera: 'Sin carrera' }
  ].map(s => ({ ...s, estado: 'SIN_ENVIAR', titulosEnviados: [] }));
  const [alumnos, propuestas] = api.construirHojas(casos, {});
  assert.equal(alumnos.filas[0][2], 'EDUCACIÓN BÁSICA');
  assert.equal(alumnos.filas[1][2], 'PROCESAMIENTO EN ALIMENTOS');
  assert.equal(alumnos.filas[2][2], 'GESTIÓN DEL TALENTO HUMANO');
  assert.equal(alumnos.filas[3][2], 'Sin carrera registrada');
  assert.equal(propuestas.filas.length, 0);
});

test('no inventa aprobaciones y evita exportaciones vacías', () => {
  const api = initService();
  assert.throws(() => api.exportar([]), /No hay estudiantes/);
  const sheets = api.construirHojas(students.slice(1), {});
  assert.equal(sheets[0].filas[0][13], '');
  assert.equal(sheets[0].filas[1][13], '');
  assert.equal(sheets[2].filas.find(row => row[0] === 'Aprobado')[1], 0);
});

test('soporta exportaciones amplias sin eliminar registros', () => {
  const api = initService();
  const many = Array.from({ length: 3200 }, (_, index) => ({
    cedula: '0' + String(index).padStart(9, '0'),
    nombres: 'Alumno ' + index, estado: 'SIN_ENVIAR', titulosEnviados: []
  }));
  const sheets = api.construirHojas(many, {});
  const archive = unzipStored(api.crearLibro(sheets));
  assert.match(archive['xl/worksheets/sheet1.xml'], /Alumno 3199/);
  assert.match(archive['xl/worksheets/sheet1.xml'], /A3201/);
  assert.equal(sheets[2].filas.find(row => row[0] === 'Total estudiantes')[1], 3200);
});
