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

function loadRepository(options) {
  options = options || {};
  let directCalls = 0;
  let legacyCalls = 0;
  let fullFallbackCalls = 0;
  let lastDocumentId = '';

  const firebaseService = {
    leerDocumentoServidor: async function (collection, documentId) {
      directCalls += 1;
      lastDocumentId = documentId;
      if (options.directError) throw new Error('NETWORK_FAIL');
      return options.directDoc || null;
    }
  };

  const consultaService = {
    consultarLegacy: async function () {
      legacyCalls += 1;
      return options.legacyResult || {
        ok: true,
        encontrado: false,
        status: 404,
        envio: null,
        estrategia: 'SIN_COINCIDENCIA',
        ruta: 'NO_ENCONTRADO',
        base: 'titulos-ec2fa',
        coleccion: 'envios'
      };
    },
    consultar: async function () {
      fullFallbackCalls += 1;
      return options.fullFallbackResult || {
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
    stats: function () {
      return { directCalls, legacyCalls, fullFallbackCalls, lastDocumentId };
    }
  };
}

async function run() {
  const periodo = '2026-04__2026-09';
  const cedula = '1754049383';
  const id = periodo + '__' + cedula;

  {
    const directDoc = {
      id,
      cedula,
      periodoId: periodo,
      estado: 'APROBADO_FINAL',
      estadoProceso: 'APROBADO_FINAL',
      estadoInvestigador: 'APROBADO',
      investigacionRevisada: true,
      tituloFinal: 'Título aprobado'
    };

    const env = loadRepository({ directDoc });
    const result = await env.repository.consultarEnvio(periodo, cedula);
    const stats = env.stats();

    assert(result, 'La lectura directa debe devolver el envío.');
    assert.strictEqual(result.estado, 'APROBADO_FINAL');
    assert.strictEqual(stats.lastDocumentId, id);
    assert.strictEqual(stats.directCalls, 1);
    assert.strictEqual(stats.legacyCalls, 0, 'No debe ejecutar fallback si existe el ID exacto.');
    assert.strictEqual(stats.fullFallbackCalls, 0);
    assert.strictEqual(result._consultaDiagnostico.estrategia, 'ID_EXACTO_PRIMERO');
    assert.strictEqual(result._consultaDiagnostico.ruta, 'SDK_ID_EXACTO');
  }

  {
    const legacyResult = {
      ok: true,
      encontrado: true,
      status: 200,
      estrategia: 'FALLBACK_IDENTIDAD',
      ruta: 'QUERY_IDENTIDAD',
      documentoId: 'legacy-1754049383',
      base: 'titulos-ec2fa',
      coleccion: 'envios',
      envio: {
        id: 'legacy-1754049383',
        cedula,
        periodoId: periodo,
        estado: 'PENDIENTE_INVESTIGADOR'
      }
    };

    const env = loadRepository({ directDoc: null, legacyResult });
    const result = await env.repository.consultarEnvio(periodo, cedula);
    const stats = env.stats();

    assert(result, 'El fallback legacy debe recuperar documentos históricos.');
    assert.strictEqual(stats.directCalls, 1);
    assert.strictEqual(stats.legacyCalls, 1);
    assert.strictEqual(stats.fullFallbackCalls, 0);
  }

  {
    const fullFallbackResult = {
      ok: true,
      encontrado: true,
      status: 200,
      estrategia: 'ID_EXACTO_PRIMERO',
      ruta: 'ID_EXACTO',
      documentoId: id,
      base: 'titulos-ec2fa',
      coleccion: 'envios',
      envio: {
        id,
        cedula,
        periodoId: periodo,
        estado: 'APROBADO_FINAL'
      }
    };

    const env = loadRepository({
      directError: true,
      fullFallbackResult
    });
    const result = await env.repository.consultarEnvio(periodo, cedula);
    const stats = env.stats();

    assert(result, 'Un fallo del SDK debe usar REST como único reintento controlado.');
    assert.strictEqual(stats.directCalls, 1);
    assert.strictEqual(stats.fullFallbackCalls, 1);
    assert.strictEqual(result.estado, 'APROBADO_FINAL');
  }

  console.log('OK estudiante-envio-rapido: ID exacto, legacy y reintento controlado aprobados.');
}

run().catch((error) => {
  console.error('FALLO estudiante-envio-rapido:', error);
  process.exit(1);
});
