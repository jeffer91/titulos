'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SERVICE_CODE = fs.readFileSync(path.join(ROOT, 'consulta-estado', 'consulta.service.js'), 'utf8');
const TRACKING_CODE = fs.readFileSync(path.join(ROOT, 'estudiantes', 'js', 'seguimiento.service.js'), 'utf8');

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === 'object') {
    const fields = {};
    Object.keys(value).forEach((key) => { fields[key] = encodeValue(value[key]); });
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function encodeFields(data) {
  const fields = {};
  Object.keys(data || {}).forEach((key) => { fields[key] = encodeValue(data[key]); });
  return fields;
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => payload === undefined ? '' : JSON.stringify(payload)
  };
}

function firestoreDocument(doc) {
  return {
    name: 'projects/titulos-ec2fa/databases/(default)/documents/envios/' + encodeURIComponent(doc.id),
    fields: encodeFields(Object.assign({}, doc))
  };
}

function valueMatches(raw, firestoreValue) {
  if (Object.prototype.hasOwnProperty.call(firestoreValue || {}, 'stringValue')) {
    return typeof raw === 'string' && raw === firestoreValue.stringValue;
  }
  if (Object.prototype.hasOwnProperty.call(firestoreValue || {}, 'integerValue')) {
    return typeof raw === 'number' && Number.isInteger(raw) && String(raw) === String(firestoreValue.integerValue);
  }
  return false;
}

function loadConsultaService(dataset, options) {
  options = options || {};
  const docs = (dataset || []).map((item) => Object.assign({}, item));
  const config = {
    version: 'test',
    projectId: 'titulos-ec2fa',
    databaseId: '(default)',
    collection: 'envios',
    apiKey: 'test-key',
    timeoutMs: 1000,
    firestoreRestBase: 'https://mock.firestore.local/v1'
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
    AbortController,
    setTimeout,
    clearTimeout
  };

  context.window = {
    TA_CONSULTA_ESTADO_CONFIG: config,
    setTimeout,
    clearTimeout
  };

  context.fetch = async function (url, requestOptions) {
    if (options.permissionDenied) {
      return response(403, { error: { status: 'PERMISSION_DENIED', message: 'denied' } });
    }

    requestOptions = requestOptions || {};

    if (String(requestOptions.method || 'GET').toUpperCase() === 'POST') {
      const body = JSON.parse(requestOptions.body || '{}');
      const filter = body.structuredQuery && body.structuredQuery.where && body.structuredQuery.where.fieldFilter;
      const field = filter && filter.field && filter.field.fieldPath;
      const value = filter && filter.value;

      const matches = docs.filter((doc) => field && valueMatches(doc[field], value));
      return response(200, matches.map((doc) => ({ document: firestoreDocument(doc) })));
    }

    const marker = '/documents/envios/';
    const idx = String(url).indexOf(marker);
    const encodedId = idx >= 0 ? String(url).slice(idx + marker.length).split('?')[0] : '';
    const id = decodeURIComponent(encodedId || '');
    const doc = docs.find((item) => item.id === id);

    if (!doc) return response(404, { error: { status: 'NOT_FOUND' } });
    return response(200, firestoreDocument(doc));
  };

  context.window.fetch = context.fetch;
  vm.createContext(context);
  vm.runInContext(SERVICE_CODE, context, { filename: 'consulta.service.js' });

  return context.window.TAConsultaEstadoService;
}

function loadTrackingClassifier() {
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
      TAEstudianteRepository: null,
      TAEstudianteRecomendacionesController: null,
      TAFirebaseService: null,
      setTimeout,
      clearTimeout
    }
  };

  vm.createContext(context);
  vm.runInContext(TRACKING_CODE, context, { filename: 'seguimiento.service.js' });
  return context.window.TAEstudianteSeguimiento.calcularEstados;
}

async function run() {
  const periodo = '2026-04__2026-09';
  const cedula = '1754315750';
  const calcularEstados = loadTrackingClassifier();

  {
    const service = loadConsultaService([]);
    const result = await service.consultar(periodo, cedula);
    assert.strictEqual(result.encontrado, false, 'Caso sin envío debe devolver encontrado=false');
    assert.strictEqual(result.ruta, 'NO_ENCONTRADO');
    assert.strictEqual(result.status, 404);
  }

  {
    const doc = {
      id: 'pendiente-coord',
      cedula,
      periodoId: periodo,
      estado: 'PENDIENTE_REVISION',
      estadoProceso: 'PENDIENTE_COORDINADOR',
      titulosEnviados: [{ numero: 1, tituloFinal: 'Título de prueba uno' }],
      fechaEnvio: '2026-10-01T12:00:00.000Z'
    };
    const service = loadConsultaService([doc]);
    const result = await service.consultar(periodo, cedula);
    assert.strictEqual(result.encontrado, true);
    assert.strictEqual(result.ruta, 'QUERY_IDENTIDAD');
    assert.strictEqual(result.estrategia, 'FALLBACK_IDENTIDAD');

    const estados = calcularEstados(result.envio);
    assert.strictEqual(estados.canonico, 'COORDINACION_PENDIENTE');
    assert.strictEqual(estados.coordinacion.tipo, 'pending');
    assert.strictEqual(estados.investigacion.tipo, 'muted');
  }

  {
    const doc = {
      id: 'validado-coord',
      numeroIdentificacion: 1754315750,
      periodoNombre: 'Abril 2026 a Septiembre 2026',
      estado: 'PENDIENTE_INVESTIGADOR',
      estadoProceso: 'PENDIENTE_INVESTIGADOR',
      estadoCoordinador: 'VALIDADO',
      validadoCoordinador: true,
      tituloCoordinadorNumero: 2,
      tituloCoordinador: 'Título seleccionado por Coordinación',
      revisionCoordinador: {
        estado: 'VALIDADO',
        tituloSeleccionadoNumero: 2,
        tituloSeleccionadoTexto: 'Título seleccionado por Coordinación'
      },
      titulosEnviados: [
        { numero: 1, tituloFinal: 'Título uno' },
        { numero: 2, tituloFinal: 'Título seleccionado por Coordinación' },
        { numero: 3, tituloFinal: 'Título tres' }
      ],
      fechaEnvio: '2026-10-02T12:00:00.000Z'
    };
    const service = loadConsultaService([doc]);
    const result = await service.consultar(periodo, cedula);
    assert.strictEqual(result.encontrado, true, 'Debe encontrar numeroIdentificacion numérico');
    assert.strictEqual(result.envio.tituloCoordinadorNumero, 2);
    assert.strictEqual(result.envio.revisionCoordinador.estado, 'VALIDADO');

    const estados = calcularEstados(result.envio);
    assert.strictEqual(estados.canonico, 'INVESTIGACION_PENDIENTE');
    assert.strictEqual(estados.coordinacion.tipo, 'success');
    assert.strictEqual(estados.investigacion.tipo, 'pending');
    assert.strictEqual(estados.finalAprobado, false);
  }

  {
    const doc = {
      id: 'devuelto-investigacion',
      cedula,
      periodoCanonicoId: periodo,
      estado: 'DEVUELTO',
      estadoProceso: 'DEVUELTO',
      estadoCoordinador: 'VALIDADO',
      estadoInvestigador: 'DEVUELTO',
      devueltoPor: 'INVESTIGACION',
      permitirReenvio: true,
      puedeReenviar: true,
      revisionInvestigador: {
        estado: 'DEVUELTO',
        observacion: 'Ajustar delimitación.'
      },
      fechaEnvio: '2026-10-03T12:00:00.000Z'
    };
    const service = loadConsultaService([doc]);
    const result = await service.consultar(periodo, cedula);
    assert.strictEqual(result.encontrado, true);
    assert.strictEqual(result.envio.puedeReenviar, true);

    const estados = calcularEstados(result.envio);
    assert.strictEqual(estados.canonico, 'DEVUELTO_INVESTIGACION');
    assert.strictEqual(estados.general.tipo, 'danger');
    assert.strictEqual(estados.investigacion.tipo, 'danger');
  }

  {
    const doc = {
      id: 'aprobado-final',
      cedula,
      periodoId: periodo,
      estado: 'APROBADO_FINAL',
      estadoProceso: 'APROBADO_FINAL',
      estadoCoordinador: 'VALIDADO',
      estadoInvestigador: 'APROBADO',
      investigacionRevisada: true,
      tituloCoordinador: 'Título final aprobado',
      tituloFinal: 'Título final aprobado',
      fechaEnvio: '2026-10-04T12:00:00.000Z'
    };
    const service = loadConsultaService([doc]);
    const result = await service.consultar(periodo, cedula);
    assert.strictEqual(result.encontrado, true);
    assert.strictEqual(result.envio.tituloFinal, 'Título final aprobado');

    const estados = calcularEstados(result.envio);
    assert.strictEqual(estados.canonico, 'APROBADO_FINAL');
    assert.strictEqual(estados.general.tipo, 'success');
    assert.strictEqual(estados.coordinacion.tipo, 'success');
    assert.strictEqual(estados.investigacion.tipo, 'success');
  }

  {
    const docs = [
      {
        id: 'actualizado-por-investigacion',
        cedula,
        periodoId: periodo,
        estado: 'APROBADO_FINAL',
        estadoProceso: 'APROBADO_FINAL',
        fechaEnvio: '2026-09-20T12:00:00.000Z',
        actualizadoEn: '2026-10-07T20:00:00.000Z'
      },
      {
        id: 'envio-mas-nuevo-pero-sin-revision',
        cedula,
        periodoId: periodo,
        estado: 'PENDIENTE_REVISION',
        fechaEnvio: '2026-10-05T12:00:00.000Z',
        actualizadoEn: '2026-10-05T12:00:00.000Z'
      }
    ];
    const service = loadConsultaService(docs);
    const result = await service.consultar(periodo, cedula);
    assert.strictEqual(
      result.documentoId,
      'actualizado-por-investigacion',
      'El fallback debe priorizar la actualización más reciente del proceso, no solo fechaEnvio.'
    );
  }

  {
    const id = periodo + '__' + cedula;
    const doc = {
      id,
      periodoId: periodo,
      estado: 'PENDIENTE_REVISION',
      fechaEnvio: '2026-10-05T12:00:00.000Z'
    };
    const service = loadConsultaService([doc]);
    const result = await service.consultar(periodo, cedula);
    assert.strictEqual(result.encontrado, true);
    assert.strictEqual(result.estrategia, 'ID_EXACTO_PRIMERO');
    assert.strictEqual(result.ruta, 'ID_EXACTO');
  }

  {
    const service = loadConsultaService([], { permissionDenied: true });
    let error = null;
    try {
      await service.consultar(periodo, cedula);
    } catch (caught) {
      error = caught;
    }
    assert(error, 'PERMISSION_DENIED debe producir un error visible');
    assert.strictEqual(error.codigo, 'PERMISSION_DENIED');
  }

  console.log('OK consulta-estado: ID exacto primero, fallback legacy y 8 escenarios aprobados.');
}

run().catch((error) => {
  console.error('FALLO consulta-estado:', error);
  process.exit(1);
});
