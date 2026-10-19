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
            'No se pudo validar la autorización (' + (payload && payload.codigo || resp.status) + ').');
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

  /* Reutiliza la pantalla de ingreso que ya existe al inicio del administrador,
     sin construir un segundo formulario dentro del expediente de un estudiante. */
  function iniciarPanel() {
    document.body.classList.add('admin-auth-pending');
    var panel = document.getElementById('adminLoginSeguro');
    var form = document.getElementById('adminLoginSeguroForm');
    var mensaje = document.getElementById('adminLoginMensaje');
    var salir = document.getElementById('adminSalirSeguro');
    var salirCabecera = document.getElementById('adminCerrarSesionPrincipal');
    if (!panel || !form) return Promise.reject(error('PANTALLA_ACCESO_FALTANTE'));
    panel.hidden = false;
    if (!form.dataset.accionesLinked) {
      form.dataset.accionesLinked = '1';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var correo = document.getElementById('adminLoginCorreo');
        var clave = document.getElementById('adminLoginClave');
        var boton = form.querySelector('button[type="submit"]');
        if (boton) boton.disabled = true;
        if (mensaje) mensaje.textContent = 'Verificando identidad y permisos administrativos...';
        conectar().then(function () {
          return auth.signInWithEmailAndPassword(correo.value.trim(), clave.value);
        }).then(function () {
          return solicitar('sesion', 'GET');
        }).then(function () {
          if (clave) clave.value = '';
          window.location.reload();
        }).catch(function (e) {
          if (clave) clave.value = '';
          if (mensaje) mensaje.textContent = e.message ||
            'No se pudo validar tu cuenta de Administración.';
        }).finally(function () {
          if (boton) boton.disabled = false;
        });
      });
      var salirSesion = function () {
        cerrar().then(function () { window.location.reload(); })
          .catch(function (e) { if (mensaje) mensaje.textContent = e.message; });
      };
      if (salir) salir.addEventListener('click', salirSesion);
      if (salirCabecera) salirCabecera.addEventListener('click', salirSesion);
    }
    return conectar().then(function (usuario) {
      if (!usuario) {
        form.hidden = false;
        if (salir) salir.hidden = true;
        if (mensaje) mensaje.textContent = 'Ingresa con tu correo institucional y contraseña de Administración.';
        return false;
      }
      return solicitar('sesion', 'GET').then(function (usuarioVerificado) {
        if (!usuarioVerificado || usuarioVerificado.rol !== 'administrador')
          throw error('ROL_ADMINISTRADOR_NO_VERIFICADO', 'Acceso administrativo no autorizado.');
        panel.hidden = true;
        document.body.classList.remove('admin-auth-pending');
        if (mensaje) mensaje.textContent = '';
        if (salirCabecera) salirCabecera.hidden = false;
        return true;
      }).catch(function (e) {
        form.hidden = false;
        if (salir) salir.hidden = false;
        if (mensaje) mensaje.textContent = e.message ||
          'La cuenta no tiene el rol de administrador verificado.';
        return false;
      });
    }).catch(function (e) {
      form.hidden = false;
      if (mensaje) mensaje.textContent = e.message;
      return false;
    });
  }
  window.TAAdminAccionesSeguras = Object.freeze({
    conectar: conectar, iniciarPanel: iniciarPanel, estado: estado,
    cerrar: cerrar,
    decidir: function (body) { return solicitar('envios/decision', 'POST', body); }
  });
})();