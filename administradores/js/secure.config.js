/* Bloque 5. No activar antes de tener usuarios, roles y API desplegada.
 * La modalidad histórica sigue disponible mientras habilitado=false. */
(function(){
 'use strict';
 window.TA_ADMIN_SEGURIDAD=Object.freeze({
  habilitado:false,
  apiBase:'https://us-central1-titulos-ec2fa.cloudfunctions.net/administradoresApi'
 });
})();
