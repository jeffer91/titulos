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
  configuracion:{general:{periodosActivos:['2026-04__2026-09','2026-05__2026-11']}},
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
 assert.equal(data.resultadoInvestigacion,'APROBADO_CON_OBSERVACION');
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
test('Investigación excluye períodos desactivados de la cola y su revisión',async()=>{
 const data=datos();data.configuracion.general.periodosActivos=['2026-05__2026-11'];
 const {rutas}=setup(data);
 assert.deepEqual((await rutas['/cola'].handle({usuario:actor})).titulos.map(t=>t.id),['b2']);
 await assert.rejects(()=>rutas['/revision'].handle({usuario:actor,body:{
  tituloId:'b1',accion:'APROBAR'
 }}),e=>e.status===409&&e.code==='PERIODO_DESACTIVADO');
});
test('historial de investigador muestra devolución de un expediente reenviado',async()=>{
 const data=datos();data.workflow_events.hist={
  tituloId:'b1',entidadId:'b1',modulo:'investigadores',cedula:'1700000000',
  periodoId:'2026-04__2026-09',
  revision:{estado:'DEVUELTO',investigadorId:'i1',investigadorCedula:'1700000000',
   investigadorNombre:'Docente Revisor',investigadorEmail:actor.email,
   observacion:'Delimitar problema',fechaLocal:'2026-10-12T09:00:00Z'}};
 const {rutas}=setup(data);
 const result=await rutas['/revisados'].handle({usuario:actor});
 assert.equal(result.titulos.length,1);
 assert.match(result.titulos[0].id,/b1__revision__/);
 assert.equal(result.titulos[0].revisionInvestigador.observacion,'Delimitar problema');
});
test('historial propio recupera una revisión sin evento externo',async()=>{
 const base=datos();
 base.envios.b1.historialProceso=[{version:1,revisionInvestigador:{
  estado:'DEVUELTO',investigadorId:'i1',investigadorCedula:'1700000000',
  investigadorEmail:actor.email,observacion:'Corregir alcance',
  fechaLocal:'2026-10-09T10:00:00Z'
 }}];
 const {rutas}=setup(base);
 const result=await rutas['/revisados'].handle({usuario:actor});
 assert.equal(result.titulos.length,1);
 assert.equal(result.titulos[0].revisionInvestigador.observacion,'Corregir alcance');
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
 for(let i=0;i<2501;i++)base.envios['a'+String(i).padStart(4,'0')]={...titulo('a','Carrera','2026-05__2026-11','2026-01-01'),estado:'APROBADO_FINAL'};
 base.envios.z= titulo('z','Otra carrera','2026-05__2026-11','2026-01-02');
 const {rutas}=setup(base);
 assert.deepEqual((await rutas['/cola'].handle({usuario:actor})).titulos.map(t=>t.id),['z']);
});

test('Investigación puede elegir propuesta diferente a Coordinación sin cambiar preferido',async()=>{
 const base=datos();
 base.envios.b1.tituloCoordinadorNumero=1;
 base.envios.b1.tituloPreferidoNumero=3;
 base.envios.b1.titulosEnviados=[
  {numero:1,tituloFinal:'Primer título enviado al proceso'},
  {numero:2,tituloFinal:'Segundo título diferente y autorizado'},
  {numero:3,tituloFinal:'Tercer título preferido por el estudiante'}
 ];
 const {rutas,db}=setup(base);
 const d=await rutas['/revision'].handle({usuario:actor,body:{
   tituloId:'b1',accion:'APROBAR',tituloSeleccionadoNumero:2
 }});
 assert.equal(d.estado,'APROBADO_FINAL');
 assert.equal(d.tituloFinal,'Segundo título diferente y autorizado');
 assert.equal(d.tituloInvestigadorNumero,2);
 assert.equal(d.tituloPreferidoNumero,3);
 assert.equal(d.tituloCoordinadorNumero,1);
 assert.equal(d.revisionInvestigador.tituloSeleccionadoNumero,2);
 assert.equal(d.revisionInvestigador.corrigioTitulo,false);
 assert.equal((await rutas['/cola'].handle({usuario:actor})).titulos.some(t=>t.id==='b1'),false);
 assert.equal(db.tablas.workflow_events.size,1);
});
test('Investigación puede corregir redacción con motivo, conservando original y otras dos propuestas',async()=>{
 const base=datos();
 base.envios.b1.tituloCoordinadorNumero=1;
 base.envios.b1.titulosEnviados=[
  {numero:1,tituloFinal:'Título primero'},
  {numero:2,tituloFinal:'Título segundo, antes de corregir'},
  {numero:3,tituloFinal:'Título tercero'}
 ];
 const {rutas,db}=setup(base);
 const nuevo='Diagnóstico de procesos administrativos y gestión comercial en Sangolquí';
 await assert.rejects(()=>rutas['/revision'].handle({usuario:actor,body:{
   tituloId:'b1',accion:'APROBAR',tituloSeleccionadoNumero:2,tituloCorregidoTexto:nuevo
 }}),e=>e.code==='CORRECCION_REQUIERE_MOTIVO');
 const d=await rutas['/revision'].handle({usuario:actor,body:{
   tituloId:'b1',accion:'APROBAR',tituloSeleccionadoNumero:2,tituloCorregidoTexto:nuevo,
   observacion:'Se precisó la finalidad y delimitación académica.'
 }});
 assert.equal(d.tituloFinal,nuevo);
 assert.equal(d.titulo2,nuevo);
 assert.equal(d.titulosEnviados[1].tituloOriginalInvestigacion,'Título segundo, antes de corregir');
 assert.equal(d.titulosEnviados[0].tituloFinal,'Título primero');
 assert.equal(d.titulosEnviados[2].tituloFinal,'Título tercero');
 assert.equal(d.revisionInvestigador.tituloSeleccionadoTextoOriginal,'Título segundo, antes de corregir');
 assert.equal(d.revisionInvestigador.tituloSeleccionadoNumero,2);
 assert.equal(d.revisionInvestigador.corrigioTitulo,true);
 assert.equal(d.resultadoInvestigacion,'APROBADO_CON_CORRECCION');
 assert.equal(db.tablas.workflow_events.size,1);
});
test('Investigación rechaza selección inexistente y no escribe en Firebase',async()=>{
 const {rutas,db}=setup();
 await assert.rejects(()=>rutas['/revision'].handle({usuario:actor,body:{
  tituloId:'b1',accion:'APROBAR',tituloSeleccionadoNumero:3
 }}),e=>e.code==='TITULO_PROPUESTA_NO_ENCONTRADA');
 assert.equal(db.tablas.workflow_events.size,0);
 assert.equal(db.tablas.envios.get('b1').estado,'PENDIENTE_INVESTIGADOR');
});

test('un primer arreglo vacío de títulos no oculta propuestas históricas válidas',async()=>{
 const base=datos();
 base.envios.b1.titulosEnviados=[{numero:1,tituloFinal:''}];
 base.envios.b1.propuestasDetalle=[{numero:2,tituloFinal:'Propuesta histórica de gestión de procesos'}];
 const {rutas}=setup(base);
 const r=await rutas['/revision'].handle({usuario:actor,body:{
  tituloId:'b1',accion:'APROBAR',tituloSeleccionadoNumero:2
 }});
 assert.equal(r.tituloInvestigadorNumero,2);
 assert.equal(r.tituloFinal,'Propuesta histórica de gestión de procesos');
});
