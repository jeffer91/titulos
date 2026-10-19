/* Un solo acceso al panel: las decisiones usan el mismo Firebase ID Token.
   La conexión a Firestore no equivale a una identidad administrativa. */
(function () {
  'use strict';
  var authPromise = null, auth = null;
  var config = window.TA_ADMIN_SEGURIDAD || {};

  function error(codigo, mensaje) {
    var e = new Error(mensaje || codigo);
    e.codigo = codigo;
    return e;
  }
  function cargarScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(error('SDK_NO_DISPONIBLE', 'No se pudo cargar Firebase Authentication.')); };
      document.head.appendChild(script);
    });
  }
  function primerEstadoAutenticado(instancia) {
    return new Promise(function (resolve) {
      var cancelar = function () {};
      cancelar = instancia.onAuthStateChanged(function (usuario) {
        cancelar();
        resolve(usuario || null);
      }, function () {
        cancelar();
        resolve(null);
      });
    });
  }
  function conectar() {
    if (authPromise) return authPromise;
    authPromise = Promise.resolve().then(function () {
      if (window.firebase && window.firebase.initializeApp) return true;
      return cargarScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
    }).then(function () {
      if (window.firebase && window.firebase.auth) return true;
      return cargarScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js');
    }).then(function () {
      var cfg=window.TA_ADMIN_FIREBASE_CONFIG;
      if (!cfg || !cfg.apiKey || !cfg.projectId)
        throw error('FIREBASE_CONFIG_PENDIENTE',
          'No se encontró la configuración operativa de Firebase.');
      // Buscar sesiones persistidas de ESTE MISMO proyecto, incluidas las
      // iniciadas desde otras vistas de la aplicación institucional.
      var aplicaciones=(window.firebase.apps || []).filter(function (app) {
        return app && app.options && app.options.projectId===cfg.projectId &&
          app.options.apiKey===cfg.apiKey;
      });
      var dedicada;
      try { dedicada=window.firebase.app('ta-administracion-segura'); }
      catch (_) { dedicada=window.firebase.initializeApp(cfg,'ta-administracion-segura'); }
      if(!aplicaciones.some(function(app){return app.name===dedicada.name;}))
        aplicaciones.push(dedicada);
      return Promise.all(aplicaciones.map(function (app) {
        var instancia=window.firebase.auth(app);
        return primerEstadoAutenticado(instancia).then(function (usuario) {
          return {instancia:instancia,usuario:usuario,esDedicada:app.name==='ta-administracion-segura'};
        });
      })).then(function (resultados) {
        var vigente=resultados.filter(function(r){return Boolean(r.usuario);})[0];
        var elegida=vigente || resultados.filter(function(r){return r.esDedicada;})[0];
        auth=elegida.instancia;
        // Nunca alterar la persistencia de una identidad ya iniciada.
        // setPersistence(SESSION) descartaba sesiones locales previas.
        return elegida.usuario || null;
      });
    }).catch(function (e) {
      authPromise=null;
      auth=null;
      throw e;
    });
    return authPromise;
  }
  function mensajeServidor(codigo, status) {
    switch (codigo) {
      case 'ROL_NO_AUTORIZADO':
      case 'ROL_ADMINISTRADOR_NO_VERIFICADO':
        return 'Identidad administrativa no autorizada en Firebase. No se guardó ningún cambio.';
      case 'SESION_INVALIDA':
      case 'TOKEN_REQUERIDO':
        return 'La identidad administrativa ya no es válida. No se guardó ningún cambio.';
      case 'RUTA_NO_DISPONIBLE':
        return 'La función administrativa no está actualizada en Firebase. Debe desplegarse administradoresApi.';
      case 'SERVICIO_NO_DISPONIBLE':
        return 'El backend de Administración no está disponible. No se guardó ningún cambio.';
      case 'FICHA_DESACTUALIZADA':
        return 'El expediente cambió desde que lo abriste. Actualiza estudiantes e inténtalo nuevamente.';
      case 'PERIODO_DESACTIVADO':
        return 'El período está desactivado y no admite nuevas decisiones.';
      case 'APROBADO_REQUIERE_REAPERTURA_EXPLICITA':
        return 'El título ya está aprobado. Confirma la reapertura y registra el motivo.';
      default:
        return 'La operación fue rechazada por el servidor (' + (codigo || status) + '). No se guardó.';
    }
  }

  function solicitar(ruta, metodo, body) {
    return conectar().then(function () {
      if (!auth || !auth.currentUser)
        throw error('SESION_REQUERIDA', 'No hay una sesión administrativa validada. No se guardó ningún cambio.');
      return auth.currentUser.getIdToken(true);
    }).then(function (token) {
      if (!config.apiBase)
        throw error('ADMIN_API_NO_CONFIGURADA', 'Falta configurar la API de Administración.');
      return fetch(config.apiBase.replace(/\/+$/, '') + '/' + ruta, {
        method: metodo || 'GET', mode: 'cors', cache: 'no-store', credentials: 'omit',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: metodo === 'POST' ? JSON.stringify(body || {}) : undefined
      });
    }).then(function (resp) {
      return resp.json().then(function (payload) {
        if (!resp.ok || !payload || payload.ok !== true)
          throw error(payload && payload.codigo || 'ADMIN_API_ERROR',
            mensajeServidor(payload && payload.codigo, resp.status));
        // /sesion devuelve la identidad en usuario, no en data.
        // Comprobar la identidad autenticada antes de mostrar el panel.
        if (ruta === 'sesion') {
          if (!payload.usuario || payload.usuario.rol !== 'administrador' || !payload.usuario.uid)
            throw error('ROL_ADMINISTRADOR_NO_VERIFICADO',
              'La API no confirmó una sesión administrativa válida.');
          return payload.usuario;
        }
        return payload.data;
      });
    }).catch(function (fallo) {
      if (fallo.codigo) throw fallo;
      throw error('RED_NO_DISPONIBLE',
        'No se pudo conectar con administradoresApi. Comprueba su despliegue y la conexión; no se guardó nada.');
    });
  }
  // El acceso administrativo se detecta sin formularios, contraseñas,
  // redirecciones, alertas ni ventanas. Solo una identidad Firebase ya existente
  // y autorizada por el servidor permite ejecutar decisiones académicas.
  var rolVerificado = false;
  var comprobando = null;
  function autorizadoLocal() { return rolVerificado === true; }
  function actualizarEstado(validado) {
    var siguiente = Boolean(validado);
    var cambio = siguiente !== rolVerificado;
    rolVerificado = siguiente;
    if (cambio) {
      window.dispatchEvent(new CustomEvent('admin:autorizacion-cambio', {
        detail: { autorizado: rolVerificado }
      }));
    }
    return rolVerificado;
  }
  function prepararPanel() {
    if (comprobando) return comprobando;
    comprobando = conectar().then(function (usuario) {
      if (!usuario || !auth.currentUser) return actualizarEstado(false);
      return solicitar('sesion', 'GET').then(function (identidad) {
        return actualizarEstado(Boolean(identidad && identidad.rol === 'administrador' && identidad.uid));
      }).catch(function () {
        return actualizarEstado(false);
      });
    }).catch(function () {
      return actualizarEstado(false);
    }).finally(function () {
      comprobando = null;
    });
    return comprobando;
  }
  function decidir(body) {
    if (!autorizadoLocal())
      return Promise.reject(error('ADMIN_NO_DISPONIBLE',
        'Esta sesión no tiene operaciones administrativas disponibles. No se guardó ningún cambio.'));
    // La API vuelve a verificar token y rol para todas las escrituras.
    return solicitar('envios/decision', 'POST', body).catch(function (e) {
      if (['SESION_INVALIDA','TOKEN_REQUERIDO','ROL_NO_AUTORIZADO',
           'ROL_ADMINISTRADOR_NO_VERIFICADO'].includes(e.codigo)) actualizarEstado(false);
      throw e;
    });
  }
  window.TAAdminAccionesSeguras = Object.freeze({
    conectar: conectar, prepararPanel: prepararPanel,
    estado: prepararPanel, autorizadoLocal: autorizadoLocal, decidir: decidir
  });
})();
