'use strict';
const periodos=require('./periodos-activos');
// Operación atómica de segunda revisión: expediente y auditoría.
function fail(status,code){const e=new Error(code);e.status=status;e.code=code;throw e;}
const str=v=>String(v===undefined||v===null?'':v).replace(/\s+/g,' ').trim();
const upper=v=>str(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function doc(snap){return snap&&snap.exists?{...snap.data(),id:snap.id}:null;}
function propuestas(t){
 const fuente=[t.titulosEnviados,t.propuestasDetalle,t.propuestas].find(lista=>Array.isArray(lista)&&lista.length)||[];
 let arr=fuente.map((p,i)=>({...(p&&typeof p==='object'?p:{}),
   numero:Number(p&&p.numero||i+1),
   tituloFinal:str(typeof p==='string'?p:p&& (p.tituloFinal||p.titulo||p.texto)||'')
 })).filter(p=>[1,2,3].includes(p.numero)&&p.tituloFinal);
 if(!arr.length)arr=[1,2,3].map(numero=>({numero,tituloFinal:str(t['titulo'+numero])})).filter(p=>p.tituloFinal);
 return arr;
}
function elegirTitulo(t,body){
 const lista=propuestas(t);
 const huboEleccion=body.tituloSeleccionadoNumero!==undefined&&body.tituloSeleccionadoNumero!==null;
 const numero=Number(body.tituloSeleccionadoNumero||0);
 if(huboEleccion&&(!Number.isInteger(numero)||numero<1||numero>3))fail(422,'TITULO_SELECCION_INVALIDA');
 const propuesta=lista.find(p=>p.numero===numero);
 if(huboEleccion&&!propuesta)fail(422,'TITULO_PROPUESTA_NO_ENCONTRADA');
 const original=str(propuesta&&propuesta.tituloFinal||'');
 const historico=str(t.habilitadoInvestigacionPorAdmin&&t.tituloAdminSeleccionadoTexto||
   t.tituloCoordinador||lista.find(p=>p.numero===Number(t.tituloCoordinadorNumero||0))?.tituloFinal||'');
 const texto=huboEleccion ? (body.tituloCorregidoTexto===undefined?original:str(body.tituloCorregidoTexto)) : historico;
 const correccion=Boolean(huboEleccion&&texto!==original);
 if(!texto)fail(422,'TITULO_FINAL_REQUERIDO');
 if(correccion&&(texto.length<20||texto.length>260))fail(422,'TITULO_CORREGIDO_LONGITUD_INVALIDA');
 const items=lista.map(p=>correccion&&p.numero===numero?
   {...p,tituloOriginalInvestigacion:p.tituloOriginalInvestigacion||original,
    tituloCorregidoInvestigacion:texto,corregidoInvestigacion:true,tituloFinal:texto,titulo:texto}:p);
 return {numero:huboEleccion?numero:Number(t.tituloCoordinadorNumero||0)||null,
   original:huboEleccion?original:historico,texto,correccion,items};
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
  if(!h.activo(actual))fail(403,'PERFIL_REVOCADO');
  if(actual.authUid&&actual.authUid!==actor.uid)fail(403,'CUENTA_NO_COINCIDE');
  if(!actual.authUid&&(!actor.emailVerified||!actor.email||
    str(actual.email||actual.correo).toLowerCase()!==actor.email))fail(403,'VINCULO_CORREO_REVOCADO');
  const titulo=doc(await tx.get(ref));
  if(!titulo)fail(404,'EXPEDIENTE_NO_ENCONTRADO');
   const configSnap=await tx.get(db.collection('configuracion').doc('general'));
   if(!configSnap.exists)fail(503,'CONFIGURACION_PERIODOS_NO_DISPONIBLE');
   periodos.validar(titulo,periodos.activos(configSnap.data()));
  if(!h.permitida(titulo,actual))fail(403,'CARRERA_NO_AUTORIZADA');
  if(!h.pendiente(titulo))fail(409,'REVISION_NO_DISPONIBLE');
  const seleccion=estado==='DEVUELTO'?null:elegirTitulo(titulo,body);
  if(seleccion&&seleccion.correccion&&observacion.length<8)fail(422,'CORRECCION_REQUIERE_MOTIVO');
  const pub=h.perfilPublico(actual);
  const revision={estado,accion,observacion,investigadorId:actual.id,
   investigadorCedula:pub.cedula,investigadorNombre:pub.nombre,
   investigadorEmail:pub.email,fechaLocal:ahora,
   tituloSeleccionadoNumero:seleccion&&seleccion.numero||null,
   tituloSeleccionadoTextoOriginal:seleccion&&seleccion.original||'',
   tituloSeleccionadoTexto:seleccion&&seleccion.texto||'',
   corrigioTitulo:Boolean(seleccion&&seleccion.correccion),
   seleccionDiferenteCoordinacion:Boolean(seleccion&&seleccion.numero&&Number(titulo.tituloCoordinadorNumero||0)!==seleccion.numero)};
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
   resultadoInvestigacion:seleccion.correccion?'APROBADO_CON_CORRECCION':estado==='APROBADO_CON_OBSERVACION'?'APROBADO_CON_OBSERVACION':'APROBADO_SIN_CAMBIOS',
   tituloInvestigadorNumero:seleccion.numero,tituloInvestigador:seleccion.texto,
   tituloOriginalInvestigacion:seleccion.original,
   tituloCorregidoInvestigacion:seleccion.correccion?seleccion.texto:'',
   titulosEnviados:seleccion.items,propuestasDetalle:seleccion.items,
   tituloFinalInvestigacion:seleccion.texto,tituloFinal:seleccion.texto,requiereAccionDe:'',
   requiereRevision:false,permitirReenvio:false,puedeReenviar:false,
   devueltoPor:'',fechaResolucion:ahora
  });
  if(seleccion)seleccion.items.forEach(p=>{payload['titulo'+p.numero]=p.tituloFinal;});
  tx.set(ref,payload,{merge:true});
  tx.set(db.collection('workflow_events').doc(),{
   tipo:'REVISION_TITULO_INVESTIGADOR',accion:'REVISION_TITULO_INVESTIGADOR',
   modulo:'investigadores',entidad:'envios',entidadId:id,tituloId:id,
   cedula:titulo.cedula||titulo.numeroIdentificacion||'',
   carrera:titulo.carreraNombre||titulo.carrera||'',
   periodoId:titulo.periodoId||titulo.periodoCanonicoId||'',
   estado:payload.estado,revision,
   tituloSeleccionadoNumero:revision.tituloSeleccionadoNumero,
   tituloSeleccionadoTexto:revision.tituloSeleccionadoTexto,
   tituloSeleccionadoTextoOriginal:revision.tituloSeleccionadoTextoOriginal,
   fechaLocal:ahora,creadoEn:ahora,realizadoPorUid:actor.uid
  });
  return {...titulo,...payload};
 });
 return h.filtrar(result);
}
module.exports={revisar};
