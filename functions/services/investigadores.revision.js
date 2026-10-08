'use strict';
// Operación atómica de segunda revisión: expediente y auditoría.
function fail(status,code){const e=new Error(code);e.status=status;e.code=code;throw e;}
const str=v=>String(v===undefined||v===null?'':v).replace(/\s+/g,' ').trim();
const upper=v=>str(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function doc(snap){return snap&&snap.exists?{...snap.data(),id:snap.id}:null;}
function tituloSeleccionado(t){
 const n=Number(t.tituloCoordinadorNumero||t.revisionCoordinador&&t.revisionCoordinador.tituloSeleccionadoNumero||0);
 const list=Array.isArray(t.titulosEnviados)?t.titulosEnviados:[];
 const item=list.find(x=>Number(x.numero)===n);
 return str(t.tituloCoordinador||item&&(item.tituloFinal||item.titulo)||'');
}
async function revisar(db,perfil,actor,body,h){
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'REVISION_INVALIDA');
 const id=str(body.tituloId);
 if(!id||id.length>180||id.includes('/'))fail(400,'EXPEDIENTE_ID_INVALIDO');
 const accion=upper(body.accion);
 const choices={APROBAR:'APROBADO',APROBAR_OBSERVACION:'APROBADO_CON_OBSERVACION',DEVOLVER:'DEVUELTO'};
 if(!Object.prototype.hasOwnProperty.call(choices,accion))fail(422,'ACCION_INVALIDA');
 const estado=choices[accion],observacion=str(body.observacion);
 if(observacion.length>2000)fail(422,'OBSERVACION_MUY_LARGA');
 if(estado!=='APROBADO'&&!observacion)fail(422,'OBSERVACION_REQUERIDA');
 const ref=db.collection('envios').doc(id),ahora=new Date().toISOString();
 const result=await db.runTransaction(async tx=>{
  const actual=doc(await tx.get(db.collection('investigadores').doc(perfil.id)));
  if(!h.activo(actual)||!h.carreras(actual).length)fail(403,'PERFIL_REVOCADO');
  if(actual.authUid&&actual.authUid!==actor.uid)fail(403,'CUENTA_NO_COINCIDE');
  if(!actual.authUid&&(!actor.emailVerified||!actor.email||
    str(actual.email||actual.correo).toLowerCase()!==actor.email))fail(403,'VINCULO_CORREO_REVOCADO');
  const titulo=doc(await tx.get(ref));
  if(!titulo)fail(404,'EXPEDIENTE_NO_ENCONTRADO');
  if(!h.permitida(titulo,actual))fail(403,'CARRERA_NO_AUTORIZADA');
  if(!h.pendiente(titulo))fail(409,'REVISION_NO_DISPONIBLE');
  const final=tituloSeleccionado(titulo);
  if(estado!=='DEVUELTO'&&!final)fail(422,'TITULO_COORDINADOR_NO_DISPONIBLE');
  const pub=h.perfilPublico(actual);
  const revision={estado,accion,observacion,investigadorId:actual.id,
   investigadorCedula:pub.cedula,investigadorNombre:pub.nombre,
   investigadorEmail:pub.email,fechaLocal:ahora};
  const payload={estadoInvestigador:estado,revisionInvestigador:revision,investigacionRevisada:true,
   investigacionRevisadaEn:ahora,observacionInvestigacion:observacion,
   fechaResolucionInvestigacion:ahora,actualizadoEnLocal:ahora,actualizadoPorModulo:'investigadores'};
  if(estado==='DEVUELTO')Object.assign(payload,{
   estado:'DEVUELTO',estadoProceso:'DEVUELTO',resultadoInvestigacion:'DEVUELTO',
   tituloFinalInvestigacion:null,tituloFinal:null,requiereAccionDe:'ESTUDIANTE',
   requiereRevision:true,permitirReenvio:true,puedeReenviar:true,
   devueltoPor:'INVESTIGACION',observacionDevolucion:observacion
  });
  else Object.assign(payload,{
   estado:'APROBADO_FINAL',estadoProceso:'APROBADO_FINAL',
   resultadoInvestigacion:estado==='APROBADO_CON_OBSERVACION'?'APROBADO_CON_CORRECCION':'APROBADO_SIN_CAMBIOS',
   tituloFinalInvestigacion:final,tituloFinal:final,requiereAccionDe:'',
   requiereRevision:false,permitirReenvio:false,puedeReenviar:false,
   devueltoPor:'',fechaResolucion:ahora
  });
  tx.set(ref,payload,{merge:true});
  tx.set(db.collection('workflow_events').doc(),{
   tipo:'REVISION_TITULO_INVESTIGADOR',accion:'REVISION_TITULO_INVESTIGADOR',
   modulo:'investigadores',entidad:'envios',entidadId:id,tituloId:id,
   cedula:titulo.cedula||titulo.numeroIdentificacion||'',
   carrera:titulo.carreraNombre||titulo.carrera||'',
   periodoId:titulo.periodoId||titulo.periodoCanonicoId||'',
   estado:payload.estado,revision,fechaLocal:ahora,creadoEn:ahora,realizadoPorUid:actor.uid
  });
  return {...titulo,...payload};
 });
 return h.filtrar(result);
}
module.exports={revisar};
