'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const coordSrc = read('coordinadores/js/coordinador.repository.js');
const adminSrc = read('administradores/js/administrador.repository.js');
const P = '2026-05__2026-11';
function montar(envios=[], perfiles=[], academico=[]) {
  const config={collections:{titulos:'envios',coordinadores:'coordinadores',estudiantes:'Estudiante',config:'configuracion'},documents:{appConfig:'general'},normalizacion:{agruparOnlineVista:false}};
  const data={envios,coordinadores:perfiles,Estudiante:academico};
  const service={
    listarDocumentos:async (c,opts)=>{if(c==='envios') assert.equal(opts.all,true);return data[c]||[];},
    listarColeccion:async c=>data[c]||[],
    leerDocumento:async()=>({periodosActivos:[P]}),
    guardarAsignacionesCoordinadores:async cambios=>{cambios.forEach(c=>Object.assign(data.coordinadores.find(x=>x.id===c.id),c.data));},
    actualizarDocumento:async(c,id,payload)=>Object.assign(data[c].find(x=>x.id===id),payload)
  };
  const window={TA_COORDINADORES_CONFIG:config,TA_ADMINISTRADORES_CONFIG:config,TACoordinadorFirebaseService:service,TAAdminFirebaseService:service};
  const context=vm.createContext({window,console,Set});
  vm.runInContext(coordSrc,context);vm.runInContext(adminSrc,context);
  return {coord:window.TACoordRepository,admin:window.TAAdministradorRepository,data};
}
test('las reglas puras coinciden sin compartir backends ni recursos de otra app',()=>{
 const rules=s=>s.slice(s.indexOf('// BEGIN REGLAS'),s.indexOf('// END REGLAS'));
 assert.equal(rules(coordSrc),rules(adminSrc));
});
test('ambos paneles clasifican igual estados nuevos, legados y reenvíos',()=>{
 const {coord,admin}=montar();
 const fixtures=[
  [{estado:'PENDIENTE_REVISION'},'POR_REVISAR'],
  [{estadoProceso:'COORDINACION_PENDIENTE'},'POR_REVISAR'],
  [{estadoProceso:'PENDIENTE_COORDINADOR',estadoCoordinador:'DEVUELTO'},'POR_REVISAR'],
  [{estadoCoordinador:'VALIDADO'},'VALIDADOS'],
  [{estadoCoordinador:'APROBADO_CON_OBSERVACION'},'VALIDADOS'],
  [{validadoCoordinacion:true},'VALIDADOS'],
  [{estadoProceso:'INVESTIGACION_PENDIENTE'},'VALIDADOS'],
  [{estadoProceso:'PENDIENTE_INVESTIGADOR',estadoInvestigador:'APROBADO'},'APROBADOS'],
  [{estado:'APROBADO_FINAL',estadoCoordinador:'PENDIENTE'},'APROBADOS'],
  [{estadoCoordinador:'VALIDADO',estadoInvestigador:'DEVUELTO'},'DEVUELTOS'],
  [{estadoProceso:'DEVUELTO_ADMIN'},'DEVUELTOS'],
  [{estado:'DEVUELTO',devueltoPor:'INVESTIGADOR'},'DEVUELTOS'],
  [{estadoProceso:'ARCHIVADO_ADMIN'},'SIN_ENVIO'],
  [{estado:'BORRADOR_REINICIADO'},'SIN_ENVIO'],
  [{titulosEnviados:[]},'SIN_ENVIO'],
  [{titulosEnviados:[],titulo1:'Propuesta antigua'},'POR_REVISAR']
 ];
 for(const [fields,expected] of fixtures){
  const d={titulosEnviados:[{numero:1,tituloFinal:'Propuesta'}],...fields};
  assert.equal(coord.clasificarTitulo(coord.normalizarTitulo(d)),expected,JSON.stringify(fields));
  assert.equal(admin.obtenerEtapaRevision(d),expected==='POR_REVISAR'?'COORDINACION':expected==='VALIDADOS'?'INVESTIGACION':'',JSON.stringify(fields));
 }
});
test('mismo período y expedientes producen el mismo total por carrera',async()=>{
 const carreras=['SEGURIDAD','ADMINISTRACIÓN','TALENTO HUMANO','CONTABILIDAD'];
 const envios=Array.from({length:12},(_,i)=>({id:'prueba-'+i,carreraNombre:carreras[i%4],periodoCanonicoId:P,periodoId:'2026-05',estado:'PENDIENTE_REVISION',titulosEnviados:[{tituloFinal:'Propuesta'}]}));
 envios.push({...envios[0],id:'inactivo',periodoCanonicoId:'2026-04__2026-09'});
 const {coord,admin}=montar(envios,[{id:'coord',nombre:'Responsable',carreras}]);
 const perfil=(await coord.listarCoordinadores())[0];
 const rows=await coord.listarTitulosParaCoordinador(perfil);
 const resumen=await admin.obtenerFaltantesRevision(P);
 assert.equal(rows.length,12); assert.equal(resumen.coordinacion.total,12);
 for(const c of resumen.coordinacion.carreras) assert.equal(rows.filter(x=>admin.normalizarTexto(x.carrera)===admin.normalizarTexto(c.carrera)&&coord.clasificarTitulo(x)==='POR_REVISAR').length,c.total);
});
test('asignación vigente no resucita nombres viejos ni mezcla códigos visibles',async()=>{
 const {coord,admin}=montar([], [{id:'c',nombre:'Responsable',carreras:['CONTABILIDAD','550411c02_p_1701'],carrerasAsignadas:[],carrerasNombres:['ADMINISTRACIÓN'],carrerasIds:['antiguo']}]);
 const c=(await coord.listarCoordinadores())[0], a=(await admin.listarCoordinadores())[0];
 assert.deepEqual(Array.from(c.carreras),['CONTABILIDAD']);assert.deepEqual(Array.from(a.carreras),['CONTABILIDAD']);
 assert.equal(coord.perteneceACoordinador({carrera:'UNIVERSITARIA EN CONTABILIDAD'},c),false);
 assert.equal(coord.perteneceACoordinador({carrera:'CONTABILIDAD ONLINE'},c),false);
 assert.equal(coord.perteneceACoordinador({codigoCarrera:'550411c02_p_1701'},c),true);
 assert.equal(coord.perteneceACoordinador({carrera:'ADMINISTRACIÓN'},c),false);
});
test('reasignar sincroniza los formatos; desasignar no recupera permisos antiguos',async()=>{
 const perfiles=[{id:'uno',nombre:'Uno',carreras:['CONTABILIDAD'],carrerasNombres:['CONTABILIDAD'],carrerasIds:['550411c02_p_1701']},{id:'dos',nombre:'Dos',carreras:[]}];
 const {coord,admin,data}=montar([],perfiles,[{cedula:'1234567890',nombreCarrera:'CONTABILIDAD',codigoCarrera:'550411c02_p_1701'}]);
 await admin.asignarCarreraACoordinador('CONTABILIDAD','dos');
 let cs=await coord.listarCoordinadores();
 assert.equal(coord.perteneceACoordinador({carrera:'CONTABILIDAD'},cs.find(c=>c.id==='uno')),false);
 assert.equal(coord.perteneceACoordinador({carrera:'CONTABILIDAD'},cs.find(c=>c.id==='dos')),true);
 assert.equal(coord.perteneceACoordinador({codigoCarrera:'550411c02_p_1701'},cs.find(c=>c.id==='dos')),true);
 assert.deepEqual(Array.from(data.coordinadores[0].carrerasNombres),[]);
 await admin.asignarCarreraACoordinador('CONTABILIDAD','');
 cs=await coord.listarCoordinadores();assert.equal(cs.some(c=>coord.perteneceACoordinador({carrera:'CONTABILIDAD'},c)),false);
});
test('ambos servicios paginan hasta el último envío y propagan errores sin totales parciales',async()=>{
 for(const modulo of ['coordinadores','administradores']){
  let calls=0,fallar=false;
  const snapshots=Array.from({length:1001},(_,i)=>({id:String(i),data:()=>({estado:'PENDIENTE_REVISION'})}));
  function query(start=0,size=500){return {
   limit:n=>query(start,n),startAfter:doc=>query(Number(doc.id)+1,size),
   get:async options=>{assert.equal(options.source,'server');calls++;if(fallar&&start)throw new Error('corte de red');const docs=snapshots.slice(start,start+size);return {docs,size:docs.length,forEach:fn=>docs.forEach(fn)};}
  };}
  const window={firebase:{app:()=>({}),initializeApp:()=>({}),firestore:()=>({collection:()=>query()})}};
  const document={getElementById:()=>({dataset:{loaded:'true'}})};
  vm.runInNewContext(read(modulo+'/js/firebase.service.js'),{window,document,console});
  const service=modulo==='coordinadores'?window.TACoordinadorFirebaseService:window.TAAdminFirebaseService;
  const result=await service.iniciar({apiKey:'test',authDomain:'test',projectId:'test',storageBucket:'test',messagingSenderId:'test',appId:'test'});
  assert.equal(result.ok,true);
  const rows=await service.listarDocumentos('envios',{all:true});
  assert.equal(rows.length,1001);assert.equal(new Set(rows.map(x=>x.id)).size,1001);assert.equal(calls,3);
  fallar=true;await assert.rejects(()=>service.listarDocumentos('envios',{all:true}),/corte de red/);
 }
});
