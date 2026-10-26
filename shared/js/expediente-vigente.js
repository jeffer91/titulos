/* Expediente vigente: misma selección en todos los módulos públicos.
 * Solo deduplica vistas: nunca elimina ni escribe expedientes en Firestore. */
(function(root){
 'use strict';
 function fecha(v){
  if(!v)return 0;
  if(typeof v.toMillis==='function')return v.toMillis();
  if(typeof v.seconds==='number')return v.seconds*1000+Math.floor((v.nanoseconds||0)/1000000);
  if(typeof v._seconds==='number')return v._seconds*1000;
  if(typeof v==='number')return v>100000000000?v:v*1000;
  var t=Date.parse(String(v));return Number.isFinite(t)?t:0;
 }
 function datos(x){return x&&(x.raw||x)||{};}
 function cedula(x){
  var d=datos(x),c=String(d.cedula||d.numeroIdentificacion||x&&x.cedula||'').replace(/\D/g,'');
  return c.length===9?'0'+c:c.length===10?c:'';
 }
 function periodo(x){
  var d=datos(x),v=d.periodoCanonicoId||d.periodoId||d.periodo&&d.periodo.id||x&&x.periodoId||'';
  var m=/^(\d{4})[-_](0?[1-9]|1[0-2])(?:__|[-_\s]+)(\d{4})[-_](0?[1-9]|1[0-2])$/.exec(String(v).trim());
  return m?m[1]+'-'+String(m[2]).padStart(2,'0')+'__'+m[3]+'-'+String(m[4]).padStart(2,'0'):'';
 }
 function ultima(x){
  var d=datos(x);
  return Math.max.apply(Math,[0].concat([d.actualizadoEn,d.actualizadoEnLocal,
   d.fechaResolucionInvestigacion,d.investigacionRevisadaEn,d.fechaValidacionCoordinador,
   d.fechaResolucion,d.fechaEnvio,d.enviadoEn,d.creadoEn].map(fecha)));
 }
 function comparar(a,b){
  var fa=ultima(a),fb=ultima(b);if(fa!==fb)return fa-fb;
  var x=datos(a),y=datos(b),va=Number(x.versionActual||x.numeroEnvios||0),
   vb=Number(y.versionActual||y.numeroEnvios||0);
  if(va!==vb)return va-vb;
  var ia=String(a&&(a.id||a._docId)||x.id||''),ib=String(b&&(b.id||b._docId)||y.id||'');
  var pa=ia===periodo(a)+'__'+cedula(a)?1:0,pb=ib===periodo(b)+'__'+cedula(b)?1:0;
  return pa!==pb?pa-pb:ia.localeCompare(ib);
 }
 function elegir(lista){var mayor=null;(lista||[]).forEach(function(x){if(x&&(!mayor||comparar(x,mayor)>0))mayor=x;});return mayor;}
 function unicos(lista){
  var out=[],indices=Object.create(null);
  (lista||[]).forEach(function(x){
   if(!x)return;
   var c=cedula(x),p=periodo(x);
   if(!c||!p){out.push(x);return;}
   var k=p+'|'+c;
   if(indices[k]===undefined){indices[k]=out.length;out.push(x);}
   else if(comparar(x,out[indices[k]])>0)out[indices[k]]=x;
  });
  return out;
 }
 var api=Object.freeze({fecha:fecha,cedula:cedula,periodo:periodo,ultima:ultima,
  comparar:comparar,elegir:elegir,unicos:unicos});
 if(root)root.TAExpedienteVigente=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:null);
