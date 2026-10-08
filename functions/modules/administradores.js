'use strict';
const {crearHandler}=require('../shared/http');
const {crearRutasAdministradores}=require('../services/administradores');
function crearModulo({auth,origins,db}){
 return crearHandler({modulo:'administradores',rol:'administrador',auth,origins,
  routes:crearRutasAdministradores({db,authAdmin:auth})});
}
module.exports={crearModulo};
