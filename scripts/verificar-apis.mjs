/* Ejecutar MANUALMENTE después del despliegue de prueba:
   API_BASE=https://us-central1-titulos-ec2fa.cloudfunctions.net \
   TOKEN_ESTUDIANTE=... TOKEN_COORDINADOR=... TOKEN_INVESTIGADOR=... TOKEN_ADMINISTRADOR=... \
   node scripts/verificar-apis.mjs
   Nunca imprimir/copiar ID tokens en reportes ni guardarlos en el repositorio.
 */
const base=process.env.API_BASE||'https://us-central1-titulos-ec2fa.cloudfunctions.net';
const origin='https://jeffer91.github.io';
const perfiles=[
 ['estudiantesApi',process.env.TOKEN_ESTUDIANTE],
 ['coordinadoresApi',process.env.TOKEN_COORDINADOR],
 ['investigadoresApi',process.env.TOKEN_INVESTIGADOR],
 ['administradoresApi',process.env.TOKEN_ADMINISTRADOR]
];
const result=[];
async function call(modulo,path,token,expected){
 const url=base.replace(/\/+$/,'')+'/'+modulo+path;
 const response=await fetch(url,{method:'GET',headers:{
  origin, ...(token?{authorization:'Bearer '+token}:{})
 },signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>({codigo:'JSON_INVALIDO'}));
 if(response.status!==expected)throw Error(modulo+path+': HTTP '+response.status+
   ' (esperado '+expected+') / '+String(data.codigo||'sin código'));
 return data;
}
async function run(){
 if(perfiles.some(x=>!x[1])){
  console.error('FALTAN TOKENS: Se requieren las cuatro cuentas de prueba.');
  process.exitCode=2;return;
 }
 for(const [modulo,token] of perfiles){
  await call(modulo,'/salud','',200);
  await call(modulo,'/sesion','',401);
  const user=await call(modulo,'/sesion',token,200);
  if(!user.usuario||!user.usuario.uid)throw Error(modulo+': identidad no validada');
  result.push({modulo,autorizado:true});
 }
 for(let i=0;i<perfiles.length;i++)for(let j=0;j<perfiles.length;j++)if(i!==j){
  await call(perfiles[j][0],'/sesion',perfiles[i][1],403);
 }
 // La cédula enviada por navegador no puede sustituir identidad autenticada.
 await call('estudiantesApi','/expediente?cedula=0000000000',perfiles[0][1],403);
 console.log('Pruebas de autenticación y aislamiento aprobadas:',result.length,'módulos; 12 cruces de rol denegados.');
 console.log('Falta ejecutar las pruebas de lectura, guardado y flujo con emuladores/datos de prueba.');
}
run().catch(err=>{console.error('ERROR DE ACTIVACIÓN:',err.message);process.exitCode=1;});
