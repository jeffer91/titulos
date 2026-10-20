/* Transiciones administrativas puras. Firestore conserva el control de permisos. */
(function(root){
'use strict';
function text(v){return String(v||'').trim();}
function propuestas(d){return (Array.isArray(d.titulosEnviados)&&d.titulosEnviados.length?d.titulosEnviados:Array.isArray(d.propuestasDetalle)&&d.propuestasDetalle.length?d.propuestasDetalle:[1,2,3].map(n=>({numero:n,tituloFinal:d['titulo'+n]}))).map((p,i)=>Object.assign({},p,{numero:Number(p.numero||i+1),tituloFinal:text(p.tituloFinal||p.titulo)})).filter(p=>p.tituloFinal);}
function preparar(d,b,fecha){
 const items=propuestas(d),n=Number(b.propuestaNumero),p=items.find(x=>x.numero===n);
 if(!['APROBAR','CORREGIR_APROBAR','APROBAR_COORDINACION','APROBAR_INVESTIGACION','ENVIAR_COORDINACION','ENVIAR_INVESTIGACION','DEVOLVER_ESTUDIANTE','BORRAR_TITULO'].includes(b.accion))throw Error('Acción no disponible.');
 if(!p)throw Error('La propuesta ya no está disponible.');
 if(text(b.motivo).length<8)throw Error('Escribe un motivo de al menos 8 caracteres.');
 if(text(d.estado)!==text(b.estadoEsperado)||text(d.estadoProceso)!==text(b.procesoEsperado)||p.tituloFinal!==text(b.tituloOriginalEsperado)||(b.actualizacionEsperada!=null&&text(d.actualizadoEnLocal)!==b.actualizacionEsperada))throw Error('El expediente cambió. Actualiza la ficha.');
 const corregido=text(b.tituloCorregido).replace(/\s+/g,' ');
 if(b.accion==='CORREGIR_APROBAR'){
  if(corregido.length<20||corregido.length>260)throw Error('El título definitivo debe tener entre 20 y 260 caracteres.');
  if(corregido.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()===p.tituloFinal.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase())throw Error('El título corregido debe ser distinto al original.');
 }else if(corregido)throw Error('La edición solo se permite al aprobar definitivamente desde Administración.');
 const cerrado=d.procesoCerrado===true||d.estado==='APROBADO_FINAL'||d.estadoProceso==='APROBADO_FINAL';
 if(cerrado&&!b.reabrirAprobado)throw Error('Confirma la reapertura del expediente aprobado.');
 if(cerrado&&text(b.motivo).length<15)throw Error('Justifica la reapertura con al menos 15 caracteres.');
 const coord=d.revisionCoordinador||{},nc=Number(d.tituloCoordinadorNumero||coord.tituloSeleccionadoNumero||0);
 const valida=['VALIDADO','APROBADO','APROBADO_CON_OBSERVACION'].includes(d.estadoCoordinador||coord.estado);
 if(['APROBAR_INVESTIGACION','ENVIAR_INVESTIGACION'].includes(b.accion)&&(!valida||nc!==n))throw Error('Aprueba primero esta misma propuesta por Coordinación.');
 const finalTexto=b.accion==='CORREGIR_APROBAR'?corregido:p.tituloFinal;
 const decision={accion:b.accion,motivo:text(b.motivo),propuestaNumero:n,tituloOriginal:p.tituloFinal,tituloResultante:b.accion==='BORRAR_TITULO'?'':finalTexto,fechaLocal:fecha,realizadoPorModulo:'administradores',origen:'ADMINISTRACION',reabierto:cerrado};
 const c={actualizadoEn:fecha,actualizadoEnLocal:fecha,actualizadoPorModulo:'administradores',revisionAdministrativa:decision,ultimaAccionAdministrativa:b.accion,fechaAccionAdministrativa:fecha,historialProceso:(Array.isArray(d.historialProceso)?d.historialProceso.slice(-96):[]).concat([Object.assign({tipo:'INTERVENCION_ADMINISTRATIVA',estadoAnterior:d.estado||'',estadoProcesoAnterior:d.estadoProceso||'',tituloFinalAnterior:d.tituloFinal||'',revisionCoordinadorAnterior:d.revisionCoordinador||null,revisionInvestigadorAnterior:d.revisionInvestigador||null},decision)])};
 function resetInv(){Object.assign(c,{estadoInvestigador:'PENDIENTE',revisionInvestigador:null,investigacionRevisada:false,investigacionRevisadaEn:null,resultadoInvestigacion:null,observacionInvestigacion:'',fechaResolucionInvestigacion:null,fechaResolucion:null,tituloFinal:null,tituloFinalInvestigacion:null,procesoCerrado:false,aprobadoPorAdministracion:false,permitirReenvio:false,puedeReenviar:false,devueltoPor:'',observacionDevolucion:'',motivoDevolucion:'',ultimaObservacion:'',habilitadoInvestigacionPorAdmin:false,reiniciadoPorAdmin:false});}
 function resetCoord(){resetInv();Object.assign(c,{estado:'PENDIENTE_COORDINADOR',estadoProceso:'PENDIENTE_COORDINADOR',requiereAccionDe:'COORDINACION',requiereRevision:true,estadoCoordinador:'PENDIENTE',revisionCoordinador:null,revision:null,coordinadorRevisado:false,validadoCoordinador:false,validadoCoordinacion:false,resultadoCoordinador:null,revisadoPor:'',revisadoPorNombre:'',coordinador:'',ultimoCoordinador:'',revisadoEnLocal:null,tituloCoordinadorAntes:'',tituloCoordinadorCorregido:'',tituloCoordinador:null,tituloCoordinadorNumero:null,tituloSeleccionadoNumero:null,tituloSeleccionadoTexto:'',tituloAdminSeleccionadoNumero:null,tituloAdminSeleccionadoTexto:'',comentarioCoordinador:'',fechaValidacionCoordinador:null,fechaColaInvestigacion:null,estadoInvestigador:''});}
 function pendingInv(){resetInv();Object.assign(c,{estado:'PENDIENTE_INVESTIGADOR',estadoProceso:'PENDIENTE_INVESTIGADOR',requiereAccionDe:'INVESTIGACION',requiereRevision:false,fechaColaInvestigacion:fecha});}
 switch(b.accion){
 case 'APROBAR':
 case 'CORREGIR_APROBAR':{
  // Decisión final de Administración sin simular aprobaciones de otros roles.
  const actualizados=items.map(item=>{
   if(item.numero!==n||b.accion!=='CORREGIR_APROBAR')return item;
   return Object.assign({},item,{tituloOriginalAdministracion:item.tituloOriginalAdministracion||item.tituloFinal,
    tituloCorregidoAdministracion:finalTexto,corregidoAdministracion:true,
    tituloFinal:finalTexto,titulo:finalTexto});
  });
  Object.assign(c,{
   estado:'APROBADO_FINAL',estadoProceso:'APROBADO_FINAL',procesoCerrado:true,
   requiereAccionDe:'',requiereRevision:false,aprobadoPorAdministracion:true,
   permitirReenvio:false,puedeReenviar:false,devueltoPor:'',
   observacionDevolucion:'',motivoDevolucion:'',ultimaObservacion:'',
   comentarioCoordinador:'',observacionInvestigacion:'',
   estadoInvestigador:'',revisionInvestigador:null,investigacionRevisada:false,
   investigacionRevisadaEn:null,resultadoInvestigacion:null,observacionInvestigacion:'',
   fechaResolucionInvestigacion:null,fechaColaInvestigacion:null,
   habilitadoInvestigacionPorAdmin:false,reiniciadoPorAdmin:false,
   tituloFinal:finalTexto,tituloFinalInvestigacion:null,fechaResolucion:fecha,
   tituloAdminSeleccionadoNumero:n,tituloAdminSeleccionadoTexto:finalTexto,
   titulosEnviados:actualizados,propuestasDetalle:actualizados,propuestas:actualizados
  });
  [1,2,3].forEach(k=>{const item=actualizados.find(x=>x.numero===k);c['titulo'+k]=item?item.tituloFinal:'';});
  if(!valida)Object.assign(c,{revisionCoordinador:null,revision:null,estadoCoordinador:'',
   coordinadorRevisado:false,validadoCoordinador:false,validadoCoordinacion:false,
   tituloCoordinador:null,tituloCoordinadorNumero:null,resultadoCoordinador:null,
   tituloSeleccionadoNumero:null,tituloSeleccionadoTexto:'',
   fechaValidacionCoordinador:null,coordinador:'',ultimoCoordinador:'',revisadoPor:'',revisadoPorNombre:''});
  break;
 }
 case 'APROBAR_COORDINACION':{
 pendingInv();const r={estado:'VALIDADO',accion:'APROBAR',observacion:text(b.motivo),comentario:text(b.motivo),fechaLocal:fecha,tituloSeleccionadoNumero:n,tituloSeleccionadoTexto:p.tituloFinal,realizadoPorModulo:'administradores',origen:'ADMINISTRACION'};
 Object.assign(c,{estadoCoordinador:'VALIDADO',revisionCoordinador:r,revision:r,coordinadorRevisado:true,validadoCoordinador:true,validadoCoordinacion:true,resultadoCoordinador:'APROBADO_SIN_CAMBIOS',revisadoPor:'ADMINISTRACION',revisadoPorNombre:'Administración',coordinador:'Administración',ultimoCoordinador:'Administración',revisadoEnLocal:fecha,tituloCoordinadorAntes:p.tituloFinal,tituloCoordinadorCorregido:'',tituloCoordinador:p.tituloFinal,tituloCoordinadorNumero:n,tituloSeleccionadoNumero:n,tituloSeleccionadoTexto:p.tituloFinal,tituloAdminSeleccionadoNumero:n,tituloAdminSeleccionadoTexto:p.tituloFinal,comentarioCoordinador:text(b.motivo),fechaValidacionCoordinador:fecha});break;}
 case 'APROBAR_INVESTIGACION':resetInv();Object.assign(c,{estado:'APROBADO_FINAL',estadoProceso:'APROBADO_FINAL',estadoInvestigador:'APROBADO',revisionInvestigador:{estado:'APROBADO',accion:'APROBAR',observacion:text(b.motivo),fechaLocal:fecha,propuestaNumero:n,realizadoPorModulo:'administradores',origen:'ADMINISTRACION'},investigacionRevisada:true,investigacionRevisadaEn:fecha,resultadoInvestigacion:'APROBADO_SIN_CAMBIOS',observacionInvestigacion:text(b.motivo),fechaResolucionInvestigacion:fecha,fechaResolucion:fecha,tituloFinal:p.tituloFinal,tituloFinalInvestigacion:p.tituloFinal,procesoCerrado:true,requiereAccionDe:'',requiereRevision:false});break;
 case 'ENVIAR_COORDINACION':resetCoord();break;
 case 'ENVIAR_INVESTIGACION':pendingInv();break;
 case 'DEVOLVER_ESTUDIANTE':resetCoord();Object.assign(c,{estado:'DEVUELTO',estadoProceso:'DEVUELTO_ADMIN',requiereAccionDe:'ESTUDIANTE',permitirReenvio:true,puedeReenviar:true,devueltoPor:'ADMINISTRACION',observacionDevolucion:text(b.motivo),motivoDevolucion:text(b.motivo),ultimaObservacion:text(b.motivo)});break;
 case 'BORRAR_TITULO':{
 const left=items.filter(x=>x.numero!==n);Object.assign(c,{titulosEnviados:left,propuestasDetalle:left,propuestas:left});
 [1,2,3].forEach(k=>{const r=left.find(x=>x.numero===k);c['titulo'+k]=r?r.tituloFinal:'';});
 if(n===nc||n===Number(d.tituloAdminSeleccionadoNumero)||p.tituloFinal===d.tituloFinal||!left.length)resetCoord();
 if(n===Number(d.tituloPreferidoNumero))Object.assign(c,{tituloPreferidoNumero:null,tituloPreferidoTexto:'',tituloElegido:'',tituloVisible:''});
 if(!left.length)Object.assign(c,{estado:'BORRADOR_REINICIADO',estadoProceso:'BORRADOR_REINICIADO',reiniciadoPorAdmin:true,requiereAccionDe:'ESTUDIANTE',permitirReenvio:true,puedeReenviar:true,intentosUsados:0});break;}
 }
 return c;
}
const api={preparar:preparar,propuestas:propuestas};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TAAdminWorkflow=Object.freeze(api);
})(typeof window!=='undefined'?window:this);
