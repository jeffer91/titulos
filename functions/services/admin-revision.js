'use strict';
// Intervenciones excepcionales: solo a través de administradoresApi con rol verificado.
const periodos=require('./periodos-activos');
const ACCIONES=new Set(['APROBAR','CORREGIR_APROBAR','ENVIAR_COORDINACION','ENVIAR_INVESTIGACION']);
const limpio=v=>String(v===undefined||v===null?'':v).replace(/\s+/g,' ').trim();
const clave=v=>limpio(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function fallo(status,code){const e=new Error(code);e.status=status;e.code=code;throw e;}
function propuestas(doc){
 let src=Array.isArray(doc.titulosEnviados)&&doc.titulosEnviados.length?doc.titulosEnviados:
   Array.isArray(doc.propuestasDetalle)&&doc.propuestasDetalle.length?doc.propuestasDetalle:
   [1,2,3].map(numero=>({numero,tituloFinal:doc['titulo'+numero]}));
 return src.map((p,i)=>({...p,numero:Number(p.numero||i+1),
   tituloFinal:limpio(p.tituloFinal||p.titulo)})).filter(p=>[1,2,3].includes(p.numero)&&p.tituloFinal);
}
function tituloPorNumero(items,n){return limpio((items.find(x=>x.numero===n)||{}).tituloFinal);}
function listaCarreras(p){
 const out=[];
 function add(v){
  if(Array.isArray(v)){v.forEach(add);return;}
  if(v&&typeof v==='object'){add(v.nombreCarrera||v.carrera||v.nombre||v.codigoCarrera||v.codigo||v.id);return;}
  limpio(v).split(/[,;|]/).forEach(x=>{if(limpio(x))out.push(clave(x));});
 }
 ['carreras','carrerasNombres','carrerasAsignadas','carrerasIds','carrera'].forEach(k=>add(p[k]));
 return out;
}
async function verificarDestinoCoordinacion(db,expediente){
 const nombre=clave(expediente.carreraNombre||expediente.carrera||expediente.nombreCarrera);
 const codigo=clave(expediente.carreraCodigo||expediente.codigoCarrera);
 if(!nombre&&!codigo)fallo(422,'CARRERA_NO_DEFINIDA');
 const snap=await db.collection('coordinadores').limit(500).get();
 const encontrados=snap.docs.filter(d=>{
  const p=d.data()||{};
  return p.activo!==false&&clave(p.estado||'ACTIVO')!=='INACTIVO'&&
    listaCarreras(p).some(c=>c&&c!=='*'&&!['TODOS','TODAS','ALL'].includes(c)&&(c===nombre||c===codigo));
 });
 if(!encontrados.length)fallo(409,'COORDINADOR_NO_ASIGNADO');
}
async function revisar(db,actor,body){
 if(!actor||!actor.uid||actor.rol!=='administrador')fallo(403,'ADMINISTRADOR_REQUERIDO');
 if(!body||typeof body!=='object'||Array.isArray(body))fallo(400,'SOLICITUD_INVALIDA');
 const id=limpio(body.tituloId),accion=clave(body.accion),motivo=limpio(body.motivo);
 const numero=Number(body.propuestaNumero||0),corregido=limpio(body.tituloCorregido);
 if(!id||id.length>180||id.includes('/'))fallo(422,'ENVIO_ID_INVALIDO');
 if(!ACCIONES.has(accion))fallo(422,'ACCION_INVALIDA');
 if(motivo.length<8||motivo.length>1000)fallo(422,'MOTIVO_REQUERIDO');
 if(corregido.length>260)fallo(422,'TITULO_MUY_LARGO');
 if(![1,2,3].includes(numero))fallo(422,'PROPUESTA_INVALIDA');
 if(accion==='CORREGIR_APROBAR'&&corregido.length<20)fallo(422,'TITULO_CORREGIDO_INVALIDO');
 if(accion!=='CORREGIR_APROBAR'&&corregido)fallo(422,'CORRECCION_NO_PERMITIDA');
 const ref=db.collection('envios').doc(id),prevSnap=await ref.get();
 if(!prevSnap.exists)fallo(404,'ENVIO_NO_ENCONTRADO');
 if(accion==='ENVIAR_COORDINACION')await verificarDestinoCoordinacion(db,prevSnap.data());
 const ahora=new Date().toISOString();
 const histRef=db.collection('versiones_envio').doc();
 const eventRef=db.collection('workflow_events').doc();
 return db.runTransaction(async tx=>{
  const cfg=await tx.get(db.collection('configuracion').doc('general'));
  if(!cfg.exists)fallo(503,'CONFIGURACION_NO_DISPONIBLE');
  const snap=await tx.get(ref);
  if(!snap.exists)fallo(404,'ENVIO_NO_ENCONTRADO');
  const antes=snap.data()||{};
  periodos.validar(antes,periodos.activos(cfg.data()));
  // Optimistic concurrency: una ficha anterior nunca decide sobre otro estado.
  if(typeof body.estadoEsperado!=='string'||typeof body.procesoEsperado!=='string'||
     typeof body.tituloOriginalEsperado!=='string')
    fallo(422,'VERSION_FICHA_REQUERIDA');
  if(clave(body.estadoEsperado)!==clave(antes.estado)||
     clave(body.procesoEsperado)!==clave(antes.estadoProceso))
    fallo(409,'FICHA_DESACTUALIZADA');
  if(body.actualizacionEsperada!==undefined&&body.actualizacionEsperada!==null&&
     typeof body.actualizacionEsperada==='string'&&
     body.actualizacionEsperada!==String(antes.actualizadoEnLocal||''))
    fallo(409,'FICHA_DESACTUALIZADA');
  if(['ARCHIVADO','ARCHIVADO_ADMIN','BORRADOR_REINICIADO'].includes(clave(antes.estado)) ||
     ['ARCHIVADO','BORRADOR_REINICIADO'].includes(clave(antes.estadoProceso)))
    fallo(409,'EXPEDIENTE_SIN_ENVIO_ACTIVO');
  const items=propuestas(antes);
  if(!items.length)fallo(409,'SIN_PROPUESTAS');
  const aprobado=clave(antes.estado)==='APROBADO_FINAL'||clave(antes.estadoProceso)==='APROBADO_FINAL'||
    antes.procesoCerrado===true;
  if(aprobado&&body.reabrirAprobado!==true)fallo(409,'APROBADO_REQUIERE_REAPERTURA_EXPLICITA');
  if(aprobado&&motivo.length<15)fallo(422,'MOTIVO_REAPERTURA_INSUFICIENTE');
  const original=tituloPorNumero(items,numero);
  if(!original)fallo(422,'PROPUESTA_NO_DISPONIBLE');
  if(limpio(body.tituloOriginalEsperado)!==original)fallo(409,'FICHA_DESACTUALIZADA');
  if(accion==='CORREGIR_APROBAR'&&clave(corregido)===clave(original))fallo(422,'CORRECCION_SIN_CAMBIOS');
  const final=accion==='CORREGIR_APROBAR'?corregido:original;
  const actualizados=items.map(p=>accion==='CORREGIR_APROBAR'&&p.numero===numero?
    {...p,tituloOriginalAdministracion:p.tituloFinal,tituloCorregidoAdministracion:final,
      corregidoAdministracion:true,tituloFinal:final,titulo:final}:p);
  const decision={accion,motivo,propuestaNumero:numero||null,tituloOriginal:original||'',
    tituloResultante:final||'',reabierto:aprobado,fechaLocal:ahora,realizadoPorUid:actor.uid};
  // El historial retiene revisiones previas sin atribuirlas falsamente a Administración.
  tx.set(histRef,{envioId:id,tituloId:id,cedula:antes.cedula||'',periodoId:antes.periodoId||'',
    tipo:'INTERVENCION_ADMINISTRATIVA',fechaArchivo:ahora,estadoAnterior:antes.estado||'',
    estadoProcesoAnterior:antes.estadoProceso||'',tituloFinalAnterior:antes.tituloFinal||'',
    tituloCoordinadorAnterior:antes.tituloCoordinador||'',tituloPreferidoNumero:antes.tituloPreferidoNumero||null,
    titulosEnviados:items,revisionCoordinador:antes.revisionCoordinador||null,
    revisionInvestigador:antes.revisionInvestigador||null,revisionAdministrativa:decision});
  const cambios={revisionAdministrativa:decision,ultimaAccionAdministrativa:accion,
    fechaAccionAdministrativa:ahora,actualizadoEnLocal:ahora,actualizadoEn:ahora,
    habilitadoInvestigacionPorAdmin:false,aprobadoPorAdministracion:false,
    requiereRevision:false,permitirReenvio:false,puedeReenviar:false,devueltoPor:'',
    observacionDevolucion:'',procesoCerrado:false};
  if(accion==='APROBAR'||accion==='CORREGIR_APROBAR'){
    Object.assign(cambios,{estado:'APROBADO_FINAL',estadoProceso:'APROBADO_FINAL',
      tituloFinal:final,tituloFinalInvestigacion:null,
      tituloAdminSeleccionadoNumero:numero,tituloAdminSeleccionadoTexto:final,
      aprobadoPorAdministracion:true,procesoCerrado:true,requiereAccionDe:'',
      estadoInvestigador:'',revisionInvestigador:null,investigacionRevisada:false,
      investigacionRevisadaEn:null,resultadoInvestigacion:null,
      titulosEnviados:actualizados,propuestasDetalle:actualizados,
      titulo1:tituloPorNumero(actualizados,1),titulo2:tituloPorNumero(actualizados,2),
      titulo3:tituloPorNumero(actualizados,3)});
    // Una revisión de Coordinación anterior permanece como hecho histórico, no como
    // autoría de la resolución final de Administración.
  }else if(accion==='ENVIAR_COORDINACION'){
    Object.assign(cambios,{estado:'PENDIENTE_COORDINADOR',estadoProceso:'PENDIENTE_COORDINADOR',
      requiereRevision:true,requiereAccionDe:'COORDINACION',estadoCoordinador:'PENDIENTE',
      estadoInvestigador:'',revisionCoordinador:null,revisionInvestigador:null,
      coordinadorRevisado:false,validadoCoordinador:false,validadoCoordinacion:false,
      investigacionRevisada:false,investigacionRevisadaEn:null,resultadoCoordinador:null,
      resultadoInvestigacion:null,tituloCoordinador:null,tituloCoordinadorNumero:null,
      tituloFinal:null,tituloFinalInvestigacion:null,tituloAdminSeleccionadoNumero:null,
      tituloAdminSeleccionadoTexto:'',fechaValidacionCoordinador:null,
      fechaResolucionInvestigacion:null,fechaResolucion:null,fechaColaInvestigacion:null});
  }else{
    Object.assign(cambios,{estado:'PENDIENTE_INVESTIGADOR',estadoProceso:'PENDIENTE_INVESTIGADOR',
      requiereAccionDe:'INVESTIGACION',estadoInvestigador:'PENDIENTE',
      revisionInvestigador:null,investigacionRevisada:false,investigacionRevisadaEn:null,
      resultadoInvestigacion:null,tituloFinal:null,tituloFinalInvestigacion:null,
      tituloAdminSeleccionadoNumero:numero,tituloAdminSeleccionadoTexto:final,
      habilitadoInvestigacionPorAdmin:true,fechaResolucionInvestigacion:null,
      fechaColaInvestigacion:ahora});
    // Se conservan validaciones reales de Coordinación cuando existen;
    // devoluciones o revisiones inexistentes dejan de bloquear la cola nueva.
    const coordValida=['VALIDADO','APROBADO','APROBADO_CON_OBSERVACION'].includes(
      clave(antes.estadoCoordinador||antes.revisionCoordinador&&antes.revisionCoordinador.estado));
    if(aprobado||!coordValida){Object.assign(cambios,{revisionCoordinador:null,estadoCoordinador:'PENDIENTE',
      validadoCoordinador:false,validadoCoordinacion:false,coordinadorRevisado:false,
      tituloCoordinador:null,tituloCoordinadorNumero:null,resultadoCoordinador:null});}
  }
  const historial=Array.isArray(antes.historialProceso)?antes.historialProceso.slice(-96):[];
  cambios.historialProceso=historial.concat([{tipo:'INTERVENCION_ADMINISTRATIVA',...decision,
    estadoAnterior:antes.estado||'',estadoProcesoAnterior:antes.estadoProceso||'',
    tituloFinalAnterior:antes.tituloFinal||'',revisionCoordinadorAnterior:antes.revisionCoordinador||null,
    revisionInvestigadorAnterior:antes.revisionInvestigador||null}]);
  tx.set(ref,cambios,{merge:true});
  tx.set(eventRef,{tipo:'INTERVENCION_ADMINISTRATIVA',accion,modulo:'administradores',
    entidad:'envios',entidadId:id,tituloId:id,cedula:antes.cedula||'',
    periodoId:antes.periodoId||antes.periodoCanonicoId||'',estado:cambios.estado,
    revisionAdministrativa:decision,fechaLocal:ahora,realizadoPorUid:actor.uid});
  return {id,accion,estado:cambios.estado,tituloFinal:cambios.tituloFinal||'',
    historialId:histRef.id,realizadoEn:ahora};
 });
}
module.exports={revisar};
