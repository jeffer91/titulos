'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {autenticar,bearer,rolesVerificados,origenesPermitidos}=require('../shared/security');
const {crearHandler}=require('../shared/http');
function request({method='GET',path='/sesion',headers={}}={}) {
  const req={method,path,headers};
  const res={
    statusCode:200,headers:{},body:undefined,
    setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},
    status(v){this.statusCode=v;return this;},
    json(v){this.body=v;return this;},
    end(){return this;}
  };
  return {req,res};
}
function fakeAuth(claims,fail=false) {
  return {calls:[],async verifyIdToken(token,checkRevoked) {
    this.calls.push({token,checkRevoked});
    if (fail) throw Error('Error interno, no mostrar al cliente');
    return claims;
  }};
}
test('rechaza peticiones sin token sin tocar Firebase',async()=>{
  const auth=fakeAuth({uid:'1',roles:['administrador']});
  await assert.rejects(()=>autenticar(auth,'','administrador'),{status:401,code:'TOKEN_REQUERIDO'});
  assert.equal(auth.calls.length,0);
});
test('rechaza roles no emitidos en custom claims',async()=>{
  const auth=fakeAuth({uid:'1',roles:['coordinador']});
  await assert.rejects(()=>autenticar(auth,'Bearer token','administrador'),{status:403});
  assert.deepEqual(auth.calls[0],{token:'token',checkRevoked:true});
});
test('rechaza sesión revocada, claim inválido y token sin UID',async()=>{
  await assert.rejects(()=>autenticar(fakeAuth({},true),'Bearer x','coordinador'),{status:401});
  await assert.rejects(()=>autenticar(fakeAuth({roles:['coordinador']}),'Bearer x','coordinador'),{status:401});
  await assert.rejects(()=>autenticar(fakeAuth({uid:'u',role:'anonimo'}),'Bearer x','coordinador'),{status:403});
});
test('devuelve identidad mínima tras verificar token',async()=>{
  const result=await autenticar(fakeAuth({uid:'u',roles:['investigador','administrador']}),'Bearer x','investigador');
  assert.equal(result.rol,'investigador');
  assert.equal(result.uid,'u');
  assert.deepEqual(rolesVerificados({roles:['otro','estudiante','estudiante']}),['estudiante']);
});
test('formato Bearer estricto',()=>{
  assert.equal(bearer('Bearer a.b-C_~9'),'a.b-C_~9');
  assert.equal(bearer('Bearer x y'),'');
  assert.equal(bearer('Basic token'),'');
});
test('CORS sin comodines ni subrutas',()=>{
  const allowed=origenesPermitidos('http://localhost:5173,*,https://falso.test/path');
  assert.ok(allowed.includes('https://jeffer91.github.io'));
  assert.ok(allowed.includes('http://localhost:5173'));
  assert.ok(!allowed.includes('*'));
  assert.ok(!allowed.includes('https://falso.test/path'));
});
test('salud muestra sólo metadatos generales',async()=>{
  const {req,res}=request({path:'/salud',headers:{origin:'https://jeffer91.github.io'}});
  await crearHandler({modulo:'estudiantes',rol:'estudiante',auth:fakeAuth({})})(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.usuario,undefined);
  assert.equal(res.headers['access-control-allow-origin'],'https://jeffer91.github.io');
});
test('rechaza un origen desconocido antes de autenticación',async()=>{
  const auth=fakeAuth({uid:'a',roles:['administrador']});
  const {req,res}=request({headers:{origin:'https://intruso.test',authorization:'Bearer x'}});
  await crearHandler({modulo:'administradores',rol:'administrador',auth})(req,res);
  assert.equal(res.statusCode,403);
  assert.equal(auth.calls.length,0);
});
test('preflight sólo desde origen permitido',async()=>{
  const handler=crearHandler({modulo:'coordinadores',rol:'coordinador',auth:fakeAuth({})});
  const yes=request({method:'OPTIONS',headers:{origin:'https://jeffer91.github.io'}});
  await handler(yes.req,yes.res); assert.equal(yes.res.statusCode,204);
  const no=request({method:'OPTIONS'});
  await handler(no.req,no.res); assert.equal(no.res.statusCode,403);
});
test('sin rutas de datos ni escrituras todavía',async()=>{
  const h=crearHandler({modulo:'administradores',rol:'administrador',auth:fakeAuth({})});
  const a=request({path:'/envios'}); await h(a.req,a.res); assert.equal(a.res.statusCode,404);
  const b=request({method:'POST'}); await h(b.req,b.res); assert.equal(b.res.statusCode,405);
});
test('4 backends distintos, administrador sin acceso implícito a otros roles',async()=>{
  const roles={estudiantes:'estudiante',coordinadores:'coordinador',investigadores:'investigador',administradores:'administrador'};
  for(const [modulo,rol] of Object.entries(roles)) {
    const crear=require('../modules/'+modulo).crearModulo;
    const backend=modulo==='estudiantes'?{operativa:{},academica:{}}:['coordinadores','investigadores','administradores'].includes(modulo)?{db:{}}:{};
    const yes=request({headers:{authorization:'Bearer x'}});
    await crear({...backend,auth:fakeAuth({uid:'u',roles:[rol]})})(yes.req,yes.res);
    assert.equal(yes.res.statusCode,200,modulo);
    const no=request({headers:{authorization:'Bearer x'}});
    await crear({...backend,auth:fakeAuth({uid:'u',roles:['administrador']})})(no.req,no.res);
    assert.equal(no.res.statusCode,rol==='administrador'?200:403,modulo);
  }
});
test('error de Firebase no filtra detalles internos',async()=>{
  const {req,res}=request({headers:{authorization:'Bearer invalid'}});
  await crearHandler({modulo:'investigadores',rol:'investigador',auth:fakeAuth({},true)})(req,res);
  assert.deepEqual(res.body,{ok:false,codigo:'SESION_INVALIDA'});
});
