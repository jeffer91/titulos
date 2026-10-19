'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('no hay autorización duplicada dentro del expediente',()=>{
 const src=read('administradores/js/estudiantes.admin.js');
 for(const v of ['adminLoginAccionesForm','adminLoginAccionesEmail','adminLoginAccionesPassword',
  'adminCerrarAccionesSesion','adminAccesoAcciones'])
   assert.equal(src.includes(v),false,'No debe estar: '+v);
 for(const action of ['APROBAR','CORREGIR_APROBAR','ENVIAR_COORDINACION','ENVIAR_INVESTIGACION'])
   assert.ok(src.includes(action),'Falta '+action);
 assert.match(src,/repository\.intervenirTitulo\(body\)/);
 assert.match(src,/servicio\.estado\(\)/);
 assert.match(src,/mostrarEstadoAccion/);
});

test('el administrador puede abrir sus consultas sin una sesión privilegiada',()=>{
 const html=read('administradores/administrador.html');
 const app=read('administradores/js/administrador.app.js');
 const auth=read('administradores/js/admin.actions.service.js');
 assert.match(html,/<body>/);
 assert.doesNotMatch(html,/<body class="admin-auth-pending">/);
 assert.match(html,/id="adminIniciarSesionPrincipal"/);
 assert.match(html,/id="adminCerrarSesionPrincipal"/);
 assert.match(html,/id="adminCancelarLogin"/);
 assert.match(app,/conectarEventosBase\(\)/);
 assert.match(app,/iniciarModulos\(\)/);
 assert.match(app,/acciones\.prepararPanel\(\)/);
 assert.match(auth,/var rolVerificado = false/);
});

test('las decisiones aún exigen token y rol de administrador comprobados por API',()=>{
 const auth=read('administradores/js/admin.actions.service.js');
 assert.match(auth,/solicitar\('sesion', 'GET'\)/);
 assert.match(auth,/solicitar\('envios\/decision', 'POST', body\)/);
 assert.match(auth,/Authorization: 'Bearer ' \+ token/);
 assert.match(auth,/payload\.usuario\.rol !== 'administrador'/);
 assert.match(auth,/payload\.usuario\.uid/);
 assert.match(auth,/payload\.ok !== true/);
 assert.equal(auth.includes('signInAnonymously'),false);
});
