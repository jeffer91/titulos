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
  function conectar() {
    if (authPromise) return authPromise;
    authPromise = Promise.resolve().then(function () {
      if (window.firebase && window.firebase.initializeApp) return true;
      return cargarScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
    }).then(function () {
      if (window.firebase && window.firebase.auth) return true;
      return cargarScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js');
    }).then(function () {
      if (!window.TA_ADMIN_FIREBASE_CONFIG || !window.TA_ADMIN_FIREBASE_CONFIG.apiKey)
        throw error('FIREBASE_CONFIG_PENDIENTE', 'No se configuró Firebase Authentication de Administración.');
      var app;
      try { app = window.firebase.app('ta-administracion-segura'); }
      catch (_) { app = window.firebase.initializeApp(window.TA_ADMIN_FIREBASE_CONFIG, 'ta-administracion-segura'); }
      auth = window.firebase.auth(app);
      return auth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION).then(function () {
        return new Promise(function (resolve, reject) {
          var unsub = auth.onAuthStateChanged(function (usuario) {
            unsub();
            resolve(usuario);
          }, reject);
        });
      });
    }).catch(function (e) {
      authPromise = null;
      throw e;
    });
    return authPromise;
  }
  function mensajeServidor(codigo, status) {
    switch (codigo) {
      case 'ROL_NO_AUTORIZADO':
      case 'ROL_ADMINISTRADOR_NO_VERIFICADO':
        return 'La cuenta no tiene el rol administrador en Firebase. Debe asignarse por un responsable autorizado.';
      case 'SESION_INVALIDA':
      case 'TOKEN_REQUERIDO':
        return 'Tu sesión expiró o fue revocada. Vuelve a ingresar desde Administración.';
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
        throw error('SESION_REQUERIDA', 'Ingresa una sola vez con tu cuenta institucional de Administración.');
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
  function estado() {
    return conectar().then(function () {
      return Boolean(auth && auth.currentUser);
    });
  }
  function cerrar() {
    return conectar().then(function () { return auth.signOut(); });
  }

  // Estado validado una sola vez para activar la interfaz; cada escritura
  // todavía verifica token y rol de forma independiente en el servidor.
  function autorizadoLocal() { return rolVerificado === true; }
  function comunicarEstado() {
    window.dispatchEvent(new CustomEvent('admin:autorizacion-cambio', {
      detail: { autorizado: rolVerificado === true }
    }));
  }
  // La consulta del panel histórico sigue disponible; solo los actos
  // académicos exigen un token y rol administrador verificados por la API.
  var rolVerificado = false;
  function prepararPanel() {
    var panel = document.getElementById('adminLoginSeguro');
    var form = document.getElementById('adminLoginSeguroForm');
    var mensaje = document.getElementById('adminLoginMensaje');
    var abrir = document.getElementById('adminIniciarSesionPrincipal');
    var cerrar = document.getElementById('adminCerrarSesionPrincipal');
    var regresar = document.getElementById('adminCancelarLogin');
    if (!panel || !form || !abrir || !cerrar) return Promise.resolve(false);
    panel.hidden = true;
    var mostrarAcceso = function () {
      panel.hidden = false;
      var correo = document.getElementById('adminLoginCorreo');
      if (correo) correo.focus();
    };
    function vistaAutorizada(activo) {
      rolVerificado = Boolean(activo);
      abrir.hidden = rolVerificado;
      cerrar.hidden = !rolVerificado;
      if (rolVerificado) panel.hidden = true;
      comunicarEstado();
      var estado = document.getElementById('adminEstadoGeneral');
      if (estado) estado.textContent = rolVerificado
        ? 'Administrador autorizado' : 'Conectado · consulta';
    }
    if (!form.dataset.accionesLinked) {
      form.dataset.accionesLinked = '1';
      abrir.addEventListener('click', mostrarAcceso);
      if (regresar) regresar.addEventListener('click', function () { panel.hidden = true; });
      cerrar.addEventListener('click', function () {
        rolVerificado = false;
        cerrarSesion().then(function () {
          vistaAutorizada(false);
        }).catch(function (e) {
          if (mensaje) mensaje.textContent = e.message;
        });
      });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var correo = document.getElementById('adminLoginCorreo');
        var clave = document.getElementById('adminLoginClave');
        var boton = form.querySelector('button[type="submit"]');
        if (boton) boton.disabled = true;
        if (mensaje) mensaje.textContent = 'Comprobando cuenta administrativa...';
        conectar().then(function () {
          return auth.signInWithEmailAndPassword(correo.value.trim(), clave.value);
        }).then(function () {
          return solicitar('sesion', 'GET');
        }).then(function (identidad) {
          if (!identidad || identidad.rol !== 'administrador')
            throw error('ROL_NO_AUTORIZADO', 'Tu cuenta no tiene permisos de Administración.');
          if (clave) clave.value = '';
          if (mensaje) mensaje.textContent = '';
          vistaAutorizada(true);
        }).catch(function (e) {
          if (clave) clave.value = '';
          vistaAutorizada(false);
          if (mensaje) mensaje.textContent = e.message || 'No se pudo autorizar esta cuenta.';
        }).finally(function () {
          if (boton) boton.disabled = false;
        });
      });
    }
    // La ausencia de Auth no impide consultar el panel, pero sí decidir.
    return conectar().then(function (usuario) {
      if (!usuario) {
        vistaAutorizada(false);
        mostrarAcceso(); // Un solo acceso al iniciar; permite volver a consulta.
        return false;
      }
      return solicitar('sesion', 'GET').then(function (identidad) {
        vistaAutorizada(Boolean(identidad && identidad.rol === 'administrador'));
        return rolVerificado;
      }).catch(function (e) {
        vistaAutorizada(false);
        mostrarAcceso();
        if (mensaje) mensaje.textContent=e.message;
        return false;
      });
    }).catch(function (e) {
      vistaAutorizada(false);
      mostrarAcceso();
      if (mensaje) mensaje.textContent=e.message;
      return false;
    });
  }
  function cerrarSesion() {
    return conectar().then(function () { return auth.signOut(); });
  }
  function estadoAutorizado() {
    if (rolVerificado) return Promise.resolve(true);
    return conectar().then(function (usuario) {
      if (!usuario) return false;
      return solicitar('sesion', 'GET').then(function (identidad) {
        rolVerificado = Boolean(identidad && identidad.rol === 'administrador');
        return rolVerificado;
      }).catch(function () { return false; });
    }).catch(function () { return false; });
  }
  window.TAAdminAccionesSeguras = Object.freeze({
    conectar: conectar, prepararPanel: prepararPanel,
    estado: estadoAutorizado, autorizadoLocal: autorizadoLocal,
    cerrar: cerrarSesion,
    decidir: function (body) { return solicitar('envios/decision', 'POST', body); }
  });
})();
