'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {crearRutasInvestigadores,permitida,carreras,pendiente}=require('../services/investigadores');

function firestore(seed){
 const tablas=Object.fromEntries(Object.entries(seed).map(([k,v])=>[k,new Map(Object.entries(v))]));
 const tabla=k=>tablas[k]||(tablas[k]=new Map());
 let n=0,queries=[];
 function snap(nombre,id){const d=tabla(nombre).get(id);return {id,exists:!!d,data:()=>d?{...d}:undefined};}
 function campo(doc,path){return path.split('.').reduce((value,key)=>value&&value[key],doc);}
 function collection(nombre){
  return {
   orderBy(){return {limit(max){let cursor='';return {
    startAfter(s){cursor=s.id;return this;},
    async get(){return {docs:[...tabla(nombre).keys()].sort().filter(id=>id>cursor).slice(0,max).map(id=>snap(nombre,id))};}
   };}};},
   doc(id){const key=id||'auto-'+(++n);return {nombre,id:key,get:async()=>snap(nombre,key)};},
   where(key,op,value){
    assert.equal(op,'==');queries.push({nombre,key,value});
    return {limit(max){return {async get(){
     const docs=[...tabla(nombre)].filter(([_,d])=>campo(d,key)===value).slice(0,max).map(([id])=>snap(nombre,id));
     return {docs,empty:docs.length===0};
    }};}};
   }
  };
 }
 return {tablas,queries,collection,async runTransaction(fn){
  const pendientes=[],tx={
   get:ref=>ref.get(),
   set(ref,data,opts){pendientes.push({ref,data,opts});}
  };
  const result=await fn(tx);
  for(const {ref,data,opts} of pendientes) {
   const prev=tabla(ref.nombre).get(ref.id)||{};
   tabla(ref.nombre).set(ref.id,opts&&opts.merge?{...prev,...data}:{...data});
  }
  return result;
 }};
}
const actor={uid:'uid-investigacion',email:'investigador@itsqmet.edu.ec',emailVerified:true,rol:'investigador'};
const titulo=(id,career,periodo,hora)=>({
 cedula:id+'000',nombres:'ESTUDIANTE '+id,carreraNombre:career,periodoId:periodo,
 estado:'PENDIENTE_INVESTIGADOR',estadoProceso:'PENDIENTE_INVESTIGADOR',
 estadoCoordinador:'VALIDADO',validadoCoordinador:true,numeroEnvios:1,
 tituloCoordinador:'Análisis institucional del proceso de titulación',
 fechaValidacionCoordinador:hora,titulosEnviados:[{numero:1,tituloFinal:'Título seleccionado de estudio'}]
});
function datos(){
 return {
  investigadores:{i1:{authUid:actor.uid,nombres:'Docente Revisor',cedula:'1700000000',email:actor.email,
    activo:true,pinActivo:true,pinCreado:true,carrerasNombres:['Educación Básica']}},
  envios:{
   b1:titulo('b1','Educación Básica','2026-04__2026-09','2026-10-07T10:00:00Z'),
   b2:titulo('b2','EDUCACIÓN BÁSICA','2026-05__2026-11','2026-10-07T11:00:00Z'),
   vecino:titulo('xx','Educación Inicial','2026-04__2026-09','2026-10-07T09:00:00Z'),
   aprobado:{...titulo('ap','Educación Básica','2026-04__2026-09','2026-10-07T08:00:00Z'),
    estado:'APROBADO_FINAL',estadoProceso:'APROBADO_FINAL',investigacionRevisada:true}
  },
  workflow_events:{}
 };
}
function setup(raw=datos()){const db=firestore(raw);return {db,rutas:crearRutasInvestigadores({db})};}
test('investigador activo accede a todas las carreras, incluso sin asignaciones',()=>{
 assert.deepEqual(carreras({carrerasNombres:['Educación Básica','Educación Básica']}),['Educación Básica']);
 assert.equal(permitida({carreraNombre:'Educación Inicial'},{activo:true,pinActivo:true,carreras:[]}),true);
 assert.equal(permitida({carreraNombre:'Educación Inicial'},{activo:false,pinActivo:true}),false);
 assert.equal(permitida({carreraNombre:'Educación Inicial'},{activo:true,pinActivo:false}),false);
});
test('se exige sesión vinculada y no se devuelve pinHash',async()=>{
 const {rutas}=setup();
 const p=await rutas['/perfil'].handle({usuario:actor});
 assert.equal(p.nombre,'Docente Revisor');
 assert.equal(p.pinHash,undefined);
 assert.equal(p.cedula,'1700000000');
 await assert.rejects(()=>rutas['/perfil'].handle({usuario:{uid:'otro',emailVerified:false}}),e=>e.status===403);
});
test('vínculo por email requiere correo verificado',async()=>{
 const base=datos();delete base.investigadores.i1.authUid;
 const {rutas}=setup(base);
 await assert.rejects(()=>rutas['/perfil'].handle({usuario:{...actor,emailVerified:false}}),e=>e.status===403);
 assert.equal((await rutas['/perfil'].handle({usuario:actor})).id,'i1');
});
test('PIN desactivado administrativamente bloquea API incluso con Auth',async()=>{
 const base=datos();base.investigadores.i1.pinActivo=false;
 const {rutas}=setup(base);
 await assert.rejects(()=>rutas['/cola'].handle({usuario:actor}),e=>e.code==='INVESTIGADOR_DESACTIVADO');
});
test('cola institucional multiperiodo FIFO para todas las carreras',async()=>{
 const {rutas,db}=setup();
 const data=await rutas['/cola'].handle({usuario:actor});
 assert.deepEqual(data.titulos.map(x=>x.id),['vecino','b1','b2']);
 assert.equal(data.truncado,false);
 assert.equal(db.queries.some(q=>q.nombre==='envios'&&q.key==='periodoId'),false);
 assert.equal(db.queries.some(q=>q.nombre==='envios'&&q.key==='carreraNombre'),false);
 assert.equal(pendiente(datos().envios.aprobado),false);
});
test('revisión de otra carrera permitida y doble revisión rechazada',async()=>{
 const {rutas,db}=setup();
 await rutas['/revision'].handle({usuario:actor,body:{tituloId:'vecino',accion:'APROBAR'}});
 assert.equal(db.tablas.workflow_events.size,1);
 await rutas['/revision'].handle({usuario:actor,body:{tituloId:'b1',accion:'APROBAR'}});
 await assert.rejects(()=>rutas['/revision'].handle({usuario:actor,body:{
  tituloId:'b1',accion:'APROBAR'
 }}),e=>e.code==='REVISION_NO_DISPONIBLE');
 assert.equal(db.tablas.workflow_events.size,2);
});
test('aprobación conserva título escogido y crea auditoría en misma transacción',async()=>{
 const {rutas,db}=setup();
 const data=await rutas['/revision'].handle({usuario:actor,body:{tituloId:'b1',accion:'APROBAR'}});
 assert.equal(data.estado,'APROBADO_FINAL');
 assert.equal(data.tituloFinal,'Análisis institucional del proceso de titulación');
 assert.equal(data.estadoInvestigador,'APROBADO');
 assert.equal(db.tablas.workflow_events.size,1);
 assert.equal([...db.tablas.workflow_events.values()][0].realizadoPorUid,actor.uid);
});
test('aprobar con observación requiere comentario',async()=>{
 const {rutas}=setup();
 await assert.rejects(()=>rutas['/revision'].handle({usuario:actor,body:{
  tituloId:'b1',accion:'APROBAR_OBSERVACION'
 }}),e=>e.status===422);
 const data=await rutas['/revision'].handle({usuario:actor,body:{
  tituloId:'b1',accion:'APROBAR_OBSERVACION',observacion:'Observación metodológica importante.'
 }});
 assert.equal(data.estadoInvestigador,'APROBADO_CON_OBSERVACION');
 assert.equal(data.resultadoInvestigacion,'APROBADO_CON_CORRECCION');
});
test('devolver exige motivo, registra reenvío autorizado y evento',async()=>{
 const {rutas,db}=setup();
 await assert.rejects(()=>rutas['/revision'].handle({usuario:actor,body:{
  tituloId:'b1',accion:'DEVOLVER'
 }}),e=>e.status===422);
 const d=await rutas['/revision'].handle({usuario:actor,body:{
  tituloId:'b1',accion:'DEVOLVER',observacion:'Redefinir variables de investigación.'
 }});
 assert.equal(d.estado,'DEVUELTO');
 assert.equal(d.devueltoPor,'INVESTIGACION');
 assert.equal(d.puedeReenviar,true);
 assert.equal(db.tablas.workflow_events.size,1);
});
test('revocar acceso después de autenticar bloquea modificación',async()=>{
 const {rutas,db}=setup();
 const obj=db.tablas.investigadores.get('i1');obj.activo=false;
 await assert.rejects(()=>rutas['/revision'].handle({usuario:actor,body:{
  tituloId:'b1',accion:'APROBAR'
 }}),e=>e.status===403);
 assert.equal(db.tablas.workflow_events.size,0);
});
test('mis revisiones no devuelve datos de otro investigador ni depende de carrera actual',async()=>{
 const base=datos();
 base.envios.aprobado.revisionInvestigador={estado:'APROBADO',investigadorId:'i1',
  investigadorCedula:'1700000000',investigadorEmail:actor.email,fechaLocal:'2026-10-08T10:00:00Z'};
 base.envios.otro={...titulo('ot','Educación Básica','2026-04__2026-09','2026-10-08T11:00:00Z'),
  revisionInvestigador:{estado:'APROBADO',investigadorId:'i2',investigadorCedula:'1700000009'}};
 const {rutas}=setup(base);
 const result=await rutas['/revisados'].handle({usuario:actor});
 assert.deepEqual(result.titulos.map(x=>x.id),['aprobado']);
 assert.equal(result.titulos[0].pinHash,undefined);
});

test('perfil sin carreras puede cargar cola, revisar y conservar historial propio',async()=>{
 const base=datos();base.investigadores.i1.carrerasNombres=[];
 const {rutas}=setup(base);
 assert.equal((await rutas['/cola'].handle({usuario:actor})).titulos.length,3);
 await rutas['/revision'].handle({usuario:actor,body:{tituloId:'vecino',accion:'APROBAR'}});
 assert.equal((await rutas['/cola'].handle({usuario:actor})).titulos.length,2);
 assert.deepEqual((await rutas['/revisados'].handle({usuario:actor})).titulos.map(t=>t.id),['vecino']);
});
test('paginación conserva pendientes después de más de 2500 expedientes cerrados',async()=>{
 const base=datos();base.envios={};
 for(let i=0;i<2501;i++)base.envios['a'+String(i).padStart(4,'0')]={...titulo('a','Carrera','p','2026-01-01'),estado:'APROBADO_FINAL'};
 base.envios.z= titulo('z','Otra carrera','p','2026-01-02');
 const {rutas}=setup(base);
 assert.deepEqual((await rutas['/cola'].handle({usuario:actor})).titulos.map(t=>t.id),['z']);
});
