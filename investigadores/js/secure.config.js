/* Modo seguro: activar solo después de provisionar Auth/roles y desplegar Functions.
 * El PIN antiguo no sirve como credencial de la API. */
(function(){
 'use strict';
 window.TA_INVESTIGADORES_SEGURIDAD=Object.freeze({
  habilitado:false,
  apiBase:'https://us-central1-titulos-ec2fa.cloudfunctions.net/investigadoresApi'
 });
})();
