'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const CODE = fs.readFileSync(
  path.join(ROOT, 'investigadores', 'js', 'investigador.repository.js'),
  'utf8'
);

async function run() {
  let opcionesRecibidas = null;

  const docs = [
    {
      id: 'abril-cristian',
      cedula: '1754049383',
      nombres: 'ABRIL CHIRIBOGA CRISTIAN PATRICIO',
      carreraNombre: 'EDUCACIÓN BÁSICA',
      periodoId: '2026-04__2026-09',
      periodoNombre: 'Abril 2026 a Septiembre 2026',
      estado: 'PENDIENTE_INVESTIGADOR',
      estadoProceso: 'PENDIENTE_INVESTIGADOR',
      estadoCoordinador: 'VALIDADO',
      validadoCoordinador: true,
      tituloCoordinador: 'Título aprobado por Coordinación',
      fechaEnvio: '2026-09-30T10:00:00.000Z',
      fechaValidacionCoordinador: '2026-10-07T13:00:00.000Z'
    },
    {
      id: 'mayo-educacion',
      cedula: '1700000001',
      nombres: 'ESTUDIANTE MAYO',
      carreraNombre: 'EDUCACIÓN BÁSICA',
      periodoId: '2026-05__2026-11',
      estado: 'PENDIENTE_INVESTIGADOR',
      estadoProceso: 'PENDIENTE_INVESTIGADOR',
      estadoCoordinador: 'VALIDADO',
      validadoCoordinador: true,
      tituloCoordinador: 'Otro título',
      fechaEnvio: '2026-09-01T10:00:00.000Z',
      fechaValidacionCoordinador: '2026-10-07T14:00:00.000Z'
    },
    {
      id: 'otra-carrera',
      cedula: '1700000002',
      nombres: 'OTRA CARRERA',
      carreraNombre: 'CONTABILIDAD',
      periodoId: '2026-05__2026-11',
      estado: 'PENDIENTE_INVESTIGADOR',
      estadoProceso: 'PENDIENTE_INVESTIGADOR',
      estadoCoordinador: 'VALIDADO',
      validadoCoordinador: true,
      fechaValidacionCoordinador: '2026-10-07T12:00:00.000Z'
    }
  ];

  const firebaseService = {
    listarDocumentos: async function (collection, options) {
      assert.strictEqual(collection, 'envios');
      opcionesRecibidas = options || {};
      return docs;
    }
  };

  const context = {
    console,
    Promise,
    Date,
    JSON,
    Number,
    String,
    Object,
    Array,
    RegExp,
    Intl,
    setTimeout,
    clearTimeout,
    window: {
      TA_INVESTIGADORES_CONFIG: {
        collections: {
          investigadores: 'investigadores',
          titulos: 'envios',
          config: 'configuracion',
          logs: 'workflow_events'
        },
        documents: { appConfig: 'general' },
        pin: { min: 4, max: 8 },
        estadosCoordinadorHabilitados: [
          'VALIDADO',
          'APROBADO',
          'APROBADO_CON_OBSERVACION',
          'PENDIENTE_INVESTIGADOR'
        ]
      },
      TAAdminFirebaseService: firebaseService
    }
  };

  vm.createContext(context);
  vm.runInContext(CODE, context, { filename: 'investigador.repository.js' });

  const repository = context.window.TAInvestigadorRepository;
  const investigador = {
    id: 'investigador-test',
    carreras: ['EDUCACIÓN BÁSICA']
  };

  // Se pasa deliberadamente un período activo distinto al de Cristian.
  // La cola debe ignorarlo y trabajar por estado + carrera.
  const titulos = await repository.listarTitulosHabilitados(
    investigador,
    '2026-05__2026-11'
  );

  assert(opcionesRecibidas, 'Debe consultar la colección envios.');
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(opcionesRecibidas, 'where'),
    false,
    'Investigación no debe filtrar envios por el período activo.'
  );

  assert.strictEqual(titulos.length, 2, 'Debe incluir ambos períodos de la carrera asignada.');
  assert.strictEqual(
    titulos[0].cedula,
    '1754049383',
    'Cristian Abril debe entrar a Investigación aunque sea Abril-Septiembre.'
  );
  assert.strictEqual(titulos[0].carrera, 'EDUCACIÓN BÁSICA');
  assert.strictEqual(titulos[0].periodoId, '2026-04__2026-09');
  assert.strictEqual(
    titulos[0].fechaColaInvestigacion,
    '2026-10-07T13:00:00.000Z',
    'La cola debe usar la fecha de validación de Coordinación.'
  );

  assert.strictEqual(
    repository.estaPendienteInvestigacion(titulos[0]),
    true,
    'Un validado por Coordinación debe quedar pendiente de Investigación.'
  );

  console.log('OK investigacion-cola: multiperíodo, carrera y orden por validación correctos.');
}

run().catch((error) => {
  console.error('FALLO investigacion-cola:', error);
  process.exit(1);
});
