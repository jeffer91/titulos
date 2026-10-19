'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {revisar}=require('../services/admin-revision');
const {revisar:revisarInvestigacion}=require('../services/investigadores.revision');
const PERIODO='2026-05__2026-11';
const ADMIN={uid:'admin-verified',rol:'administrador'};
function dbMemoria(overrides={}){
 const seed={
  configuracion:{general:{periodosActivos:[PERIODO]}},
  coordinadores:{c1:{activo:true,carreras:['Marketing']}},
  envios:{e1:{
   cedula:'0000000000',periodoId:PERIODO,carrera:'Marketing',
   estado:'PENDIENTE_REVISION',estadoProceso:'PENDIENTE_COORDINADOR',
   tituloPreferidoNumero:1,tituloPreferidoTexto:'Título primero sin modificar',
   titulosEnviados:[
    {numero:1,tituloFinal:'Título primero sin modificar'},
    {numero:2,tituloFinal:'Título segundo sin modificar'},
    {numero:3,tituloFinal:'Título tercero sin modificar'}
   ]
  }},
  workflow_events:{},versiones_envio:{}
 };
 for(const [table,rows] of Object.entries(overrides)){
  seed[table]={...(seed[table]||{}),...rows};
 }
 const tables=Object.fromEntries(Object.entries(seed).map(([name,rows])=>[name,new Map(Object.entries(rows))]));
 let count=0;
 function snapshot(name,id){
  const data=tables[name].get(id);
  return {id,exists:data!==undefined,data:()=>data===undefined?undefined:{...data}};
 }
 function collection(name){
  return {
   doc(id){const actual=id||'auto-'+(++count);return {name,id:actual,get:async()=>snapshot(name,actual)};},
   limit(n){return {get:async()=>({docs:[...tables[name].keys()].slice(0,n).map(id=>snapshot(name,id))})};}
  };
 }
 return {tables,collection,async runTransaction(fn){
  const pending=[];
  const tx={get(ref){return ref.get();},set(ref,data,options){pending.push({ref,data,options});}};
  const result=await fn(tx);
  for(const {ref,data,options}of pending){
   const previous=tables[ref.name].get(ref.id)||{};
   tables[ref.name].set(ref.id,options&&options.merge?{...previous,...data}:{...data});
  }
  return result;
 }};
}
function payload(accion,extra={}){
 return {tituloId:'e1',accion,motivo:'Resolución administrativa debidamente justificada',
  propuestaNumero:2,estadoEsperado:'PENDIENTE_REVISION',procesoEsperado:'PENDIENTE_COORDINADOR',
  tituloOriginalEsperado:'Título segundo sin modificar',...extra};
}
test('aprueba la propuesta seleccionada sin inventar revisiones de otras personas',async()=>{
 const db=dbMemoria();
 const result=await revisar(db,ADMIN,payload('APROBAR'));
 const e=db.tables.envios.get('e1');
 assert.equal(result.estado,'APROBADO_FINAL');
 assert.equal(e.tituloFinal,'Título segundo sin modificar');
 assert.equal(e.aprobadoPorAdministracion,true);
 assert.equal(e.procesoCerrado,true);
 assert.equal(e.revisionInvestigador,null);
 assert.equal(e.investigacionRevisada,false);
 assert.equal(e.tituloPreferidoNumero,1);
 assert.equal(db.tables.versiones_envio.size,1);
 assert.equal(db.tables.workflow_events.size,1);
});
test('corregir y aprobar conserva texto anterior y preferencia original',async()=>{
 const db=dbMemoria();
 await revisar(db,ADMIN,payload('CORREGIR_APROBAR',{
  tituloCorregido:'Título segundo corregido profesionalmente en la institución'
 }));
 const e=db.tables.envios.get('e1');
 assert.equal(e.tituloFinal,'Título segundo corregido profesionalmente en la institución');
 assert.equal(e.titulosEnviados[1].tituloOriginalAdministracion,'Título segundo sin modificar');
 assert.equal(e.tituloPreferidoTexto,'Título primero sin modificar');
 assert.equal(e.revisionAdministrativa.accion,'CORREGIR_APROBAR');
});
test('enviar a Coordinación reinicia únicamente la ronda activa y guarda su historial',async()=>{
 const db=dbMemoria({envios:{e1:{...dbMemoria().tables.envios.get('e1'),
   estado:'DEVUELTO',estadoProceso:'DEVUELTO',estadoCoordinador:'DEVUELTO',
   revisionCoordinador:{estado:'DEVUELTO'},coordinadorRevisado:true
 }}});
 await revisar(db,ADMIN,payload('ENVIAR_COORDINACION',{estadoEsperado:'DEVUELTO',procesoEsperado:'DEVUELTO'}));
 const e=db.tables.envios.get('e1');
 assert.equal(e.estadoProceso,'PENDIENTE_COORDINADOR');
 assert.equal(e.estadoCoordinador,'PENDIENTE');
 assert.equal(e.coordinadorRevisado,false);
 assert.equal(e.revisionCoordinador,null);
 assert.equal(db.tables.versiones_envio.size,1);
});
test('remisión excepcional a Investigación no inventa aprobación de coordinador',async()=>{
 const original=dbMemoria().tables.envios.get('e1');
 const db=dbMemoria({envios:{e1:{...original,estado:'DEVUELTO',
   estadoProceso:'DEVUELTO',estadoCoordinador:'DEVUELTO',
   revisionCoordinador:{estado:'DEVUELTO'},coordinadorRevisado:true
 }}});
 await revisar(db,ADMIN,payload('ENVIAR_INVESTIGACION',{estadoEsperado:'DEVUELTO',procesoEsperado:'DEVUELTO'}));
 const e=db.tables.envios.get('e1');
 assert.equal(e.estadoProceso,'PENDIENTE_INVESTIGADOR');
 assert.equal(e.habilitadoInvestigacionPorAdmin,true);
 assert.equal(e.tituloAdminSeleccionadoNumero,2);
 assert.equal(e.tituloAdminSeleccionadoTexto,'Título segundo sin modificar');
 assert.equal(e.revisionCoordinador,null);
 assert.equal(e.validadoCoordinador,false);
 assert.equal(e.investigacionRevisada,false);
});
test('protege títulos aprobados hasta reapertura expresamente confirmada',async()=>{
 const original=dbMemoria().tables.envios.get('e1');
 const db=dbMemoria({envios:{e1:{...original,estado:'APROBADO_FINAL',
    estadoProceso:'APROBADO_FINAL',procesoCerrado:true,tituloFinal:'Título primero sin modificar'
 }}});
 await assert.rejects(()=>revisar(db,ADMIN,payload('ENVIAR_COORDINACION',{estadoEsperado:'APROBADO_FINAL',procesoEsperado:'APROBADO_FINAL'})),
   error=>error.code==='APROBADO_REQUIERE_REAPERTURA_EXPLICITA');
 await revisar(db,ADMIN,payload('ENVIAR_COORDINACION',{estadoEsperado:'APROBADO_FINAL',procesoEsperado:'APROBADO_FINAL',reabrirAprobado:true}));
 assert.equal(db.tables.envios.get('e1').tituloFinal,null);
 assert.equal(db.tables.versiones_envio.size,1);
});
test('rechaza período desactivado y usuarios ajenos a Administración',async()=>{
 const db=dbMemoria({configuracion:{general:{periodosActivos:[]}}});
 await assert.rejects(()=>revisar(db,ADMIN,payload('APROBAR')),
   error=>error.code==='PERIODO_DESACTIVADO');
 await assert.rejects(()=>revisar(db,{uid:'otro',rol:'estudiante'},payload('APROBAR')),
   error=>error.code==='ADMINISTRADOR_REQUERIDO');
});
test('no remite a Coordinación sin asignación activa para la carrera',async()=>{
 const db=dbMemoria({coordinadores:{c1:{activo:false,carreras:['Marketing']}}});
 await assert.rejects(()=>revisar(db,ADMIN,payload('ENVIAR_COORDINACION')),
   error=>error.code==='COORDINADOR_NO_ASIGNADO');
});

test('rechaza una decisión basada en una ficha anterior sin mutar el envío',async()=>{
 const db=dbMemoria();
 await revisar(db,ADMIN,payload('APROBAR'));
 const aprobado=db.tables.envios.get('e1');
 await assert.rejects(()=>revisar(db,ADMIN,payload('ENVIAR_COORDINACION')),
   error=>error.code==='FICHA_DESACTUALIZADA');
 assert.equal(db.tables.envios.get('e1').estadoProceso,'APROBADO_FINAL');
 assert.deepEqual(db.tables.envios.get('e1'),aprobado);
 assert.equal(db.tables.versiones_envio.size,1);
});
test('rechaza un título que cambió mientras el administrador tenía la ficha abierta',async()=>{
 const db=dbMemoria();
 db.tables.envios.get('e1').titulosEnviados[1].tituloFinal='Otro título actualizado';
 await assert.rejects(()=>revisar(db,ADMIN,payload('APROBAR')),
  error=>error.code==='FICHA_DESACTUALIZADA');
 assert.equal(db.tables.versiones_envio.size,0);
});

test('las observaciones anteriores pasan al historial y no figuran como vigentes',async()=>{
 const original=dbMemoria().tables.envios.get('e1');
 const db=dbMemoria({envios:{e1:{...original,estado:'DEVUELTO',
   estadoProceso:'DEVUELTO',estadoCoordinador:'DEVUELTO',
   revisionCoordinador:{estado:'DEVUELTO',observacion:'Nota antigua de Coordinación'},
   comentarioCoordinador:'Nota antigua de Coordinación',
   observacionInvestigacion:'Comentario antiguo del investigador',
   fechaResolucionInvestigacion:'2026-10-01T10:00:00Z'
 }}});
 await revisar(db,ADMIN,payload('APROBAR',{
  estadoEsperado:'DEVUELTO',procesoEsperado:'DEVUELTO'
 }));
 const result=db.tables.envios.get('e1');
 assert.equal(result.estadoProceso,'APROBADO_FINAL');
 assert.equal(result.estadoCoordinador,'');
 assert.equal(result.revisionCoordinador,null);
 assert.equal(result.comentarioCoordinador,'');
 assert.equal(result.observacionInvestigacion,'');
 assert.equal(result.fechaResolucionInvestigacion,null);
 const version=[...db.tables.versiones_envio.values()][0];
 assert.equal(version.observacionInvestigacionAnterior,'Comentario antiguo del investigador');
 assert.equal(version.revisionCoordinador.observacion,'Nota antigua de Coordinación');
});
test('la derivación desde Administración llega a aprobación real de Investigación',async()=>{
 const original=dbMemoria().tables.envios.get('e1');
 const db=dbMemoria({investigadores:{i1:{activo:true,authUid:'uid-inv',pinActivo:true}}});
 await revisar(db,ADMIN,payload('ENVIAR_INVESTIGACION'));
 const pending=db.tables.envios.get('e1');
 assert.equal(pending.tituloAdminSeleccionadoNumero,2);
 const h={
  activo:t=>t&&t.activo===true,
  permitida:()=>true,
  pendiente:t=>t.estadoProceso==='PENDIENTE_INVESTIGADOR'&&t.habilitadoInvestigacionPorAdmin===true,
  perfilPublico:()=>({cedula:'0000000001',nombre:'Investigador prueba',email:'prueba@instituto.edu'}),
  filtrar:t=>t
 };
 await revisarInvestigacion(db,{id:'i1'},{uid:'uid-inv'},{
  tituloId:'e1',accion:'APROBAR'
 },h);
 const final=db.tables.envios.get('e1');
 assert.equal(final.estado,'APROBADO_FINAL');
 assert.equal(final.tituloFinal,'Título segundo sin modificar');
 assert.equal(final.revisionInvestigador.estado,'APROBADO');
 assert.equal(final.aprobadoPorAdministracion,false);
});

test('administrador puede cambiar un título ya aprobado por otra propuesta',async()=>{
 const base=dbMemoria().tables.envios.get('e1');
 const db=dbMemoria({envios:{e1:{...base,estado:'APROBADO_FINAL',
   estadoProceso:'APROBADO_FINAL',procesoCerrado:true,
   tituloFinal:'Título primero sin modificar',tituloCoordinadorNumero:1
 }}});
 const res=await revisar(db,ADMIN,payload('APROBAR',{
   estadoEsperado:'APROBADO_FINAL',procesoEsperado:'APROBADO_FINAL',
   reabrirAprobado:true,propuestaNumero:3,tituloOriginalEsperado:'Título tercero sin modificar'
 }));
 const e=db.tables.envios.get('e1');
 assert.equal(res.estado,'APROBADO_FINAL');
 assert.equal(e.tituloFinal,'Título tercero sin modificar');
 assert.equal(e.tituloAdminSeleccionadoNumero,3);
 assert.equal(e.tituloPreferidoNumero,1);
 assert.equal(e.procesoCerrado,true);
 assert.equal(db.tables.versiones_envio.size,1);
 const previo=[...db.tables.versiones_envio.values()][0];
 assert.equal(previo.tituloFinalAnterior,'Título primero sin modificar');
});
test('administrador puede devolver un título aprobado a Investigación conservando el anterior',async()=>{
 const base=dbMemoria().tables.envios.get('e1');
 const db=dbMemoria({envios:{e1:{...base,estado:'APROBADO_FINAL',
  estadoProceso:'APROBADO_FINAL',procesoCerrado:true,
  tituloFinal:'Título primero sin modificar'
 }}});
 await revisar(db,ADMIN,payload('ENVIAR_INVESTIGACION',{
  estadoEsperado:'APROBADO_FINAL',procesoEsperado:'APROBADO_FINAL',reabrirAprobado:true
 }));
 const e=db.tables.envios.get('e1');
 assert.equal(e.estadoProceso,'PENDIENTE_INVESTIGADOR');
 assert.equal(e.habilitadoInvestigacionPorAdmin,true);
 assert.equal(e.tituloFinal,null);
 assert.equal(e.tituloAdminSeleccionadoNumero,2);
 assert.equal(e.revisionInvestigador,null);
 assert.equal(db.tables.versiones_envio.size,1);
 assert.equal([...db.tables.versiones_envio.values()][0].tituloFinalAnterior,'Título primero sin modificar');
});
