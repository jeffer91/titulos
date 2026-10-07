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
  let restCalls = 0;

  const consultaService = {
    consultar: async function (periodo, cedula) {
      restCalls += 1;
      assert.strictEqual(periodo, '2026-04__2026-09');
      assert.strictEqual(cedula, '1754049383');
      return options.result || {
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

  const firebaseService = new Proxy({}, {
    get() {
      throw new Error('La consulta pública de envios no debe usar Firestore SDK.');
    }
  });

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
    restCalls: function () { return restCalls; }
  };
}

async function run() {
  const periodo = '2026-04__2026-09';
  const cedula = '1754049383';
  const id = periodo + '__' + cedula;

  {
    const env = loadRepository({
      result: {
        ok: true,
        encontrado: true,
        status: 200,
        estrategia: 'ID_EXACTO_PRIMERO',
        ruta: 'ID_EXACTO',
        documentoId: id,
        periodoCanonico: periodo,
        base: 'titulos-ec2fa',
        coleccion: 'envios',
        envio: {
          id,
          cedula,
          periodoId: periodo,
          estado: 'APROBADO_FINAL',
          estadoProceso: 'APROBADO_FINAL',
          estadoInvestigador: 'APROBADO',
          investigacionRevisada: true,
          tituloFinal: 'PR 1.1c'
        }
      }
    });

    const result = await env.repository.consultarEnvio(periodo, cedula);

    assert(result, 'REST directo debe devolver el envío.');
    assert.strictEqual(result.estado, 'APROBADO_FINAL');
    assert.strictEqual(result.tituloFinal, 'PR 1.1c');
    assert.strictEqual(env.restCalls(), 1, 'Repository debe hacer una sola llamada al motor REST.');
    assert.strictEqual(result._consultaDiagnostico.motor, 'REST_DIRECTO');
    assert.strictEqual(result._consultaDiagnostico.ruta, 'ID_EXACTO');
  }

  {
    const env = loadRepository();
    const result = await env.repository.consultarEnvio(periodo, cedula);
    assert.strictEqual(result, null);
    assert.strictEqual(env.restCalls(), 1);
    assert.strictEqual(env.repository.obtenerDiagnosticoEnvio().status, 404);
  }

  console.log('OK estudiante-envio-rapido: consulta pública usa solo REST directo.');
}

run().catch((error) => {
  console.error('FALLO estudiante-envio-rapido:', error);
  process.exit(1);
});
