'use strict';
const ROLES = Object.freeze(['estudiante','coordinador','investigador','administrador']);
function bearer(header) {
  if (typeof header !== 'string') return '';
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header.trim());
  return match ? match[1] : '';
}
function rolesVerificados(claims) {
  if (!claims || typeof claims !== 'object') return [];
  const list = Array.isArray(claims.roles) ? claims.roles : [claims.role];
  return [...new Set(list.filter(x => typeof x === 'string' && ROLES.includes(x)))];
}
function fallo(status, code) {
  const error = new Error(code);
  error.status = status; error.code = code;
  return error;
}
async function autenticar(auth, header, rol) {
  if (!ROLES.includes(rol)) throw fallo(500,'ROL_NO_CONFIGURADO');
  const token = bearer(header);
  if (!token) throw fallo(401,'TOKEN_REQUERIDO');
  if (!auth || typeof auth.verifyIdToken !== 'function') throw fallo(503,'AUTH_NO_DISPONIBLE');
  let claims;
  try { claims = await auth.verifyIdToken(token,true); }
  catch (_) { throw fallo(401,'SESION_INVALIDA'); }
  if (!claims || !claims.uid) throw fallo(401,'SESION_INVALIDA');
  const roles = rolesVerificados(claims);
  if (!roles.includes(rol)) throw fallo(403,'ROL_NO_AUTORIZADO');
  return Object.freeze({uid:claims.uid,rol,roles});
}
function origenesPermitidos(config) {
  const lista = ['https://jeffer91.github.io'];
  String(config||'').split(',').forEach(raw => {
    const origin = raw.trim();
    if (!origin) return;
    try {
      const parsed = new URL(origin);
      if (parsed.origin === origin && ['https:','http:'].includes(parsed.protocol)) lista.push(origin);
    } catch (_) {}
  });
  return [...new Set(lista)];
}
module.exports = { ROLES,bearer,rolesVerificados,autenticar,origenesPermitidos };
