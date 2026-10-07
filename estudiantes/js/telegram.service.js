/* Telegram fue reemplazado por la consulta integrada de cronograma. */
(function () {
  'use strict';

  var BASE_URL = 'https://registroinduccionesitsqmet.netlify.app/cronogramas/vista/cedula-solicitud.html';
  var TARGET_ORIGIN = 'https://registroinduccionesitsqmet.netlify.app';
  var LEGACY_VALUE = '@cronograma';
  var STORAGE_KEY = 'itsqmet_titulacion_cedula';
  var SESSION_KEY = 'itsqmet_titulacion_cedula_sesion';
  var ultimo = { cedula: '', url: '', abiertoEn: '', cargado: false, cargas: 0, consultaSolicitada: false };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    setTimeout(instalar, 0);
  }

  function instalar() {
    transformarPaso();
    envolverUI();
    envolverFormulario();
    envolverControlador();
    conectarMensajes();
    conectarBoton();

    var hero = document.querySelector('.student-hero__text p');
    if (hero) hero.textContent = 'Consulta tus datos académicos, revisa tu cronograma, registra tus tres títulos y confirma el envío final.';
  }

  function transformarPaso() {
    var s = document.querySelector('[data-step="contacto"]');
    if (!s || s.dataset.cronograma === '1') return;
    s.dataset.cronograma = '1';
    s.innerHTML = [
      '<div class="section-heading">',
      '<p class="section-kicker">Paso 3</p>',
      '<h2>Consulta y registro de cronograma</h2>',
      '<p>Usaremos automáticamente la cédula que ya consultaste. El cronograma se abrirá dentro de esta misma pantalla.</p>',
      '</div>',
      '<div class="info-box" style="margin-bottom:12px"><span>Cédula utilizada</span><strong id="cronogramaCedula">—</strong></div>',
      '<div style="border:1px solid rgba(0,180,220,.28);border-radius:16px;overflow:hidden;background:#071426">',
      '<iframe id="cronogramaFrame" title="Cronograma ITSQMET" src="about:blank" referrerpolicy="strict-origin-when-cross-origin" style="display:block;width:100%;height:68vh;min-height:560px;max-height:760px;border:0;background:#071426"></iframe>',
      '</div>',
      '<div class="status-message is-info" id="cronogramaEstado" role="status">El cronograma se cargará automáticamente.</div>',
      '<input id="telegramInput" name="telegram" type="hidden" value="' + LEGACY_VALUE + '">',
      '<div id="telegramEstado" data-validado="true" style="display:none"></div>',
      '<div class="form-actions step-actions">',
      '<button class="btn btn--ghost" type="button" data-action="prev">Regresar</button>',
      '<button class="btn btn--secondary" type="button" id="btnAbrirCronogramaExterno">Abrir en otra pestaña</button>',
      '<button class="btn btn--primary" type="button" data-action="next">Continuar</button>',
      '</div>'
    ].join('');
  }

  function abrirIntegrado() {
    var cedula = cedulaActual();
    var frame = document.querySelector('#cronogramaFrame');
    var dato = document.querySelector('#cronogramaCedula');
    var legacy = document.querySelector('#telegramInput');

    if (legacy) legacy.value = LEGACY_VALUE;
    if (!cedula || !frame) return false;

    guardarCedula(cedula);

    ultimo.cedula = cedula;
    ultimo.url = construirUrl(cedula);
    ultimo.abiertoEn = new Date().toISOString();
    ultimo.cargado = false;
    ultimo.cargas = 0;
    ultimo.consultaSolicitada = false;

    if (dato) dato.textContent = cedula;
    estadoVisible('Cédula recuperada. Abriendo y consultando el cronograma automáticamente…', 'info');

    if (frame.dataset.bound !== '1') {
      frame.dataset.bound = '1';
      frame.addEventListener('load', function () {
        ultimo.cargas += 1;
        ultimo.cargado = true;

        solicitarConsultaAutomatica(frame, cedulaActual());

        if (ultimo.cargas > 1) {
          estadoVisible('Cronograma consultado automáticamente. Revisa la información y continúa.', 'success');
        } else {
          estadoVisible('Cédula cargada. Consultando cronograma automáticamente…', 'info');
        }
      });
    }

    if (frame.dataset.url !== ultimo.url) {
      frame.dataset.url = ultimo.url;
      frame.src = ultimo.url;
    } else {
      solicitarConsultaAutomatica(frame, cedula);
    }

    return true;
  }

  function construirUrl(cedula) {
    var id = limpiarCedula(cedula || cedulaActual());
    var url = new URL(BASE_URL);
    if (id) {
      url.searchParams.set('cedula', id);
      url.searchParams.set('numeroIdentificacion', id);
    }
    url.searchParams.set('auto', '1');
    url.searchParams.set('autoconsulta', '1');
    url.searchParams.set('autoSubmit', '1');
    url.searchParams.set('autoConsultar', '1');
    url.searchParams.set('consultar', '1');
    url.searchParams.set('embed', '1');
    url.searchParams.set('origen', 'titulos');
    return url.toString();
  }

  function enviarCedula(frame, cedula) {
    solicitarConsultaAutomatica(frame, cedula);
  }

  function solicitarConsultaAutomatica(frame, cedula) {
    cedula = limpiarCedula(cedula || cedulaActual());

    if (!frame || !frame.contentWindow || !cedula) return false;

    guardarCedula(cedula);
    ultimo.consultaSolicitada = true;

    var mensajes = [
      {
        type: 'ITSQMET_CRONOGRAMA_PREFILL',
        action: 'prefill',
        cedula: cedula,
        numeroIdentificacion: cedula,
        autoSubmit: true,
        autoConsultar: true,
        consultar: true,
        embed: true,
        origen: 'titulos'
      },
      {
        type: 'ITSQMET_CRONOGRAMA_AUTOCONSULTAR',
        action: 'consultar',
        cedula: cedula,
        numeroIdentificacion: cedula,
        autoSubmit: true,
        autoConsultar: true,
        consultar: true,
        origen: 'titulos'
      },
      {
        type: 'CRONOGRAMA_CONSULTAR',
        evento: 'CONSULTAR_CRONOGRAMA',
        action: 'consultarCronograma',
        cedula: cedula,
        numeroIdentificacion: cedula,
        autoSubmit: true,
        autoConsultar: true,
        origen: 'titulos'
      }
    ];

    [0, 250, 650, 1200, 2200, 3500].forEach(function (ms) {
      setTimeout(function () {
        mensajes.forEach(function (data) {
          try { frame.contentWindow.postMessage(data, TARGET_ORIGIN); } catch (e) {}
        });
      }, ms);
    });

    return true;
  }

  function conectarMensajes() {
    if (window.__cronogramaMessages) return;
    window.__cronogramaMessages = true;
    window.addEventListener('message', function (event) {
      if (event.origin !== TARGET_ORIGIN) return;
      var type = String(event.data && (event.data.type || event.data.evento) || '').toUpperCase();
      if (type === 'ITSQMET_CRONOGRAMA_READY' || type === 'CRONOGRAMA_READY') {
        solicitarConsultaAutomatica(document.querySelector('#cronogramaFrame'), cedulaActual());
      }
      if (/CONSULTA_INICIADA|CONSULTANDO|BUSCANDO/.test(type)) {
        estadoVisible('Consultando cronograma automáticamente…', 'info');
      }
      if (/COMPLETADO|REGISTRADO|RESULTADO|CRONOGRAMA_CARGADO|CONSULTA_COMPLETA/.test(type)) {
        estadoVisible('Cronograma consultado automáticamente. Revisa la información y continúa.', 'success');
      }
    });
  }

  function conectarBoton() {
    var b = document.querySelector('#btnAbrirCronogramaExterno');
    if (!b || b.dataset.bound === '1') return;
    b.dataset.bound = '1';
    b.addEventListener('click', function () {
      var cedula = cedulaActual();
      if (!cedula) return estadoVisible('Primero consulta tu cédula.', 'error');
      window.open(construirUrl(cedula), '_blank', 'noopener,noreferrer');
    });
  }

  function envolverUI() {
    var ui = window.TAEstudianteUI;
    if (!ui || ui.__cronograma) return;
    var copia = copiar(ui);
    var read = ui.readFormData;
    var fill = ui.fillFormData;
    var summary = ui.renderSummary;
    var renderStudent = ui.renderStudent;

    copia.renderStudent = function (student) {
      var cedula = limpiarCedula(student && (student.cedula || student.numeroIdentificacion || student.identificacion));
      if (cedula) guardarCedula(cedula);
      return renderStudent ? renderStudent(student) : undefined;
    };

    copia.readFormData = function (total) {
      var data = read(total) || {};
      data.telegram = '';
      data.registroCronograma = datosRegistro();
      return data;
    };
    copia.fillFormData = function (data) {
      var r = fill(data || {});
      var input = document.querySelector('#telegramInput');
      if (input) input.value = LEGACY_VALUE;
      return r;
    };
    copia.renderSummary = function (student, formData, payload) {
      var r = summary(student, formData, payload);
      var resumen = document.querySelector('#resumenTitulo');
      if (resumen) Array.prototype.forEach.call(resumen.querySelectorAll('p'), function (p) {
        if (/^Telegram\s*:/i.test(String(p.textContent || '').trim())) {
          p.innerHTML = '<strong>Cronograma:</strong> consulta integrada con cédula ' + escapeHtml(cedulaActual() || ultimo.cedula || '—');
        }
      });
      return r;
    };
    copia.__cronograma = true;
    window.TAEstudianteUI = Object.freeze(copia);
  }

  function envolverFormulario() {
    var f = window.TAEstudianteFormulario;
    if (!f || f.__cronograma) return;
    var copia = copiar(f);
    var construir = f.construirPayload;
    var restaurar = f.formDataDesdeEnvio;

    copia.construirPayload = function (estudiante, appConfig, formData, envioExistente) {
      var p = construir(estudiante, appConfig, formData, envioExistente) || {};
      p.telegramUser = '';
      p.telegram = '';
      p.contacto = Object.assign({}, p.contacto || {}, { telegram: '' });
      p.registroCronograma = datosRegistro(estudiante);
      p.cronogramaUrl = p.registroCronograma.url;
      p.cronogramaIntegrado = true;
      return p;
    };
    copia.formDataDesdeEnvio = function (envio, total) {
      var data = restaurar(envio, total) || {};
      data.telegram = '';
      return data;
    };
    copia.__cronograma = true;
    window.TAEstudianteFormulario = Object.freeze(copia);
  }

  function envolverControlador() {
    var c = window.TAEstudianteFormularioController;
    if (!c || c.__cronograma) return;
    var copia = copiar(c);
    var cambio = c.manejarCambioPaso;
    var limpiar = c.limpiarFormularioVisual;

    copia.manejarCambioPaso = function (info) {
      var r = cambio ? cambio(info) : undefined;
      if (info && info.paso === 'contacto') abrirIntegrado();
      return r;
    };
    copia.limpiarFormularioVisual = function () {
      var r = limpiar ? limpiar() : undefined;
      ultimo = { cedula: cedulaGuardada(), url: '', abiertoEn: '', cargado: false, cargas: 0, consultaSolicitada: false };
      var input = document.querySelector('#telegramInput');
      if (input) input.value = LEGACY_VALUE;
      return r;
    };
    copia.__cronograma = true;
    window.TAEstudianteFormularioController = Object.freeze(copia);
  }

  function datosRegistro(estudiante) {
    var cedula = limpiarCedula(estudiante && (estudiante.cedula || estudiante.numeroIdentificacion) || cedulaActual());
    return {
      cedula: cedula,
      url: construirUrl(cedula),
      integrado: true,
      cargado: ultimo.cargado,
      abiertoEn: ultimo.abiertoEn || ''
    };
  }

  function cedulaActual() {
    var state = window.TAEstudianteState;
    var data = state && state.obtener ? state.obtener() : {};
    var est = data.estudiante || {};
    var desdeEstado = limpiarCedula(est.cedula || est.numeroIdentificacion || est.identificacion || '');
    var desdeVista = limpiarCedula((document.querySelector('#datoCedula') || {}).textContent || '');
    var desdeConsulta = limpiarCedula((document.querySelector('#cedulaInput') || {}).value || '');
    var guardada = cedulaGuardada();
    var cedula = desdeEstado || desdeVista || desdeConsulta || guardada;

    if (cedula) guardarCedula(cedula);
    return cedula;
  }

  function guardarCedula(cedula) {
    cedula = limpiarCedula(cedula);
    if (!cedula) return '';

    ultimo.cedula = cedula;

    try { sessionStorage.setItem(SESSION_KEY, cedula); } catch (e) {}
    try { localStorage.setItem(STORAGE_KEY, cedula); } catch (e) {}

    return cedula;
  }

  function cedulaGuardada() {
    var valor = '';

    try { valor = sessionStorage.getItem(SESSION_KEY) || ''; } catch (e) {}
    if (!valor) {
      try { valor = localStorage.getItem(STORAGE_KEY) || ''; } catch (e2) {}
    }

    return limpiarCedula(valor);
  }

  function limpiarCedula(v) { return String(v || '').replace(/\D/g, '').slice(0, 10); }
  function estadoVisible(m, t) {
    var e = document.querySelector('#cronogramaEstado');
    if (!e) return false;
    e.textContent = m || '';
    e.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');
    e.classList.add('is-' + (t || 'info'));
    return false;
  }
  function copiar(o) { var n = {}; Object.keys(o || {}).forEach(function (k) { n[k] = o[k]; }); return n; }
  function escapeHtml(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }

  /* API histórica: el resto de la app todavía espera TAEstudianteTelegram. */
  function limpiarUsuario() { return LEGACY_VALUE; }
  function obtenerUsernameSinArroba() { return 'cronograma'; }
  function validarUsuario() { return { ok: true, usuario: LEGACY_VALUE, url: construirUrl(), mensaje: 'Cronograma habilitado.', selector: '' }; }
  function abrirPerfil() { var ok = abrirIntegrado(); return { ok: ok, usuario: LEGACY_VALUE, url: construirUrl(), mensaje: ok ? 'Cronograma cargado.' : 'Primero consulta tu cédula.', selector: ok ? '' : '#cedulaInput' }; }
  function marcarEstado() { var e = document.querySelector('#telegramEstado'); if (e) e.setAttribute('data-validado', 'true'); }
  function prepararInput() { var i = document.querySelector('#telegramInput'); if (i) i.value = LEGACY_VALUE; conectarBoton(); }

  window.TAEstudianteTelegram = Object.freeze({
    limpiarUsuario: limpiarUsuario,
    obtenerUsernameSinArroba: obtenerUsernameSinArroba,
    validarUsuario: validarUsuario,
    construirUrl: construirUrl,
    abrirPerfil: abrirPerfil,
    marcarEstado: marcarEstado,
    prepararInput: prepararInput,
    abrirCronogramaIntegrado: abrirIntegrado,
    obtenerDatosRegistro: datosRegistro,
    obtenerCedulaActual: cedulaActual,
    guardarCedula: guardarCedula,
    cedulaGuardada: cedulaGuardada,
    solicitarConsultaAutomatica: solicitarConsultaAutomatica,
    urlBase: BASE_URL
  });
})();