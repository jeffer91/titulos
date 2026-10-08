'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {crearRutasCoordinadores,permitida,carrerasDe}=require('../services/coordinadores');

function memoria(initial={}) {
 const tables=Object.fromEntries(Object.entries(initial).map(([k,v])=>[k,new Map(Object.entries(v))]));
 function table(name){return tables[name]||(tables[name]=new Map());}
 function snap(name,id){const value=table(name).get(id);return {id,exists:!!value,data:()=>value?{...value}:undefined};}
 let seq=0;
 function coll(name){
  return {
   doc(id){const actual=id||'auto-'+(++seq);return {name,id:actual,async get(){return snap(name,actual);}};},
   where(field,operator,value){
    assert.equal(operator,'==');
    return {limit(n){return {async get(){
     const docs=[...table(name)].filter(([_,v])=>v[field]===value).slice(0,n).map(([id])=>snap(name,id));
     return {docs,empty:docs.length===0};
    }};}};
   }
  };
 }
 return {tables,collection:coll,async runTransaction(fn){
   const writes=[];const tx={get:ref=>ref.get(),set(ref,data,opt){writes.push({ref,data,opt});}};
   const result=await fn(tx);
   for(const x of writes){
    const prev=table(x.ref.name).get(x.ref.id)||{};
    table(x.ref.name).set(x.ref.id,x.opt&&x.opt.merge?{...prev,...x.data}:{...x.data});
   }
   return result;
 }};
}
const usuario={uid:'auth-123',rol:'coordinador',email:'coord@itsqmet.edu.ec',emailVerified:true};
const periodo='2026-04__2026-09';
function base(){
 return {
  coordinadores:{c1:{authUid:usuario.uid,nombre:'Coordinador',email:usuario.email,activo:true,
   carrerasNombres:['Marketing Digital y Comercio Electrónico']}},
  envios:{
   m1:{cedula:'1700000001',nombres:'Alumno A',carreraNombre:'Marketing Digital y Comercio Electrónico',
    periodoId:periodo,estado:'PENDIENTE_REVISION',estadoProceso:'PENDIENTE_COORDINADOR',tituloPreferidoNumero:1,
    titulosEnviados:[
     {numero:1,tituloFinal:'Diagnóstico del proceso de ventas institucional'},
     {numero:2,tituloFinal:'Mejora de gestión comercial digital'},
     {numero:3,tituloFinal:'Evaluación de los resultados empresariales'}]},
   m2:{cedula:'1700000002',carreraNombre:'Marketing',estadoProceso:'PENDIENTE_COORDINADOR',
    titulosEnviados:[{numero:1,tituloFinal:'Título ajeno por carrera parecida'}]},
   sw:{cedula:'1700000003',carreraNombre:'Desarrollo de Software',estadoProceso:'PENDIENTE_COORDINADOR',
    titulosEnviados:[{numero:1,tituloFinal:'Título ajeno de Software'}]}
  },versiones_envio:{},workflow_events:{}
 };
}
function montar(data=base()){const db=memoria(data);return {db,rutas:crearRutasCoordinadores({db})};}
test('igualdad estricta de carrera sin coincidencias parciales ni comodines',()=>{
 assert.deepEqual(carrerasDe({carreras:['Marketing','Marketing',null,'']}),['Marketing']);
 assert.equal(permitida({carreraNombre:'Marketing Digital'},{carreras:['Marketing']}),false);
 assert.equal(permitida({carreraNombre:'Marketing'},{carreras:['Marketing Digital']}),false);
 assert.equal(permitida({carreraNombre:'Marketing'},{carreras:['*','TODAS']}),false);
 assert.equal(permitida({carreraNombre:'MARKETING DIGITAL Y COMERCIO ELECTRONICO'},
  {carreras:['Marketing Digital y Comercio Electrónico']}),true);
});
test('perfil solo del usuario vinculado con UID Firebase',async()=>{
 const {rutas}=montar();
 const propio=await rutas['/perfil'].handle({usuario});
 assert.equal(propio.id,'c1');
 assert.deepEqual(propio.carreras,['Marketing Digital y Comercio Electrónico']);
 await assert.rejects(()=>rutas['/perfil'].handle({usuario:{uid:'otro',email:'otro@x.test',emailVerified:true}}),e=>e.status===403);
});
test('fallback por email SOLO si está verificado',async()=>{
 const data=base();delete data.coordinadores.c1.authUid;const {rutas}=montar(data);
 await assert.rejects(()=>rutas['/perfil'].handle({usuario:{...usuario,emailVerified:false}}),e=>e.status===403);
 const perfil=await rutas['/perfil'].handle({usuario});assert.equal(perfil.id,'c1');
});
test('cola filtra las carreras desde consultas de Firestore',async()=>{
 const {rutas}=montar();const resultado=await rutas['/titulos'].handle({usuario});
 assert.deepEqual(resultado.titulos.map(x=>x.id),['m1']);
 assert.equal(resultado.truncado,false);
});
test('historial de carrera ajena se rechaza',async()=>{
 const {rutas}=montar();
 await assert.rejects(()=>rutas['/historial'].handle({usuario,query:{tituloId:'sw'}}),e=>e.code==='CARRERA_NO_AUTORIZADA');
 const datos=await rutas['/historial'].handle({usuario,query:{tituloId:'m1'}});
 assert.deepEqual(datos,{proceso:[],archivos:[],logs:[]});
});
test('VALIDAR guarda revision y evento atómicos, sin segunda aprobación',async()=>{
 const {rutas,db}=montar();
 const result=await rutas['/revision'].handle({usuario,body:{tituloId:'m1',accion:'VALIDAR',tituloSeleccionadoNumero:2}});
 assert.equal(result.estado,'PENDIENTE_INVESTIGADOR');
 assert.equal(result.titulosEnviados.length,3);
 assert.equal(db.tables.envios.get('m1').tituloCoordinadorNumero,2);
 assert.equal(db.tables.workflow_events.size,1);
 assert.equal([...db.tables.workflow_events.values()][0].realizadoPorUid,usuario.uid);
 await assert.rejects(()=>rutas['/revision'].handle({usuario,body:{tituloId:'m1',accion:'VALIDAR',tituloSeleccionadoNumero:2}}),
  e=>e.status===409);
});
test('DEVOLVER requiere observación, habilita reenvío y guarda log',async()=>{
 const {rutas,db}=montar();
 await assert.rejects(()=>rutas['/revision'].handle({usuario,body:{tituloId:'m1',accion:'DEVOLVER'}}),e=>e.status===422);
 const data=await rutas['/revision'].handle({usuario,body:{tituloId:'m1',accion:'DEVOLVER',observacion:'Corrige la delimitación.'}});
 assert.equal(data.estado,'DEVUELTO');assert.equal(data.puedeReenviar,true);
 assert.equal(db.tables.workflow_events.size,1);
});
test('VALIDAR_CORRECCION exige cambiar texto y conserva título original',async()=>{
 const {rutas}=montar();
 await assert.rejects(()=>rutas['/revision'].handle({usuario,body:{
  tituloId:'m1',accion:'VALIDAR_CORRECCION',tituloSeleccionadoNumero:1,
  observacion:'Se corrigió el enfoque',tituloCorregidoTexto:'Diagnóstico del proceso de ventas institucional'
 }}),e=>e.code==='CORRECCION_IGUAL_A_ORIGINAL');
 const data=await rutas['/revision'].handle({usuario,body:{
  tituloId:'m1',accion:'VALIDAR_CORRECCION',tituloSeleccionadoNumero:1,
  observacion:'Se corrigió el enfoque',tituloCorregidoTexto:'Análisis de los procesos comerciales de instituciones educativas'
 }});
 assert.equal(data.revisionCoordinador.corrigioTitulo,true);
 assert.equal(data.titulosEnviados[0].tituloOriginalCoordinacion,'Diagnóstico del proceso de ventas institucional');
});
test('no se puede revisar título ajeno ni falsificar coordinador',async()=>{
 const {rutas,db}=montar();
 await assert.rejects(()=>rutas['/revision'].handle({usuario,body:{
  tituloId:'sw',accion:'VALIDAR',tituloSeleccionadoNumero:1,coordinadorId:'ADMIN',carreras:['Desarrollo de Software']
 }}),e=>e.code==='CARRERA_NO_AUTORIZADA');
 assert.equal(db.tables.workflow_events.size,0);
});
test('coordinador desactivado no puede operar',async()=>{
 const {rutas,db}=montar();db.tables.coordinadores.get('c1').activo=false;
 await assert.rejects(()=>rutas['/revision'].handle({usuario,body:{tituloId:'m1',accion:'VALIDAR',tituloSeleccionadoNumero:1}}),
  e=>e.status===403);
 assert.equal(db.tables.workflow_events.size,0);
});
