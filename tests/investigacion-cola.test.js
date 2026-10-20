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
    leerDocumento: async()=>({periodosActivos:['2026-04__2026-09','2026-05__2026-11']}),
    guardarDocumento: async function (collection, id, payload) {
      Object.assign(docs.find(d=>d.id===id),payload);
    },
    guardarRevisionAtomica: async function(collection,id,payload,evento,previo){
      const actual=docs.find(d=>d.id===id);
      assert(actual && actual.estadoProceso!=='APROBADO_FINAL');
      assert.strictEqual(actual.estado,previo.estado);
      Object.assign(actual,payload);
    },
    agregarDocumento: async function () {},
    listarDocumentos: async function (collection, options) {
      assert.strictEqual(collection, 'envios');
      opcionesRecibidas = options || {};
      return docs.map(d => ({...d, titulosEnviados: [{numero: 1, tituloFinal: 'Título'}]}));
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
      TAInvestigadorFirebaseService: firebaseService
    }
  };

  vm.createContext(context);
  vm.runInContext(CODE, context, { filename: 'investigador.repository.js' });

  const repository = context.window.TAInvestigadorRepository;
  const investigador = {
    id: 'investigador-test',
    carreras: [], pinActivo: true, activo: true
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

  assert.strictEqual(titulos.length, 3, 'Debe incluir todas las carreras sin asignación y ambos períodos.');
  assert.strictEqual(
    titulos[1].cedula,
    '1754049383',
    'Cristian Abril debe entrar a Investigación aunque sea Abril-Septiembre.'
  );
  assert.strictEqual(titulos[1].carrera, 'EDUCACIÓN BÁSICA');
  assert.strictEqual(titulos[1].periodoId, '2026-04__2026-09');
  assert.strictEqual(
    titulos[1].fechaColaInvestigacion,
    '2026-10-07T13:00:00.000Z',
    'La cola debe usar la fecha de validación de Coordinación.'
  );

  assert.strictEqual(
    repository.estaPendienteInvestigacion(titulos[1]),
    true,
    'Un validado por Coordinación debe quedar pendiente de Investigación.'
  );

  // Comparar los tres criterios con los mismos expedientes, incluidos estados heredados.
  context.window.TA_ADMINISTRADORES_CONFIG = {estadosTitulo:{}, collections:{}};
  context.window.TAAdminFirebaseService = {};
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'administradores/js/administrador.repository.js'), 'utf8'), context);
  const admin = context.window.TAAdministradorRepository;
  const backend = require('../functions/services/investigadores');
  const base = {titulosEnviados:[{numero:1,tituloFinal:'Prueba'}], estado:'PENDIENTE_REVISION'};
  const casos = [
    [{estado:'PENDIENTE_INVESTIGADOR'},true],
    [{estadoCoordinador:'VALIDADO'},true],
    [{estadoCoordinador:'APROBADO'},true],
    [{estadoCoordinador:'APROBADO_CON_OBSERVACION'},true],
    [{revisionCoordinador:{estado:'APROBADO'}},true],
    [{validadoCoordinacion:true},true],
    [{coordinadorRevisado:true},true],
    [{validadoCoordinador:true},true],
    [{estado:'PENDIENTE_COORDINADOR'},false],
    [{estado:'APROBADO_FINAL',validadoCoordinador:true},false],
    [{estado:'DEVUELTO',validadoCoordinador:true},false],
    [{estado:'ARCHIVADO',validadoCoordinador:true},false],
    [{estadoProceso:'BORRADOR_REINICIADO',validadoCoordinador:true},false],
    [{estadoCoordinador:'DEVUELTO',validadoCoordinador:true},false],
    [{investigacionRevisada:true,validadoCoordinador:true},false],
    [{estadoInvestigador:'APROBADO',validadoCoordinador:true},false],
    [{revisionInvestigador:{estado:'DEVUELTO'},validadoCoordinador:true},false],
    [{titulosEnviados:[],validadoCoordinador:true},false]
  ];
  for (const [extra,esperado] of casos) {
    const doc = {...base,...extra};
    assert.strictEqual(repository.estaPendienteInvestigacion(doc),esperado,JSON.stringify(extra));
    assert.strictEqual(admin.obtenerEtapaRevision(doc)==='INVESTIGACION',esperado,JSON.stringify(extra));
    assert.strictEqual(backend.pendiente(doc),esperado,JSON.stringify(extra));
  }

  const legacy=[
    {id:'solo-titulo1',titulo1:'Título de formato histórico'},
    {id:'solo-detalles',propuestasDetalle:[{numero:2,tituloFinal:'Título en detalle'}]},
    {id:'estado-temporal',titulosEnviados:[{numero:1,tituloFinal:'Título en validación'}],estadoInvestigador:'EN_REVISION'},
    {id:'periodo-incompleto',periodoCanonicoId:'2026-05',titulosEnviados:[{numero:1,tituloFinal:'Título con periodo válido'}]}
  ];
  for (const caso of legacy){
    const doc={id:caso.id,periodoId:'2026-05__2026-11',estado:'PENDIENTE_REVISION',
      estadoProceso:'PENDIENTE_INVESTIGADOR',estadoCoordinador:'VALIDADO',...caso};
    assert.strictEqual(repository.estaPendienteInvestigacion(doc),true,caso.id);
    assert.strictEqual(admin.obtenerEtapaRevision(doc),'INVESTIGACION',caso.id);
    assert.strictEqual(backend.pendiente(doc),true,caso.id);
  }
  const revisado = await repository.revisarTitulo(titulos[1], 'APROBAR', '', investigador);
  assert.strictEqual(revisado.estado,'APROBADO_FINAL');
  assert.strictEqual(revisado.revisionInvestigador.investigadorId,investigador.id);
  assert.strictEqual(repository.estaPendienteInvestigacion(revisado),false);
  assert.strictEqual((await repository.listarTitulosHabilitados(investigador)).length,2);
  await assert.rejects(()=>repository.listarTitulosHabilitados({activo:false,pinActivo:true}));
  await assert.rejects(()=>repository.listarTitulosHabilitados({activo:true,pinActivo:false}));
  console.log('OK investigacion-cola: todas las carreras, FIFO y paridad de estados con administrador y backend.');

}

run().catch((error) => {
  console.error('FALLO investigacion-cola:', error);
  process.exit(1);
});
