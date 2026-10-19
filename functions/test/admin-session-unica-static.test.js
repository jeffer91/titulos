'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('las acciones de estudiantes no contienen credenciales ni formulario de segundo acceso',()=>{
 const s=read('administradores/js/estudiantes.admin.js');
 for(const forbidden of ['adminLoginAccionesForm','adminLoginAccionesEmail',
  'adminLoginAccionesPassword','adminCerrarAccionesSesion','adminAccesoAcciones']){
  assert.equal(s.includes(forbidden),false,'Formulario duplicado: '+forbidden);
 }
 for(const action of ['APROBAR','CORREGIR_APROBAR','ENVIAR_COORDINACION','ENVIAR_INVESTIGACION'])
  assert.ok(s.includes(action),'Acción faltante: '+action);
 assert.ok(s.includes('repository.intervenirTitulo(body)'));
});
test('el administrador exige una sola sesión antes de abrir el panel histórico',()=>{
 const html=read('administradores/administrador.html');
 const app=read('administradores/js/administrador.app.js');
 const auth=read('administradores/js/admin.actions.service.js');
 assert.match(html,/<body class="admin-auth-pending">/);
 assert.match(html,/id="adminLoginSeguroForm"/);
 assert.match(html,/id="adminCerrarSesionPrincipal"/);
 assert.match(app,/acciones\.iniciarPanel\(\)/);
 assert.match(auth,/solicitar\('sesion', 'GET'\)/);
 assert.match(auth,/solicitar\('envios\/decision', 'POST', body\)/);
 assert.match(auth,/Authorization: 'Bearer ' \+ token/);
 assert.match(auth,/auth\.signInWithEmailAndPassword/);
 assert.equal(auth.includes('signInAnonymously'),false);
});

test('no inicializa módulos ni enlaza controles antes del inicio de sesión',()=>{
 const app=read('administradores/js/administrador.app.js');
 const comienzo=app.slice(app.indexOf('function iniciar() {'),app.indexOf('var seguro = window.TAAdministradorSeguro'));
 assert.equal(comienzo.includes('conectarEventosBase()'),false);
 assert.equal(comienzo.includes('iniciarModulos()'),false);
 const conexiones=(app.match(/conectarEventosBase\(\);/g)||[]).length;
 const modulos=(app.match(/iniciarModulos\(\);/g)||[]).length;
 assert.equal(conexiones,2);
 assert.equal(modulos,2);
});
test('el transporte valida rol e identidad del endpoint de sesión',()=>{
 const auth=read('administradores/js/admin.actions.service.js');
 assert.match(auth,/payload\.usuario\.rol !== 'administrador'/);
 assert.match(auth,/payload\.usuario\.uid/);
 assert.match(auth,/payload\.ok !== true/);
 assert.match(auth,/return payload\.usuario/);
});
