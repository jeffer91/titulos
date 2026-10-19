'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('administración sin campos, ventanas ni botones de acceso',()=>{
 const html=read('administradores/administrador.html');
 const s=read('administradores/js/admin.actions.service.js');
 for(const texto of ['id="adminLoginSeguro"','id="adminLoginSeguroForm"',
  'id="adminLoginCorreo"','id="adminLoginClave"',
  'id="adminIniciarSesionPrincipal"','id="adminCerrarSesionPrincipal"',
  'autocomplete="current-password"']){
  assert.ok(!html.includes(texto),'No debe existir: '+texto);
 }
 for(const token of ['signInWithEmailAndPassword','Inicia sesión','iniciar sesión',
  'Acceso de Administración','adminLoginCorreo','adminLoginSeguro']){
  assert.equal(s.includes(token),false,'No debe solicitar acceso: '+token);
 }
 assert.match(html,/<body>/);
});

test('editor académico oculta acciones si no hay sesión validada',()=>{
 const s=read('administradores/js/estudiantes.admin.js');
 assert.match(s,/sesion\.autorizadoLocal\(\)/);
 assert.match(s,/admin-actions__form/);
 assert.match(s,/habilitado \? '' : ' hidden'/);
 assert.match(s,/repository\.intervenirTitulo\(body\)/);
 assert.equal(s.includes('admin-actions__read-only'),false);
 assert.equal(s.includes('adminConfirmarTituloCorregido'),false);
 for(const action of ['APROBAR','CORREGIR_APROBAR','ENVIAR_COORDINACION','ENVIAR_INVESTIGACION'])
  assert.ok(s.includes(action));
});
test('backend conserva autorización obligatoria por token y rol',()=>{
 const service=read('administradores/js/admin.actions.service.js');
 const backend=read('functions/shared/security.js');
 assert.match(service,/Authorization: 'Bearer ' \+ token/);
 assert.match(service,/solicitar\('sesion', 'GET'\)/);
 assert.match(service,/solicitar\('envios\/decision', 'POST', body\)/);
 assert.match(service,/rol === 'administrador'/);
 assert.match(backend,/verifyIdToken\(token,true\)/);
 assert.match(backend,/ROL_NO_AUTORIZADO/);
});
