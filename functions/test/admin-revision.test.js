'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {revisar}=require('../services/admin-revision');
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
  propuestaNumero:2,...extra};
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
 await revisar(db,ADMIN,payload('ENVIAR_COORDINACION'));
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
 await revisar(db,ADMIN,payload('ENVIAR_INVESTIGACION'));
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
 await assert.rejects(()=>revisar(db,ADMIN,payload('ENVIAR_COORDINACION')),
   error=>error.code==='APROBADO_REQUIERE_REAPERTURA_EXPLICITA');
 await revisar(db,ADMIN,payload('ENVIAR_COORDINACION',{reabrirAprobado:true}));
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
