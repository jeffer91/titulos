'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const codigo=fs.readFileSync(path.join(root,'administradores/js/comunicaciones.admin.js'),'utf8');
function modulo(){
 const window={TAAdministradorRepository:{},TAAdminUI:{},location:{href:''}};
 const context={window,console,Set,Map,TextEncoder,Uint8Array,Date,Promise,btoa,unescape,encodeURIComponent};
 vm.runInNewContext(codigo,context);
 return window.TAAdminComunicaciones;
}
test('WhatsApp normaliza números de Ecuador y rechaza teléfonos dudosos',()=>{
 const x=modulo();
 assert.equal(x.telefonoEcuador('0984082332'),'593984082332');
 assert.equal(x.telefonoEcuador('+593 984 082 332'),'593984082332');
 assert.equal(x.telefonoEcuador('9876'),'');
 assert.equal(x.telefonoEcuador('022345678'),'');
});
test('extrae correos personales e institucionales sin duplicados ni destinos falsos',()=>{
 const x=modulo();
 const r=x.contactos({cedula:'1700000001',correoPersonal:'TEST@DOMINIO.COM',
  correoInstitucional:'test@dominio.com',celular:'0991112222',
  raw:{correoPersonal:'personal@example.org',telefono:'0984082332'}});
 assert.deepEqual(Array.from(r.emails),['test@dominio.com','personal@example.org']);
 assert.equal(r.telefono,'0991112222');
});
test('correo personalizado incluye estudiante, carrera, periodo y enlace institucional',()=>{
 const x=modulo();
 const t=x.plantilla({nombres:'ESTUDIANTE EJEMPLO',carrera:'CONTABILIDAD',
   periodoLabel:'Mayo 2026 a Noviembre 2026',cedula:'1700000001'},false);
 assert.match(t,/ESTUDIANTE EJEMPLO/);
 assert.match(t,/CONTABILIDAD/);
 assert.match(t,/Mayo 2026 a Noviembre 2026/);
 assert.match(t,/estudiantes\//);
 assert.match(t,/Una sola acción principal/);
 assert.doesNotMatch(t,/Se adjunta/);
});
test('solo se avisa a quien no envió propuestas, no a aprobados ni registros legados con título',()=>{
 const x=modulo();
 assert.equal(x.sinTitulo({titulo:null,titulosEnviados:[]}),true);
 assert.equal(x.sinTitulo({titulo:{estadoProceso:'BORRADOR_REINICIADO'},titulosEnviados:[]}),true);
 assert.equal(x.sinTitulo({titulo:{estadoProceso:'APROBADO_FINAL'},titulosEnviados:[]}),false);
 assert.equal(x.sinTitulo({titulo:{titulo1:'Propuesta previa'},titulosEnviados:[]}),false);
 assert.equal(x.sinTitulo({titulo:{estadoProceso:'PENDIENTE_COORDINADOR'},titulosEnviados:[{tituloFinal:'Propuesta'}]}),false);
});
test('el envío Gmail construye un mensaje MIME con PDF real adjunto y encabezados individuales',()=>{
 const x=modulo();
 const pdf=btoa('%PDF-1.4\n%%EOF\n');
 const raw=x.generarMime({nombres:'PERSONA DE PRUEBA',carrera:'CONTABILIDAD',
   periodoLabel:'Mayo 2026 a Noviembre 2026',correoPersonal:'prueba@example.com'},
   pdf,'Guia_institucional_titulos.pdf');
 const buf=Buffer.from(raw.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8');
 assert.match(buf,/To: prueba@example\.com/);
 assert.match(buf,/Content-Disposition: attachment; filename="Guia_institucional_titulos\.pdf"/);
 assert.match(buf,/Content-Type: application\/pdf/);
 assert(buf.includes(pdf),'El adjunto PDF debe conservar los mismos bytes en base64');
});
test('panel incorpora W/C, carga el PDF original y requiere confirmación antes de enviar',()=>{
 const html=fs.readFileSync(path.join(root,'administradores/administrador.html'),'utf8');
 const js=fs.readFileSync(path.join(root,'administradores/js/estudiantes.admin.js'),'utf8');
 assert.match(html,/id="btnCorreoMasivo"/);
 assert.match(html,/id="comPdf".*type="file"|id="comPdf" type="file"/);
 assert.match(html,/id="comBtnEnviar"/);
 assert.match(html,/id="comGoogleClientId"/);
 assert.match(js,/btnW\.textContent='W'/);
 assert.match(js,/btnC\.textContent='C'/);
 assert.match(codigo,/window\.confirm\('CONFIRMAR ENVÍO REAL/);
 assert.match(codigo,/https:\/\/www.googleapis.com\/auth\/gmail\.send/);
 assert(!codigo.includes('setInterval('));
});
