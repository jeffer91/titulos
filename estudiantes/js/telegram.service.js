/* Servicio para validar y normalizar Telegram del estudiante. */
(function () {
  'use strict';

  function limpiarUsuario(valor) {
    var texto = String(valor || '').trim();

    texto = texto
      .replace(/^https?:\/\/t\.me\//i, '')
      .replace(/^t\.me\//i, '')
      .replace(/\s+/g, '');

    if (!texto) return '';

    if (texto.charAt(0) !== '@') {
      texto = '@' + texto;
    }

    return texto;
  }

  function obtenerUsernameSinArroba(valor) {
    return limpiarUsuario(valor).replace(/^@/, '');
  }

  function validarUsuario(valor) {
    var usuario = limpiarUsuario(valor);
    var username = obtenerUsernameSinArroba(usuario);

    if (!username) {
      return {
        ok: false,
        usuario: '',
        url: '',
        mensaje: 'Ingresa tu usuario de Telegram.',
        selector: '#telegramInput'
      };
    }

    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
      return {
        ok: false,
        usuario: usuario,
        url: '',
        mensaje: 'Ingresa un usuario de Telegram válido. Debe iniciar con letra y tener entre 5 y 32 caracteres.',
        selector: '#telegramInput'
      };
    }

    return {
      ok: true,
      usuario: '@' + username,
      url: construirUrl(username),
      mensaje: 'Usuario de Telegram con formato válido.',
      selector: ''
    };
  }

  function construirUrl(valor) {
    var username = obtenerUsernameSinArroba(valor);

    if (!username) return '';

    return 'https://t.me/' + encodeURIComponent(username);
  }

  function abrirPerfil(valor) {
    var validacion = validarUsuario(valor);

    if (!validacion.ok) {
      return validacion;
    }

    window.open(validacion.url, '_blank', 'noopener,noreferrer');

    return {
      ok: true,
      usuario: validacion.usuario,
      url: validacion.url,
      mensaje: 'Se abrió el perfil de Telegram. Confirma visualmente que corresponde a tu cuenta.',
      selector: ''
    };
  }

  function marcarEstado(validado, mensaje) {
    var estado = document.querySelector('#telegramEstado');

    if (!estado) return;

    estado.setAttribute('data-validado', validado ? 'true' : 'false');
    estado.textContent = mensaje || (validado ? 'Telegram validado visualmente.' : 'Telegram pendiente de validación.');
  }

  function prepararInput(selector) {
    var input = document.querySelector(selector || '#telegramInput');

    if (!input) return;

    input.addEventListener('blur', function () {
      input.value = limpiarUsuario(input.value);
    });

    input.addEventListener('input', function () {
      marcarEstado(false, 'Telegram pendiente de validación.');
    });
  }

  window.TAEstudianteTelegram = Object.freeze({
    limpiarUsuario: limpiarUsuario,
    obtenerUsernameSinArroba: obtenerUsernameSinArroba,
    validarUsuario: validarUsuario,
    construirUrl: construirUrl,
    abrirPerfil: abrirPerfil,
    marcarEstado: marcarEstado,
    prepararInput: prepararInput
  });
})();