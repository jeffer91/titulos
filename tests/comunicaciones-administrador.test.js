'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'administradores/js/comunicaciones.admin.js'),'utf8');
const html=fs.readFileSync(path.join(root,'administradores/administrador.html'),'utf8');
const studentsSource=fs.readFileSync(path.join(root,'administradores/js/estudiantes.admin.js'),'utf8');
function item(cedula,extras={}){
  return {cedula,nombres:'Estudiante '+cedula,carrera:'ENFERMERÍA',
   periodoLabel:'Mayo 2026 a Noviembre 2026',periodoId:'2026-05__2026-11',
   titulo:null,titulosEnviados:[],correoPersonal:cedula+'@example.com',...extras};
}
function montar(filas=[],cantidad='15'){
 const ui={
   qs:selector=>selector==='#comCantidad'?{value:String(cantidad)}:null,
   setText(){},escapeHtml:val=>String(val),
 };
 const win={
  TAAdministradorRepository:{},TAAdminUI:ui,location:{},
  TAAdminEstudiantes:{obtenerFiltrados:()=>filas},
  prompt(){return null;},alert(){},confirm(){return true;},
  open(){return {opener:{}};}
 };
 const context={window:win,document:{},console,Promise,Set,Map,Date,
  Number,String,Uint8Array,encodeURIComponent,decodeURIComponent};
 vm.runInNewContext(source,context);
 return {app:win.TAAdminComunicaciones,window:win,ui};
}
test('botones W y C permanecen, pero C ya no usa Gmail ni mailto',()=>{
 assert.match(studentsSource,/btnW\.textContent='W'/);
 assert.match(studentsSource,/btnC\.textContent='C'/);
 assert.match(source,/outlook\.office\.com\/mail\/deeplink\/compose/);
 assert.doesNotMatch(source,/gmail\.googleapis|initTokenClient|mailto:|enviarTodos\(/);
});
test('panel pide cantidad por tanda, muestra pendientes y permite reabrir pendientes',()=>{
 ['comTotal','comConCorreo','comSinContacto','comPendientes','comAbiertos',
 'comCantidad','comBtnPreparar','comBtnReiniciar','comDestinatarios','comVistaPrevia'].forEach(id=>{
  assert(html.includes('id="'+id+'"'),'Falta '+id);
 });
 assert.match(html,/max="30"/);
 assert.match(html,/value="15"/);
 assert.match(html,/adjúntala manualmente/);
 assert(!html.includes('id="comGoogleClientId"'));
 assert(!html.includes('id="comBtnGmail"'));
 assert(!html.includes('id="comPdf"'));
 assert.match(studentsSource,/obtenerFiltrados: function/);
});
test('deeplink de Outlook codifica nombre, carrera, periodo, destinatario y asunto',()=>{
 const {app}=montar();
 const estudiante=item('1700000001',{nombres:'María Álava',
  correoPersonal:'persona@example.com'});
 const link=app.enlaceOutlook(estudiante);
 const u=new URL(link);
 assert.equal(u.origin,'https://outlook.office.com');
 assert.equal(u.pathname,'/mail/deeplink/compose');
 assert.equal(u.searchParams.get('to'),'persona@example.com');
 assert.match(u.searchParams.get('subject'),/ITSQMET/);
 assert.match(u.searchParams.get('body'),/María Álava/);
 assert.match(u.searchParams.get('body'),/ENFERMERÍA/);
 assert.match(u.searchParams.get('body'),/Mayo 2026 a Noviembre 2026/);
 assert.match(u.searchParams.get('body'),/tres propuestas de títulos/);
 assert.equal(app.enlaceOutlook(item('1700000002',{correoPersonal:''})),'');
});
test('Outlook coloca institucional primero y personal despues en un mismo borrador',()=>{
 const {app}=montar();
 const estudiante=item('1700000001',{
  correoPersonal:'personal@example.com',
  correoInstitucional:'alumno@itsqmet.edu.ec'
 });
 const c=app.contactos(estudiante);
 assert.deepEqual(Array.from(c.institucional),['alumno@itsqmet.edu.ec']);
 assert.deepEqual(Array.from(c.emails),['alumno@itsqmet.edu.ec','personal@example.com']);
 const to=new URL(app.enlaceOutlook(estudiante)).searchParams.get('to');
 assert.equal(to,'alumno@itsqmet.edu.ec;personal@example.com');
});
test('se reconoce correo institucional desde fuentes academicas con claves alternativas',()=>{
 const {app}=montar();
 const estudiante=item('1700000002',{
  correoPersonal:'persona@example.com',
  raw:{'Correo Institucional':'docente@itsqmet.edu.ec'}
 });
 assert.equal(new URL(app.enlaceOutlook(estudiante)).searchParams.get('to'),
  'docente@itsqmet.edu.ec;persona@example.com');
 const generico=item('1700000003',{
  correoPersonal:'',
  raw:{email:'alumna@estudiantes.itsqmet.edu.ec'}
 });
 assert.equal(app.contactos(generico).institucional[0],'alumna@estudiantes.itsqmet.edu.ec');
});
test('sin correo institucional se señala falta pero puede usar personal sin inventar dirección',()=>{
 const {app}=montar();
 const soloPersonal=item('1700000004',{correoPersonal:'personal@example.com'});
 assert.equal(app.contactos(soloPersonal).institucional.length,0);
 assert.equal(new URL(app.enlaceOutlook(soloPersonal)).searchParams.get('to'),'personal@example.com');
 const mismo=item('1700000005',{
  correoPersonal:'estudiante@itsqmet.edu.ec',
  correoInstitucional:'estudiante@itsqmet.edu.ec'
 });
 assert.equal(app.contactos(mismo).emails.length,1);
});
test('sin titulo excluye inscritos en complexivo, aprobados, devueltos y títulos legados',()=>{
 const {app}=montar();
 assert.equal(app.sinTitulo(item('1700000001')),true);
 assert.equal(app.sinTitulo(item('1700000002',{raw:{modalidadTitulacion:'EXAMEN COMPLEXIVO'}})),false);
 assert.equal(app.sinTitulo(item('1700000003',{titulo:{estadoProceso:'APROBADO_FINAL'}})),false);
 assert.equal(app.sinTitulo(item('1700000004',{titulo:{titulo1:'Titulo original'}})),false);
 assert.equal(app.sinTitulo(item('1700000005',{titulo:{estadoProceso:'DEVUELTO'},titulosEnviados:[{tituloFinal:'X'}]})),false);
 assert.equal(app.sinTitulo(item('1700000006',{titulo:{estadoProceso:'PENDIENTE_INVESTIGADOR'},titulosEnviados:[]})),false);
 assert.equal(app.sinTitulo(item('1700000007',{titulo:{estadoProceso:'PENDIENTE_COORDINADOR'},titulosEnviados:[]})),false);
 assert.equal(app.sinTitulo(item('1700000008',{titulo:{propuestasDetalle:[{titulo:'Propuesta'}]},titulosEnviados:[]})),false);
});
test('solo cuenta los filtrados visibles y elimina duplicados por cedula',async()=>{
 const uno=item('1700000001'),repetido=item('1700000001',{periodoId:'2026-04__2026-09'});
 const dos=item('1700000002'),tres=item('1700000003',{correoPersonal:''});
 const aprobado=item('1700000004',{titulo:{estadoProceso:'APROBADO_FINAL'}});
 const {app}=montar([uno,repetido,dos,tres,aprobado]);
 await app.abrirMasivo();
 const lista=await app.obtenerCandidatos();
 assert.equal(lista.length,3);
 assert.deepEqual(Array.from(lista.map(x=>x.cedula)),['1700000001','1700000002','1700000003']);
});
test('15 solicitados abre hasta 15 y la siguiente tanda continua sin duplicados',async()=>{
 const filas=Array.from({length:18},(_,i)=>item(String(1700000000+i)));
 const {app}=montar(filas,'15');
 await app.abrirMasivo();
 const urls=[];
 const abrir=(url,target)=>{urls.push(url);assert.equal(target,'_blank');return {opener:'x'};};
 const primero=app.abrirLote(abrir);
 assert.equal(primero.abiertos,15);
 assert.equal(primero.bloqueados,false);
 assert.equal(urls.length,15);
 assert.equal(new Set(urls).size,15);
 const segundo=app.abrirLote(abrir);
 assert.equal(segundo.abiertos,3);
 assert.equal(urls.length,18);
 assert.equal(app.abrirLote(abrir).abiertos,0);
});
test('si el navegador bloquea pestañas no se pierden los destinatarios no abiertos',async()=>{
 const {app}=montar([item('1700000001'),item('1700000002'),item('1700000003')],'3');
 await app.abrirMasivo();
 let calls=0;
 const blocked=app.abrirLote(()=>{calls++;return calls===1?{}:null;});
 assert.equal(blocked.abiertos,1);
 assert.equal(blocked.bloqueados,true);
 const next=app.abrirLote(()=>({}));
 assert.equal(next.abiertos,2);
 assert.equal(app.abrirLote(()=>({})).abiertos,0);
});
test('no permite cantidades negativas, fraccionarias ni mayores a 30',async()=>{
 const filas=[item('1700000001')],{app,ui}=montar(filas,15);
 await app.abrirMasivo();
 ui.qs=selector=>selector==='#comCantidad'?({value:'31'}):null;
 assert.equal(app.abrirLote(()=>({})).abiertos,0);
 ui.qs=selector=>selector==='#comCantidad'?({value:'1.5'}):null;
 assert.equal(app.abrirLote(()=>({})).abiertos,0);
 ui.qs=selector=>selector==='#comCantidad'?({value:'-1'}):null;
 assert.equal(app.abrirLote(()=>({})).abiertos,0);
});
test('W sigue generando WhatsApp con mensaje, y plantilla C distingue aprobados',()=>{
 const {app}=montar();
 const a=app.telefonoEcuador('0984082332');
 assert.equal(a,'593984082332');
 assert.equal(app.telefonoEcuador('1726155474'),'');
 const aprobado=item('1700000001',{titulo:{estadoProceso:'APROBADO_FINAL'}});
 assert.match(app.plantilla(aprobado,false),/No necesita volver a enviar/);
});
