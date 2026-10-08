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
  const docs = (options.docs || []).map((item) => Object.assign({}, item));
  const stats = {
    sdkExact: 0,
    sdkQueries: 0,
    restExact: 0,
    restLegacy: 0
  };

  const firebaseService = {
    leerDocumentoServidor: async function (collection, documentId) {
      stats.sdkExact += 1;
      if (options.sdkExactError) throw new Error('SDK_EXACT_FAIL');
      if (options.sdkExactDelay) await delay(options.sdkExactDelay);
      return docs.find((doc) => doc.id === documentId) || null;
    },
    consultarColeccion: async function (collection, field, operator, value) {
      stats.sdkQueries += 1;
      if (options.sdkQueryError) throw new Error('SDK_QUERY_FAIL');
      if (options.sdkQueryDelay) await delay(options.sdkQueryDelay);
      return docs.filter((doc) => doc[field] === value);
    }
  };

  const consultaService = {
    leerDocumento: async function (documentId) {
      stats.restExact += 1;
      if (options.restExactError) throw new Error('REST_EXACT_FAIL');
      if (options.restExactDelay) await delay(options.restExactDelay);
      const doc = docs.find((item) => item.id === documentId);
      return doc
        ? { ok: true, encontrado: true, status: 200, envio: doc }
        : { ok: true, encontrado: false, status: 404, envio: null };
    },
    consultarLegacy: async function (periodo, cedula) {
      stats.restLegacy += 1;
      if (options.restLegacyError) throw new Error('REST_LEGACY_FAIL');
      if (options.restLegacyDelay) await delay(options.restLegacyDelay);

      const matches = docs.filter((doc) => {
        const id = String(doc.cedula || doc.numeroIdentificacion || '');
        return id === String(cedula) && String(doc.periodoId || doc.periodoCanonicoId || '') === String(periodo);
      });

      if (!matches.length) {
        return {
          ok: true,
          encontrado: false,
          status: 404,
          envio: null,
          estrategia: 'SIN_COINCIDENCIA',
          ruta: 'NO_ENCONTRADO',
          base: 'titulos-ec2fa',
          coleccion: 'envios'
        };
      }

      return {
        ok: true,
        encontrado: true,
        status: 200,
        envio: matches[0],
        documentoId: matches[0].id,
        estrategia: 'FALLBACK_IDENTIDAD',
        ruta: 'QUERY_IDENTIDAD',
        base: 'titulos-ec2fa',
        coleccion: 'envios'
      };
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
      setTimeout,
      clearTimeout,
      TA_ESTUDIANTES_CONFIG: {
        collections: {
          estudiantes: 'Estudiante',
          matriculas: 'matriculas',
          titulos: 'envios',
          config: 'configuracion',
          logs: 'workflow_events'
        },
        documents: { appConfig: 'general' },
        defaultAppConfig: { procesoActivo: true, maxIntentos: 1 }
      },
      TAFirebaseService: firebaseService,
      TAConsultaEstadoService: consultaService
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
  const periodo = '2026-05__2026-11';
  const cedula = '0202054730';
  const exactId = periodo + '__' + cedula;
  const contexto = {
    cedula,
    periodoId: periodo,
    periodosCandidatos: [periodo],
    codigoCarrera: '551012C02-P-1701',
    carrera: 'ESTÉTICA INTEGRAL'
  };

  {
    const mayra = {
      id: exactId,
      cedula,
      numeroIdentificacion: cedula,
      periodoId: periodo,
      periodoCanonicoId: periodo,
      carreraCodigo: '551012C02-P-1701',
      carreraNombre: 'ESTÉTICA INTEGRAL',
      estado: 'APROBADO_FINAL',
      estadoProceso: 'APROBADO_FINAL',
      tituloPreferidoNumero: 3,
      tituloCoordinador: 'Título coordinador',
      tituloFinalInvestigacion: 'Título final de investigación',
      tituloFinal: 'Análisis bibliográfico 2020–2025 sobre protocolos estéticos faciales no invasivos combinados para el rejuvenecimiento cutáneo en adultos'
    };

    const env = loadRepository({
      docs: [mayra],
      restExactDelay: 250
    });

    const result = await env.repository.consultarEnvio(periodo, cedula, contexto);
    const calls = env.stats();

    assert(result, 'Debe encontrar el documento canónico.');
    assert.strictEqual(result.cedula, cedula, 'Debe conservar el cero inicial.');
    assert.strictEqual(result.estado, 'APROBADO_FINAL');
    assert.strictEqual(result.tituloVisible, mayra.tituloFinal, 'APROBADO_FINAL debe priorizar tituloFinal.');
    assert.strictEqual(result._consultaDiagnostico.ruta, 'SDK_ID_EXACTO');
    assert.strictEqual(result._consultaDiagnostico.estrategia, 'ID_EXACTO_PARALELO');
    assert.strictEqual(calls.sdkExact, 1);
  }

  {
    const doc = {
      id: exactId,
      cedula,
      periodoId: periodo,
      carreraCodigo: '551012C02-P-1701',
      carreraNombre: 'ESTÉTICA INTEGRAL',
      estado: 'PENDIENTE_INVESTIGADOR'
    };

    const env = loadRepository({
      docs: [doc],
      sdkExactError: true
    });

    const result = await env.repository.consultarEnvio(periodo, cedula, contexto);
    assert(result, 'REST debe rescatar la consulta si falla el SDK exacto.');
    assert.strictEqual(result._consultaDiagnostico.ruta, 'REST_ID_EXACTO');
  }

  {
    const legacy = {
      id: 'legacy-random-id',
      cedula,
      numeroIdentificacion: cedula,
      periodoId: periodo,
      carreraCodigo: '551012C02-P-1701',
      carreraNombre: 'ESTÉTICA INTEGRAL',
      estado: 'APROBADO_FINAL',
      tituloFinal: 'Título legacy correcto'
    };

    const env = loadRepository({
      docs: [legacy],
      restLegacyError: true
    });

    const result = await env.repository.consultarEnvio(periodo, cedula, contexto);
    assert(result, 'El resolver SDK por identidad debe encontrar documentos con ID histórico.');
    assert.strictEqual(result.id, 'legacy-random-id');
    assert.strictEqual(result._consultaDiagnostico.ruta, 'SDK_IDENTIDAD');
    assert.strictEqual(result.tituloVisible, 'Título legacy correcto');
  }

  {
    const periodoAlterno = '2026-04__2026-09';
    const docAlterno = {
      id: 'legacy-alternate-period',
      cedula,
      periodoId: periodoAlterno,
      carreraCodigo: '551012C02-P-1701',
      carreraNombre: 'ESTÉTICA INTEGRAL',
      estado: 'APROBADO_FINAL',
      tituloFinal: 'Título de otra matrícula activa'
    };

    const env = loadRepository({
      docs: [docAlterno],
      restLegacyError: true
    });

    const result = await env.repository.consultarEnvio(periodo, cedula, Object.assign({}, contexto, {
      periodosCandidatos: [periodo, periodoAlterno]
    }));

    assert(result, 'Debe aceptar un período alterno cuando proviene de otra matrícula activa del mismo estudiante.');
    assert.strictEqual(result.id, 'legacy-alternate-period');
  }

  {
    const docs = [
      {
        id: 'amb-1',
        cedula,
        periodoId: '2025-10__2026-03',
        carreraCodigo: '551012C02-P-1701',
        carreraNombre: 'ESTÉTICA INTEGRAL',
        estado: 'APROBADO_FINAL'
      },
      {
        id: 'amb-2',
        cedula,
        periodoId: '2026-01__2026-06',
        carreraCodigo: '551012C02-P-1701',
        carreraNombre: 'ESTÉTICA INTEGRAL',
        estado: 'APROBADO_FINAL'
      }
    ];

    const env = loadRepository({
      docs,
      restLegacyError: true
    });

    const result = await env.repository.consultarEnvio(periodo, cedula, contexto);
    assert.strictEqual(result, null, 'Con varios períodos incompatibles no debe adivinar.');
  }

  console.log('OK estudiante-envio-rapido: SDK/REST paralelos, cero inicial, fallback flexible y ambigüedad segura.');
}

run().catch((error) => {
  console.error('FALLO estudiante-envio-rapido:', error);
  process.exit(1);
});
