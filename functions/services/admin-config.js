'use strict';
// Administración: configurar procesos sin admitir tokens o secretos desde el navegador.
const {canonico}=require('./periodos-activos');
const safeFields=new Set([
 'procesoActivo','enviosHabilitados','periodoActivo','periodoActivoId','periodoActivoLabel',
 'periodoActivoIdNormalizado','periodoActivoDesactivado','periodosActivos',
 'periodosActivosLabels','maxIntentos','propuestasObligatorias','iaActiva','proveedorIA',
 'proveedorIALabel','iaActualizadoEn'
]);
const publicKeys=new Set([...safeFields,'sheetsActivo','sheetsOrigen','actualizadoEn']);
function fail(status,code){const e=new Error(code);e.status=status;e.code=code;throw e;}
function text(value){return String(value===undefined||value===null?'':value).trim();}
function publicConfig(src){
 const result={};
 for(const key of publicKeys)if(src&&src[key]!==undefined)result[key]=src[key];
 // Sheets permanece deshabilitado en modo seguro hasta disponer de backend aislado.
 result.sheetsActivo=false;
 return result;
}
function validate(body){
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'CONFIGURACION_INVALIDA');
 const keys=Object.keys(body);
 if(!keys.length||keys.length>25)fail(422,'CONFIGURACION_VACIA_O_EXCESIVA');
 if(keys.some(x=>!safeFields.has(x)))fail(422,'CAMPO_NO_AUTORIZADO');
 const copy={};
 for(const key of keys){
  const value=body[key];
  if(['procesoActivo','enviosHabilitados','periodoActivoDesactivado','iaActiva'].includes(key)){
   if(typeof value!=='boolean')fail(422,'TIPO_INVALIDO');
  }else if(['maxIntentos','propuestasObligatorias'].includes(key)){
   if(!Number.isInteger(value)||value<1||value>5)fail(422,'RANGO_INVALIDO');
   if(key==='propuestasObligatorias'&&value!==3)fail(422,'TRES_PROPUESTAS_OBLIGATORIAS');
  }else if(key==='periodosActivos'||key==='periodosActivosLabels'){
   if(!Array.isArray(value)||value.length>30||value.some(x=>typeof x!=='string'||x.length>150))fail(422,'PERIODOS_INVALIDOS');
  }else if(key==='periodoActivo'){
   if(value!==null&&typeof value!=='string'&&!(typeof value==='object'&&!Array.isArray(value)&&typeof value.id==='string'&&value.id.length<80))fail(422,'PERIODO_INVALIDO');
  }else if(typeof value!=='string'||value.length>200){
   fail(422,'TEXTO_INVALIDO');
  }
  if(key==='periodosActivos' && (value.some(v=>!canonico(v)) ||
     new Set(value.map(canonico)).size!==value.length))fail(422,'PERIODOS_INVALIDOS');
  if(key==='periodoActivoId' && value!=='' && !canonico(value))fail(422,'PERIODO_INVALIDO');
  if(key==='periodoActivo' && value!==null && value!=='' &&
     !canonico(typeof value==='object'?value.id:value))fail(422,'PERIODO_INVALIDO');
  copy[key]=value;
 }
 return copy;
}
function safeProvider(doc){
 return {id:doc.id,proveedor:doc.proveedor||doc.id,nombre:text(doc.nombre),
  activo:doc.activo===true,modelo:text(doc.modelo||doc.model),
  endpoint:'',actualizadoEn:doc.actualizadoEn||''};
}
module.exports={publicConfig,validate,safeProvider,fail,text};
