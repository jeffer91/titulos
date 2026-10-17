'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const codigo=n=>fs.readFileSync(path.join(__dirname,'../estudiantes/js',n),'utf8');
const cedula='1711111111',periodo='2026-05__2026-11';
const id='expediente-legado',propuestas=[
 {numero:1,tituloFinal:'Diagnóstico del proceso de ventas en pequeñas empresas del sector comercial'},
 {numero:2,tituloFinal:'Análisis de estrategias de comercialización de servicios en la ciudad de Quito'},
 {numero:3,tituloFinal:'Evaluación de la atención al cliente en un establecimiento de ventas locales'}
];
const base={
 id,cedula,periodoId:periodo,estado:'DEVUELTO',estadoProceso:'DEVUELTO',
 devueltoPor:'COORDINADOR',requiereAccionDe:'ESTUDIANTE',
 estadoCoordinador:'DEVUELTO',
 revisionCoordinador:{estado:'DEVUELTO',observacion:'Corregir la delimitación',fechaLocal:'2026-10-15T12:00:00Z'},
 tituloPreferidoNumero:2,titulosEnviados:propuestas,numeroEnvios:1,versionActual:1
};
function cargarRepositorio(inicial){
 let actual=inicial?{...inicial}:null, eventos=[],writes=0;
 const db={
   collection(name){
     assert.ok(name==='envios'||name==='configuracion');
     return {doc(documentId){return {id:documentId,collection:name};}};
   },
   async runTransaction(fn){
     const cambios=[];
     const tx={
       async get(ref){
          if(ref.collection==='configuracion')return {exists:true,
            data:()=>({periodosActivos:[periodo],procesoActivo:true})};
          return {exists:!!actual,data:()=>({...actual})};
        },
       set(ref,data,options){cambios.push({ref,data,options});}
     };
     const result=await fn(tx);
     for(const item of cambios){
       writes++;
       actual=item.options&&item.options.merge?{...(actual||{}),...item.data}:item.data;
     }
     return result;
   }
 };
 const service={
   consultarEnviosIdentidadServidor:async()=>actual?[{...actual}]:[],
   getDbTitulos:()=>db,
   agregarDocumento:async(name,value)=>{eventos.push({name,value});}
 };
 const w={
   TA_ESTUDIANTES_CONFIG:{
     collections:{titulos:'envios',config:'configuracion',logs:'workflow_events'},
     documents:{appConfig:'general'},
     defaultAppConfig:{maxIntentos:1,procesoActivo:true}
   },
   TAEstudianteFirebaseService:service,
   setTimeout,clearTimeout,dispatchEvent(){}
 };
 const context={window:w,console,Promise,Date,JSON,Number,String,Object,Array,RegExp,setTimeout,clearTimeout};
 vm.createContext(context);
 vm.runInContext(codigo('estudiante.repository.js'),context);
 return {
   repo:w.TAEstudianteRepository,
   get actual(){return actual;},get writes(){return writes;},eventos
 };
}
function formulario(){
 const w={TA_ESTUDIANTES_CONFIG:{borradorLocalActivo:false,defaultAppConfig:{maxIntentos:1}},location:{protocol:'https:',hostname:'test.local'}};
 const c={window:w,console,Promise,Date,JSON,Number,String,Object,Array,RegExp};
 vm.createContext(c);
 vm.runInContext(codigo('formulario.service.js'),c);
 return w.TAEstudianteFormulario;
}
const payload={
 cedula,periodoId:periodo,periodoLabel:'Mayo 2026 a Noviembre 2026',
 nombres:'ESTUDIANTE DE PRUEBA',carrera:'VENTAS',
 tituloPreferidoNumero:2,titulosEnviados:propuestas
};
test('solo se permite enviar dentro de períodos activos administrativamente',()=>{
 const r=cargarRepositorio(null);
 assert.equal(r.repo.periodoHabilitado(periodo,{
   periodosListaExplicita:true,periodosActivos:[periodo]}),true);
 assert.equal(r.repo.periodoHabilitado(periodo,{
   periodosListaExplicita:true,periodosActivos:[],periodoActivoId:periodo}),false);
 assert.equal(r.repo.periodoHabilitado(periodo,{
   periodoActivoDesactivado:true,periodoActivoId:periodo}),false);
});
test('devolución con autorización expresa habilita botón y reenvío',()=>{
 const r=cargarRepositorio({...base,puedeReenviar:true});
 assert.equal(r.repo.evaluarReenvio(r.actual).habilitado,true);
});
test('devolución antigua coherente se puede recuperar sin habilitar un simple estado DEVUELTO',()=>{
 const r=cargarRepositorio({...base,puedeReenviar:false,permitirReenvio:false});
 assert.equal(r.repo.evaluarReenvio(r.actual).habilitado,true);
 assert.equal(r.repo.evaluarReenvio({estado:'DEVUELTO'}).habilitado,false);
 assert.equal(r.repo.evaluarReenvio({estado:'APROBADO_FINAL',permitirReenvio:true}).habilitado,false);
 assert.equal(r.repo.evaluarReenvio({...base,devueltoPor:'',requiereAccionDe:'',permitirReenvio:false,puedeReenviar:false}).habilitado,true);
 assert.equal(r.repo.evaluarReenvio({...base,procesoCerrado:true}).habilitado,false);
 assert.equal(r.repo.evaluarReenvio({estado:'BORRADOR_REINICIADO',reiniciadoPorAdmin:true}).habilitado,true);
 assert.equal(r.repo.evaluarReenvio({estado:'BORRADOR_REINICIADO',puedeReenviar:true}).habilitado,false);
 assert.equal(r.repo.evaluarReenvio({...base,investigacionRevisada:true,estadoInvestigador:'APROBADO'}).habilitado,false);
});
test('transacción vuelve a comprobar permiso, conserva identificador e historial y limpia revisiones',async()=>{
 const r=cargarRepositorio({...base,puedeReenviar:false,permitirReenvio:false,
   validadoCoordinacion:true,validadoCoordinador:true,tituloCoordinador:'Viejo',
   tituloCoordinadorNumero:2,revisionInvestigador:{estado:'DEVUELTO'},
   procesoCerrado:false,numeroReenvios:0,historialProceso:[]});
 const res=await r.repo.guardarEnvioFinal({...payload});
 assert.equal(res.ok,true);
 assert.equal(res.id,id);
 assert.equal(r.writes,1);
 assert.equal(r.actual.numeroEnvios,2);
 assert.equal(r.actual.numeroReenvios,1);
 assert.equal(r.actual.estadoProceso,'PENDIENTE_COORDINADOR');
 assert.equal(r.actual.validadoCoordinacion,false);
 assert.equal(r.actual.tituloCoordinador,null);
 assert.equal(r.actual.tituloCoordinadorNumero,null);
 assert.equal(r.actual.revisionCoordinador,null);
 assert.equal(r.actual.revisionInvestigador,null);
 assert.equal(r.actual.puedeReenviar,false);
 assert.equal(r.actual.historialProceso.length,1);
 assert.equal(r.actual.historialProceso[0].revisionCoordinador.observacion,'Corregir la delimitación');
 assert.equal(r.eventos.length,1);
 assert.equal(r.eventos[0].value.tipo,'REENVIO_ESTUDIANTE');
 await assert.rejects(()=>r.repo.guardarEnvioFinal({...payload}),e=>e.codigo==='REENVIO_NO_AUTORIZADO');
 assert.equal(r.writes,1);
});
test('un expediente devuelto sin autorización es solo lectura y no se modifica',async()=>{
 const r=cargarRepositorio({...base,estadoCoordinador:'PENDIENTE',
   revisionCoordinador:null,devueltoPor:'',requiereAccionDe:'',permitirReenvio:false});
 await assert.rejects(()=>r.repo.guardarEnvioFinal({...payload}),e=>e.codigo==='REENVIO_NO_AUTORIZADO');
 assert.equal(r.writes,0);
});
test('la recuperación carga los tres títulos anteriores y la preferencia',()=>{
 const resultado=formulario().formDataDesdeEnvio({...base},3);
 assert.equal(resultado.propuestas.length,3);
 assert.equal(resultado.propuestas[0].tituloFinal,propuestas[0].tituloFinal);
 assert.equal(resultado.tituloPreferidoNumero,2);
});
test('seguimiento muestra el botón con permiso y explica el bloqueo sin permiso',()=>{
 function render(dato){
   const env=cargarRepositorio(dato);
   const panel={
     classList:{add(){},remove(){},contains(){return false;}},
     setAttribute(){},querySelector(){return null;},scrollIntoView(){},innerHTML:''
   };
   const w={
     TAEstudianteRepository:env.repo,
     TAEstudianteRecomendacionesController:{mostrarModalRecomendaciones(){},cerrarRecomendaciones(){}},
     TAEstudianteFirebaseService:{},
     setTimeout(){return 1;},clearTimeout(){}
   };
   const doc={
     head:{appendChild(){}},getElementById(){return null;},
     querySelector(sel){return sel==='#seguimientoTituloPanel'?panel:null;},
     createElement(){return {id:'',textContent:'',className:'',setAttribute(){}};}
   };
   const c={window:w,document:doc,console,Promise,Date,JSON,Number,String,Object,Array,RegExp,setTimeout,clearTimeout};
   vm.createContext(c);
   vm.runInContext(codigo('seguimiento.service.js'),c);
   w.TAEstudianteSeguimiento.mostrar({estudiante:{cedula,periodoId:periodo},envioExistente:dato,seguimiento:{eventos:[{modulo:'coordinadores',accion:'DEVOLVER',revision:{estado:'DEVUELTO',observacion:'Delimitar población del estudio',fechaLocal:'2026-10-15T12:00:00Z'},fechaLocal:'2026-10-15T12:00:00Z'}]}});
   return panel.innerHTML;
 }
 const permitido=render({...base,puedeReenviar:false,permitirReenvio:false});
 assert.match(permitido,/id="btnSeguimientoCorregir"/);
 assert.match(permitido,/Corregir la delimitación/);
 const bloqueado=render({...base,estadoCoordinador:'PENDIENTE',
   revisionCoordinador:null,devueltoPor:'',requiereAccionDe:'',permitirReenvio:false});
 assert.doesNotMatch(bloqueado,/id="btnSeguimientoCorregir"/);
 assert.match(bloqueado,/no está habilitado/);
 const legado=render({...base,revisionCoordinador:null,comentarioCoordinador:'',observacionDevolucion:'',devueltoPor:'',requiereAccionDe:'',puedeReenviar:false,permitirReenvio:false});
 assert.match(legado,/id="btnSeguimientoCorregir"/);
 assert.match(legado,/Delimitar población del estudio/);
});
