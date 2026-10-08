'use strict';
const {crearHandler} = require('../shared/http');
function crearModulo({auth,origins}) {
  return crearHandler({modulo:'administradores',rol:'administrador',auth,origins});
}
module.exports = {crearModulo};
