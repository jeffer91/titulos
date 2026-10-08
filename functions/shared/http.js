'use strict';
const {autenticar,origenesPermitidos} = require('./security');
function crearHandler({modulo,rol,auth,origins,routes}) {
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
      res.setHeader('Access-Control-Allow-Methods',routes ? 'GET, POST, OPTIONS' : 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age','600');
      return res.status(204).end();
    }
    const path = (req.path || String(req.url||'').split('?')[0] || '/').replace(/\/$/,'') || '/';
    if (path === '/salud') return res.status(200).json({ok:true,modulo,seguridad:'endpoint-servidor'});
    const route = routes && routes[path];
    if (path !== '/sesion' && !route) return res.status(404).json({ok:false,codigo:'RUTA_NO_DISPONIBLE'});
    const metodo = path === '/sesion' ? 'GET' : route.method;
    if (req.method !== metodo) {
      res.setHeader('Allow',metodo+', OPTIONS');
      return res.status(405).json({ok:false,codigo:'METODO_NO_PERMITIDO'});
    }
    try {
      const usuario = await autenticar(auth,req.headers && req.headers.authorization,rol);
      if (path === '/sesion') return res.status(200).json({ok:true,modulo,usuario});
      const data = await route.handle({usuario,query:req.query||{},body:req.body||{}});
      return res.status(200).json({ok:true,data});
    } catch (error) {
      const status = [400,401,403,404,409,413,422,429].includes(error && error.status) ? error.status : 503;
      return res.status(status).json({
        ok:false,
        codigo:status === 503 ? 'SERVICIO_NO_DISPONIBLE' : (error.code||'SOLICITUD_RECHAZADA')
      });
    }
  };
}
module.exports = {crearHandler};
