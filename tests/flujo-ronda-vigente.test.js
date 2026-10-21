'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const P='2026-05__2026-11';
const ANTERIOR='2026-04__2026-09';
const propuestas=[
 {numero:1,tituloFinal:'Modelo de prevención en transporte público'},
 {numero:2,tituloFinal:'Diagnóstico de patrones de microtráfico en Calderón'},
 {numero:3,tituloFinal:'Evaluación de inteligencia policial en Calderón'}
];
function expediente(extra={}){
 return {
  id:'expediente-prueba',cedula:'1700000000',nombres:'ESTUDIANTE DE PRUEBA',
  carrera:'SEGURIDAD',carreraNombre:'SEGURIDAD',periodoId:P,periodoCanonicoId:P,
  estado:'PENDIENTE_INVESTIGADOR',estadoProceso:'PENDIENTE_INVESTIGADOR',
  estadoCoordinador:'VALIDADO',validadoCoordinador:true,coordinadorRevisado:true,
  estadoInvestigador:'PENDIENTE',investigacionRevisada:true,
  revisionInvestigador:{estado:'DEVUELTO',investigadorNombre:'Investigador anterior',
    observacion:'Delimitar fecha de corte',fechaLocal:'2026-10-12T17:11:00Z'},
  investigacionRevisadaEn:'2026-10-12T17:11:00Z',
  fechaValidacionCoordinador:'2026-10-19T13:31:00Z',
  tituloPreferidoNumero:1,tituloCoordinadorNumero:2,
  tituloCoordinador:propuestas[1].tituloFinal,titulosEnviados:propuestas,
  ...extra
 };
}
function montar(list){
 const serv={
  listarColeccion:async nombre=>nombre==='envios'?list:[],
  listarDocumentos:async()=>list,
  leerDocumento:async()=>({periodosActivos:[P,ANTERIOR]})
 };
 const window={
  TA_ADMINISTRADORES_CONFIG:{collections:{titulos:'envios'},estadosTitulo:{pendiente:'PENDIENTE'},normalizacion:{agruparOnlineVista:false}},
  TAAdminFirebaseService:serv,
  TA_INVESTIGADORES_CONFIG:{collections:{titulos:'envios',config:'configuracion'}},
  TAInvestigadorFirebaseService:serv
 };
 const ctx=vm.createContext({window,console,Date,Promise,JSON,Number,String,Object,Array,Set,RegExp,Intl});
 vm.runInContext(read('administradores/js/administrador.repository.js'),ctx);
 vm.runInContext(read('investigadores/js/investigador.repository.js'),ctx);
 return {admin:window.TAAdministradorRepository,investigador:window.TAInvestigadorRepository};
}
const backend=require('../functions/services/investigadores');
test('reenvío y nueva aprobación de Coordinación vuelven a Investigación aunque exista devolución previa',async()=>{
 const d=expediente();
 const {admin,investigador}=montar([d]);
 assert.equal(admin.obtenerEtapaRevision(d),'INVESTIGACION');
 assert.equal(investigador.estaPendienteInvestigacion(d),true);
 assert.equal(backend.pendiente(d),true);
 const cola=await investigador.listarTitulosHabilitados({id:'investigador',activo:true,pinActivo:true});
 assert.equal(cola.length,1);
 assert.equal(cola[0].tituloCoordinadorNumero,2);
 assert.equal(cola[0].tituloPreferidoNumero,1);
 const faltantes=await admin.obtenerFaltantesRevision([P,ANTERIOR]);
 assert.equal(faltantes.investigacion.total,1);
 assert.equal(faltantes.total,1);
 assert.equal((await admin.obtenerFaltantesRevision([ANTERIOR])).total,0);
});
test('no se reabren aprobados finales, expedientes devueltos sin reenvío o coordinaciones pendientes',()=>{
 const {admin,investigador}=montar([]);
 const casos=[
  expediente({estado:'APROBADO_FINAL',estadoProceso:'APROBADO_FINAL',procesoCerrado:true}),
  expediente({estado:'DEVUELTO',estadoProceso:'DEVUELTO',estadoInvestigador:'DEVUELTO'}),
  expediente({estado:'PENDIENTE_REVISION',estadoProceso:'PENDIENTE_COORDINADOR',estadoCoordinador:'PENDIENTE'}),
  expediente({estadoInvestigador:'APROBADO',investigacionRevisada:true})
 ];
 for(const d of casos){
  assert.notEqual(admin.obtenerEtapaRevision(d),'INVESTIGACION');
  assert.equal(investigador.estaPendienteInvestigacion(d),false);
  assert.equal(backend.pendiente(d),false);
 }
});
test('Coordinación reinicia Investigación cuando valida una nueva ronda sin perder historial',async()=>{
 let guardado=null;
 const serv={
  leerDocumento:async()=>({periodosActivos:[P]}),
  guardarDocumento:async(col,id,payload)=>{guardado=payload;},
  agregarDocumento:async()=>true
 };
 const win={
  TA_COORDINADORES_CONFIG:{collections:{config:'configuracion',titulos:'envios',logs:'workflow_events'},documents:{appConfig:'general'}},
  TACoordinadorFirebaseService:serv
 };
 vm.runInNewContext(read('coordinadores/js/coordinador.repository.js'),{window:win,console,Promise,Date,Number,String,Object,Array,Set,RegExp});
 const previo=expediente({
  estado:'PENDIENTE_REVISION',estadoProceso:'PENDIENTE_COORDINADOR',
  estadoCoordinador:'PENDIENTE',validadoCoordinador:false,coordinadorRevisado:false,
  historialProceso:[{tipo:'VERSION_ANTERIOR',revisionInvestigador:{estado:'DEVUELTO',observacion:'Observación archivada'}}]
 });
 const titulo=win.TACoordRepository.normalizarTitulo(previo);
 await win.TACoordRepository.revisarTitulo(titulo,'VALIDAR','',{id:'coord',nombre:'Sonia',activo:true,carreras:['SEGURIDAD']},2);
 assert(guardado,'La aprobación debe guardarse');
 assert.equal(guardado.estadoProceso,'PENDIENTE_INVESTIGADOR');
 assert.equal(guardado.estadoInvestigador,'PENDIENTE');
 assert.equal(guardado.investigacionRevisada,false);
 assert.equal(guardado.revisionInvestigador,null);
 assert.equal(guardado.fechaResolucionInvestigacion,null);
 assert.equal(guardado.observacionInvestigacion,'');
 assert.equal(guardado.fechaColaInvestigacion,guardado.fechaValidacionCoordinador);
 assert.equal(guardado.tituloCoordinadorNumero,2);
 assert.equal(guardado.historialProceso[0].revisionInvestigador.observacion,'Observación archivada');
});
test('el seguimiento no atribuye una revisión nueva al investigador anterior',()=>{
 const source=read('estudiantes/js/seguimiento.service.js');
 const a=source.indexOf('  function renderPasoRevision(');
 const b=source.indexOf('  function renderPasoFinal(',a);
 assert(a>=0&&b>a);
 const f=new Function('claseEstado','escapar','formatearFecha',
  source.slice(a,b)+'\nreturn renderPasoRevision;')(x=>x,s=>String(s),s=>String(s));
 const html=f('2','Investigación',{label:'Pendiente',tipo:'pending'},
  {investigadorNombre:'Investigador anterior',fechaLocal:'2026-10-12T17:11:00Z'},expediente());
 assert.match(html,/Pendiente/);
 assert.doesNotMatch(html,/Investigador anterior|2026-10-12/);
});
