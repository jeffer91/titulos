'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const CODE = fs.readFileSync(
  path.join(ROOT, 'estudiantes', 'js', 'estudiante.repository.js'),
  'utf8'
);

function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function loadRepository(options) {
  options = options || {};
  const titleDocs = (options.titleDocs || []).map((item) => Object.assign({}, item));
  const stats = {
    titleQueries: 0,
    titleQueryField: '',
    titleQueryValue: '',
    studentReads: 0,
    matriculaQueries: 0,
    studentStarted: false,
    matriculaStarted: false
  };

  const firebaseService = {
    leerDocumento: async function () { return null; },

    leerDocumentoAcademico: function (collection, documentId) {
      stats.studentReads += 1;
      stats.studentStarted = true;
      return delay(options.studentDelay || 20, options.student || null);
    },

    consultarPrimeroAcademico: async function () {
      return null;
    },

    consultarColeccionAcademico: function (collection, field, operator, value) {
      stats.matriculaQueries += 1;
      stats.matriculaStarted = true;
      return delay(options.matriculaDelay || 20, options.matriculas || []);
    },

    consultarColeccion: function (collection, field, operator, value) {
      stats.titleQueries += 1;
      stats.titleQueryField = field;
      stats.titleQueryValue = value;
      return delay(options.titleDelay || 5, titleDocs);
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
    CustomEvent: function CustomEvent(name, init) {
      this.type = name;
      this.detail = init && init.detail;
    },
    window: {
      setTimeout,
      clearTimeout,
      dispatchEvent: function () {},
      CustomEvent: function CustomEvent(name, init) {
        this.type = name;
        this.detail = init && init.detail;
      },
      TA_ESTUDIANTES_CONFIG: {
        collections: {
          estudiantes: 'Estudiante',
          matriculas: 'matriculas',
          titulos: 'envios',
          config: 'configuracion',
          logs: 'workflow_events'
        },
        documents: { appConfig: 'general' },
        defaultAppConfig: {
          procesoActivo: true,
          maxIntentos: 1
        }
      },
      TAEstudianteFirebaseService: firebaseService
    }
  };

  vm.createContext(context);
  vm.runInContext(CODE, context, { filename: 'estudiante.repository.js' });

  return {
    repository: context.window.TAEstudianteRepository,
    stats: () => Object.assign({}, stats)
  };
}

async function run() {
  const cedula = '0202054730';
  const periodo = '2026-05__2026-11';

  {
    const env = loadRepository({
      studentDelay: 60,
      matriculaDelay: 60,
      student: {
        id: cedula,
        cedula,
        nombres: 'CHIMBO CORTEZ MAYRA ANAHI',
        nombreCarreraActual: 'ESTÉTICA INTEGRAL',
        codigoCarreraActual: '551012C02-P-1701',
        eliminado: false
      },
      matriculas: [{
        id: periodo + '__' + cedula,
        cedula,
        periodoId: periodo,
        nombreCarrera: 'ESTÉTICA INTEGRAL',
        codigoCarrera: '551012C02-P-1701',
        estadoMatricula: 'ACTIVO',
        eliminado: false,
        retirado: false
      }]
    });

    const promise = env.repository.buscarEstudiantePorCedula(cedula, {});
    await delay(10);

    const during = env.stats();
    assert.strictEqual(during.studentStarted, true, 'La ficha del estudiante debe arrancar sin esperar matrículas.');
    assert.strictEqual(during.matriculaStarted, true, 'Las matrículas deben arrancar en paralelo con la ficha.');

    const estudiante = await promise;
    assert(estudiante, 'Debe devolver el estudiante normalizado.');
    assert.strictEqual(estudiante.cedula, cedula);
    assert.strictEqual(estudiante.periodoId, periodo);
  }

  {
    const docs = [
      {
        id: 'otro-periodo',
        cedula,
        periodoId: '2026-04__2026-09',
        estado: 'APROBADO_FINAL',
        actualizadoEn: '2026-10-08T10:00:00.000Z',
        tituloFinal: 'Título de otro período'
      },
      {
        id: 'mismo-periodo-antiguo',
        cedula,
        periodoId: periodo,
        estado: 'PENDIENTE_INVESTIGADOR',
        actualizadoEn: '2026-09-01T10:00:00.000Z',
        tituloFinal: ''
      },
      {
        id: 'mismo-periodo-actual',
        cedula,
        periodoCanonicoId: periodo,
        estado: 'APROBADO_FINAL',
        estadoProceso: 'APROBADO_FINAL',
        actualizadoEn: '2026-09-09T14:10:21.151Z',
        tituloFinal: 'Análisis bibliográfico 2020–2025 sobre protocolos estéticos faciales no invasivos combinados para el rejuvenecimiento cutáneo en adultos',
        tituloPreferidoNumero: 3
      }
    ];

    const env = loadRepository({ titleDocs: docs });
    const result = await env.repository.consultarEnvio(periodo, cedula, {
      cedula,
      periodoId: periodo
    });
    const stats = env.stats();

    assert(result, 'Debe encontrar el envío de la cédula para el período conocido.');
    assert.strictEqual(stats.titleQueries, 1, 'Títulos debe hacer una sola consulta remota.');
    assert.strictEqual(stats.titleQueryField, 'cedula', 'La única consulta debe ser por el campo cedula.');
    assert.strictEqual(stats.titleQueryValue, cedula, 'Debe conservar el cero inicial.');
    assert.strictEqual(result.id, 'mismo-periodo-actual', 'Debe elegir el más reciente dentro del mismo período.');
    assert.strictEqual(result.tituloVisible, docs[2].tituloFinal, 'APROBADO_FINAL debe priorizar tituloFinal.');
    assert.strictEqual(result._consultaDiagnostico.motor, 'CONSULTA_CEDULA');
    assert.strictEqual(result._consultaDiagnostico.estrategia, 'CEDULA_MAS_PERIODO');
    assert.strictEqual(result._consultaDiagnostico.encontradosCedula, 3);
    assert.strictEqual(result._consultaDiagnostico.encontradosPeriodo, 2);
  }

  {
    const env = loadRepository({
      titleDocs: [{
        id: 'otro-periodo',
        cedula,
        periodoId: '2026-04__2026-09',
        estado: 'APROBADO_FINAL'
      }]
    });

    const result = await env.repository.consultarEnvio(periodo, cedula, {
      cedula,
      periodoId: periodo
    });

    assert.strictEqual(result, null, 'No debe mezclar un título de otro período.');
    assert.strictEqual(env.stats().titleQueries, 1);
  }

  console.log('OK estudiante-envio-rapido: académico paralelo + una consulta de Títulos por cédula + filtro local por período.');
}

run().catch((error) => {
  console.error('FALLO estudiante-envio-rapido:', error);
  process.exit(1);
});
