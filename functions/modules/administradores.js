'use strict';
const {crearHandler}=require('../shared/http');
const {crearRutasAdministradores}=require('../services/administradores');
function crearModulo({auth,origins,db,academica}){
 return crearHandler({modulo:'administradores',rol:'administrador',auth,origins,
  routes:crearRutasAdministradores({db,academica,authAdmin:auth})});
}
module.exports={crearModulo};
