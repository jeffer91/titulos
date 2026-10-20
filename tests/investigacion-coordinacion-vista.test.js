'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'investigadores/js/investigador.app.js'),'utf8');
const repository=fs.readFileSync(path.join(root,'investigadores/js/investigador.repository.js'),'utf8');

function propuesta(numero,texto){return {numero,tituloFinal:texto};}
function caso(extra={}){
 return Object.assign({
  id:'caso',nombres:'Estudiante prueba',cedula:'0000000000',carrera:'Carrera',
  periodoId:'2026-05__2026-11',estado:'PENDIENTE_INVESTIGADOR',
  estadoProceso:'PENDIENTE_INVESTIGADOR',estadoCoordinador:'VALIDADO',
  validadoCoordinador:true,
  titulosEnviados:[propuesta(1,'Título uno'),propuesta(2,'Título dos'),propuesta(3,'Título tres')]
 },extra);
}
function crearDocumento(){
 return {
  children:[],dataset:{},classList:{toggle(){}},querySelectorAll:()=>[],
  appendChild(x){this.children.push(x);return x;},
  addEventListener(){},setAttribute(){},
 };
}
function render(d){
 const desde=app.indexOf('  function crearExpediente(titulo) {');
 const hasta=app.indexOf('  function botonDecision(',desde);
 assert(desde>=0&&hasta>desde,'El formulario de Investigación debe existir');
 const codigo=app.slice(desde,hasta);
 const crear=new Function('document','escapeHtml','formatearPeriodo','formatearFecha','botonDecision',
   codigo+'\nreturn crearExpediente;')(
   {createElement:()=>crearDocumento()},
   s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
   s=>String(s||''),s=>String(s||''),()=>crearDocumento());
 return crear(d);
}
function texto(el){return [el.innerHTML||'',el.textContent||'',...el.children.flatMap(c=>[texto(c)])].join('\n');}
function bloque(el,clase){return el.children.find(c=>c.className===clase);}
function editor(el){return bloque(el,'research-title-editor').children.find(c=>c.rows===3);}

test('identifica y destaca arriba el título elegido por Coordinación',()=>{
 const d=caso({tituloCoordinadorNumero:2,tituloCoordinador:'Título dos',
   revisionCoordinador:{tituloSeleccionadoNumero:2,tituloSeleccionadoTexto:'Título dos'}});
 const el=render(d),resumen=bloque(el,'coord-selection-summary');
 const cards=bloque(el,'proposals proposals--review');
 assert(resumen&&cards);
 assert(el.children.indexOf(resumen)<el.children.indexOf(cards));
 assert.match(resumen.innerHTML,/Elegido por Coordinación · Título 2/);
 assert.match(cards.children[1].innerHTML,/Seleccionado por Coordinación/);
 assert.equal(editor(el).value,'Título dos');
});
test('muestra original y corregido aunque no existan indicadores históricos',()=>{
 const d=caso({tituloCoordinadorNumero:2,tituloCoordinador:'Título dos corregido',
   tituloCoordinadorAntes:'Título dos',
   revisionCoordinador:{tituloSeleccionadoNumero:2,tituloSeleccionadoTexto:'Título dos corregido',
     tituloSeleccionadoTextoOriginal:'Título dos'},
   titulosEnviados:[propuesta(1,'Título uno'),propuesta(2,'Título dos corregido'),propuesta(3,'Título tres')]});
 const el=render(d),cards=bloque(el,'proposals proposals--review');
 assert.match(cards.children[1].innerHTML,/Corrección de Coordinación/);
 assert.match(cards.children[1].innerHTML,/Antes:<\/b> Título dos/);
 assert.match(cards.children[1].innerHTML,/Después:<\/b> Título dos corregido/);
 assert.match(bloque(el,'coord-selection-summary').innerHTML,/Antes: Título dos/);
});
test('sin selección identificable no elige por defecto Título 1',()=>{
 const el=render(caso());
 assert.match(texto(el),/no consta una propuesta identificable/);
 assert.equal(editor(el).value||'','');
});
test('la referencia administrativa no sustituye el historial de Coordinación',()=>{
 const el=render(caso({habilitadoInvestigacionPorAdmin:true,
   tituloCoordinadorNumero:1,tituloCoordinador:'Título uno',
   tituloAdminSeleccionadoNumero:3,tituloAdminSeleccionadoTexto:'Título tres'}));
 assert.match(bloque(el,'coord-selection-summary').innerHTML,/Coordinación · Título 1/);
 assert.match(bloque(el,'proposals proposals--review').children[2].innerHTML,/Seleccionado por Administración/);
 assert.equal(editor(el).value,'Título tres');
});
test('un número histórico inexistente no atribuye una propuesta equivocada',()=>{
 const el=render(caso({tituloCoordinadorNumero:7,tituloCoordinador:'Texto que no coincide'}));
 assert.match(texto(el),/no consta una propuesta identificable/);
 assert.equal(editor(el).value||'','');
});
test('normaliza revisiones históricas de Coordinación sin confundir revisiones de Investigación',async()=>{
 const doc=caso({revision:{accion:'VALIDAR_CORRECCION',estado:'VALIDADO',coordinadorId:'coord',
  tituloSeleccionadoNumero:2,tituloSeleccionadoTexto:'Título dos corregido',
  tituloSeleccionadoTextoOriginal:'Título dos'},
  titulosEnviados:[propuesta(1,'Título uno'),propuesta(2,'Título dos corregido'),propuesta(3,'Título tres')]});
 const ctx={window:{TA_INVESTIGADORES_CONFIG:{collections:{config:'configuracion',titulos:'envios'}},
  TAInvestigadorFirebaseService:{leerDocumento:async()=>({periodosActivos:['2026-05__2026-11']}),
   listarDocumentos:async()=>[doc]}},console};
 vm.runInNewContext(repository,ctx);
 const arr=await ctx.window.TAInvestigadorRepository.listarTitulosHabilitados({activo:true,pinActivo:true});
 assert.equal(arr.length,1);
 assert.equal(arr[0].tituloCoordinadorNumero,2);
 assert.equal(arr[0].tituloCoordinador,'Título dos corregido');
 assert.equal(arr[0].tituloCoordinadorAntes,'Título dos');
 assert.match(bloque(render(arr[0]),'coord-selection-summary').innerHTML,/Elegido por Coordinación · Título 2/);
});
