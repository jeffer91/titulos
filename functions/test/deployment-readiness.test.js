'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('los cuatro módulos tienen URL propia y activación explícita',()=>{
 const apps=[
  ['estudiantes','estudiantesApi'],['coordinadores','coordinadoresApi'],
  ['investigadores','investigadoresApi'],['administradores','administradoresApi']
 ];
 for(const [dir,endpoint] of apps){
  const config=read(dir+'/js/secure.config.js');
  assert.ok(config.includes('habilitado:false'),dir+' debe seguir en compatibilidad hasta desplegar backend');
  assert.ok(config.includes(endpoint),dir+' URL de API inexistente');
  const service=read(dir+'/js/secure.service.js');
  assert.ok(service.includes("Authorization:'Bearer '")||service.includes("'Authorization':'Bearer '")||
    service.includes("authorization:'Bearer '")||service.includes("headers:{Authorization:'Bearer '"),
    dir+' no envía token a backend');
 }
});
test('en páginas públicas no se publican credenciales ni código privado',()=>{
 const workflow=read('.github/workflows/pages.yml');
 assert.ok(workflow.includes("--exclude='functions/'"));
 assert.ok(workflow.includes("--exclude='.env*'"));
 assert.ok(workflow.includes("--exclude='*service-account*.json'"));
 assert.ok(workflow.includes("--exclude='*.pem'"));
 const config=read('firebase.json');
 assert.ok(!config.includes('firestore'), 'No desplegar reglas a los proyectos compartidos de modo automático');
});
test('las reglas de migración no son desplegables ni alteran apps externas por accidente',()=>{
 const files=['security/propuesta-titulos.rules.txt','security/propuesta-academico.rules.txt'];
 for(const name of files){
  const src=read(name);
  assert.ok(src.includes('NO')&&src.includes('match /'));
  assert.ok(!src.includes('allow read, write: if true'));
 }
});
test('el backend de estudiantes nunca recibe claves de IA o Sheets como formulario',()=>{
 const source=read('functions/services/estudiantes.js');
 assert.ok(source.includes('sheetsActivo:false'));
 assert.ok(source.includes('geminiKey'));
 assert.ok(!source.includes('key:body.apiKey'));
});
