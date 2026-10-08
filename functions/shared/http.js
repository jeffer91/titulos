'use strict';
const {autenticar,origenesPermitidos} = require('./security');
function crearHandler({modulo,rol,auth,origins}) {
  const permitidos = new Set(origenesPermitidos(origins));
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Vary','Origin');
    const origin = req.headers && req.headers.origin;
    if (origin) {
      if (!permitidos.has(origin)) return res.status(403).json({ok:false,codigo:'ORIGEN_NO_AUTORIZADO'});
      res.setHeader('Access-Control-Allow-Origin',origin);
    }
    if (req.method === 'OPTIONS') {
      if (!origin) return res.status(403).json({ok:false,codigo:'ORIGEN_REQUERIDO'});
      res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age','600');
      return res.status(204).end();
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow','GET, OPTIONS');
      return res.status(405).json({ok:false,codigo:'METODO_NO_PERMITIDO'});
    }
    const path = (req.path || String(req.url||'').split('?')[0] || '/').replace(/\/$/,'') || '/';
    if (path === '/salud') return res.status(200).json({ok:true,modulo,seguridad:'endpoint-servidor'});
    if (path !== '/sesion') return res.status(404).json({ok:false,codigo:'RUTA_NO_DISPONIBLE'});
    try {
      const usuario = await autenticar(auth,req.headers && req.headers.authorization,rol);
      return res.status(200).json({ok:true,modulo,usuario});
    } catch (error) {
      const status = [401,403].includes(error && error.status) ? error.status : 503;
      return res.status(status).json({ok:false,codigo:status === 503 ? 'SERVICIO_NO_DISPONIBLE' : error.code});
    }
  };
}
module.exports = {crearHandler};
