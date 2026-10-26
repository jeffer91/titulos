'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const vig=require('../shared/js/expediente-vigente.js');
const periodo='2026-05__2026-11',cedula='1723452999';
function envio(id,fecha,estado){return {id,periodoId:periodo,cedula,fechaEnvio:fecha,estadoProceso:estado,
 titulosEnviados:[{numero:1,tituloFinal:'Propuesta académica'}]};}
test('reenvío de octubre prevalece sobre validación anterior, sin borrar documentos',()=>{
 const viejo=envio('antiguo','2026-10-19T08:11:00-05:00','PENDIENTE_INVESTIGADOR');
 const nuevo=envio('reenviado','2026-10-24T13:03:00-05:00','PENDIENTE_COORDINADOR');
 const docs=[viejo,nuevo]; assert.equal(vig.elegir(docs),nuevo);
 assert.deepEqual(vig.unicos(docs),[nuevo]);assert.equal(docs.length,2);
});
test('nueva aprobación en Firestore prevalece sobre el reenvío',()=>{
 const anterior=envio('uno','2026-10-24T13:03:00-05:00','PENDIENTE_COORDINADOR');
 const actual=envio('dos','2026-10-24T13:03:00-05:00','PENDIENTE_INVESTIGADOR');
 actual.actualizadoEn={seconds:1793013000,nanoseconds:0};
 assert.equal(vig.elegir([anterior,actual]),actual);
});
test('nunca mezcla otra cédula o período',()=>{
 const a=envio('a','2026-10-24','PENDIENTE_COORDINADOR');
 const b={...a,id:'b',cedula:'1710000000'},c={...a,id:'c',periodoId:'2026-04__2026-09'};
 assert.equal(vig.unicos([a,b,c]).length,3);
});
test('las cuatro pantallas incluyen el mismo selector',()=>{
 ['estudiantes/estudiante.html','coordinadores/coordinador.html',
 'investigadores/investigador.html','administradores/administrador.html'].forEach(p=>{
  assert.match(fs.readFileSync(path.join(base,p),'utf8'),/expediente-vigente\.js/);
 });
});
