'use strict';
const {onRequest} = require('firebase-functions/v2/https');
const {initializeApp,getApps} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore} = require('firebase-admin/firestore');
const {getApp,initializeApp:initializeOtherApp} = require('firebase-admin/app');
const {defineSecret} = require('firebase-functions/params');
if (!getApps().length) initializeApp();
const settings = {region:'us-central1',cors:false,maxInstances:10,invoker:'public'};
const options = {auth:getAuth(),origins:process.env.CORS_ORIGINS||''};
// App académica: identidad de servicio de titulos-ec2fa debe recibir permiso de
// SOLO LECTURA en utet-4387a vía IAM antes de desplegar estas operaciones.
let appAcademica;
try { appAcademica=getApp('ta-academico-servidor'); }
catch (_) { appAcademica=initializeOtherApp({projectId:'utet-4387a'},'ta-academico-servidor'); }
const geminiSecret=defineSecret('TITULOS_GEMINI_API_KEY');
exports.estudiantesApi=onRequest({...settings,secrets:[geminiSecret]},require('./modules/estudiantes').crearModulo({
  ...options,operativa:getFirestore(),academica:getFirestore(appAcademica),geminiKey:()=>geminiSecret.value()
}));
exports.coordinadoresApi = onRequest(settings,require('./modules/coordinadores').crearModulo({...options,db:getFirestore()}));
exports.investigadoresApi = onRequest(settings,require('./modules/investigadores').crearModulo(options));
exports.administradoresApi = onRequest(settings,require('./modules/administradores').crearModulo(options));
