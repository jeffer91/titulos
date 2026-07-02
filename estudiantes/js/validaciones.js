/*
 * Archivo: validaciones.js
 * Ruta: estudiantes/js/validaciones.js
 * Funciones del archivo:
 * - Limpiar y validar número de identificación.
 * - Validar datos de contacto del estudiante.
 * - Validar campos obligatorios de cada propuesta.
 * - Validar título final antes de avanzar o enviar.
 * - Validar formulario completo para borrador y envío final.
 */
(function () {
  'use strict';

  function limpiarCedula(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 10);
  }

  function validarCedulaBasica(value) {
    var cedula = limpiarCedula(value);

    if (!cedula) {
      return error('Ingresa tu número de identificación.', '#cedulaInput');
    }

    if (cedula.length !== 9 && cedula.length !== 10) {
      return error('Ingresa una cédula válida de 9 o 10 dígitos.', '#cedulaInput');
    }

    return {
      ok: true,
      data: cedula,
      mensaje: '',
      selector: ''
    };
  }

  function validarDatosContacto() {
    var telegram = obtenerValor('#telegramInput');
    var servicioTelegram = window.TAEstudianteTelegram;

    if (!servicioTelegram || !servicioTelegram.validarUsuario) {
      return error('No se pudo validar Telegram porque el servicio no está disponible.', '#telegramInput');
    }

    var resultado = servicioTelegram.validarUsuario(telegram);

    if (!resultado.ok) {
      return error(resultado.mensaje, resultado.selector || '#telegramInput');
    }

    var estadoTelegram = document.querySelector('#telegramEstado');
    var validado = estadoTelegram && estadoTelegram.getAttribute('data-validado') === 'true';

    if (!validado) {
      return error('Valida tu usuario de Telegram antes de continuar.', '#telegramInput');
    }

    return {
      ok: true,
      data: {
        telegram: resultado.usuario
      },
      mensaje: '',
      selector: ''
    };
  }

  function validarPropuestaPorNumero(numero) {
    numero = Number(numero || 0);

    if (!numero || numero < 1 || numero > 3) {
      return error('No se pudo identificar la propuesta que debes completar.', '');
    }

    return validarPropuestaDesdeObjeto(leerPropuestaDesdeDom(numero), numero);
  }

  function validarPaso(paso) {
    if (paso === 'datos') {
      return validarDatosContacto();
    }

    if (paso === 'propuesta1') {
      return validarPropuestaPorNumero(1);
    }

    if (paso === 'propuesta2') {
      return validarPropuestaPorNumero(2);
    }

    if (paso === 'propuesta3') {
      return validarPropuestaPorNumero(3);
    }

    return {
      ok: true,
      data: null,
      mensaje: '',
      selector: ''
    };
  }

  function validarFormularioParaBorrador(formData) {
    if (!formData) {
      return {
        ok: false,
        mensaje: 'No hay información para guardar.'
      };
    }

    if (!Array.isArray(formData.propuestas) || !formData.propuestas.length) {
      return {
        ok: false,
        mensaje: 'No hay propuestas para guardar.'
      };
    }

    var tieneContenido = formData.propuestas.some(function (propuesta) {
      return Boolean(
        limpiarTexto(propuesta.temaGeneral) ||
        limpiarTexto(propuesta.problemaNecesidad) ||
        limpiarTexto(propuesta.lugarContexto) ||
        limpiarTexto(propuesta.grupoEstudio) ||
        limpiarTexto(propuesta.anioPeriodo) ||
        limpiarTexto(propuesta.objetivo) ||
        limpiarTexto(propuesta.tituloFinal)
      );
    });

    if (!tieneContenido) {
      return {
        ok: false,
        mensaje: 'Escribe al menos un dato antes de guardar el borrador.'
      };
    }

    return {
      ok: true,
      mensaje: ''
    };
  }

  function validarEnvio(formData, propuestasObligatorias) {
    var total = Number(propuestasObligatorias || 3);

    if (!formData) {
      return error('No hay información para enviar.', '');
    }

    if (!Array.isArray(formData.propuestas) || formData.propuestas.length < total) {
      return error('Debes completar las tres propuestas.', '');
    }

    var contacto = validarDatosContacto();

    if (!contacto.ok) {
      return contacto;
    }

    for (var i = 0; i < total; i += 1) {
      var resultado = validarPropuestaDesdeObjeto(formData.propuestas[i], i + 1);

      if (!resultado.ok) {
        return resultado;
      }
    }

    if (!formData.tituloPreferidoNumero) {
      return error('Selecciona el título preferido.', '');
    }

    return {
      ok: true,
      mensaje: '',
      selector: ''
    };
  }

  function validarPropuestaDesdeObjeto(propuesta, numero) {
    propuesta = propuesta || {};
    numero = Number(numero || propuesta.numero || 0);

    if (!limpiarTexto(propuesta.temaGeneral)) {
      return error('Completa el tema general de la propuesta ' + numero + '.', '#p' + numero + 'Tema');
    }

    if (!limpiarTexto(propuesta.problemaNecesidad)) {
      return error('Completa el problema o necesidad de la propuesta ' + numero + '.', '#p' + numero + 'Problema');
    }

    if (!limpiarTexto(propuesta.lugarContexto)) {
      return error('Completa el lugar o contexto de la propuesta ' + numero + '.', '#p' + numero + 'Contexto');
    }

    if (!limpiarTexto(propuesta.grupoEstudio)) {
      return error('Completa el grupo de estudio de la propuesta ' + numero + '.', '#p' + numero + 'Grupo');
    }

    if (!limpiarTexto(propuesta.anioPeriodo)) {
      return error('Completa el año o período de la propuesta ' + numero + '.', '#p' + numero + 'Periodo');
    }

    if (!limpiarTexto(propuesta.objetivo)) {
      return error('Completa el objetivo simple de la propuesta ' + numero + '.', '#p' + numero + 'Objetivo');
    }

    if (!limpiarTexto(propuesta.tituloFinal)) {
      return error('Completa el título final de la propuesta ' + numero + '.', '#p' + numero + 'Titulo');
    }

    if (limpiarTexto(propuesta.tituloFinal).length < 20) {
      return error('El título final de la propuesta ' + numero + ' debe ser más específico.', '#p' + numero + 'Titulo');
    }

    return {
      ok: true,
      data: propuesta,
      mensaje: '',
      selector: ''
    };
  }

  function leerPropuestaDesdeDom(numero) {
    return {
      numero: numero,
      temaGeneral: obtenerValor('#p' + numero + 'Tema'),
      problemaNecesidad: obtenerValor('#p' + numero + 'Problema'),
      lugarContexto: obtenerValor('#p' + numero + 'Contexto'),
      grupoEstudio: obtenerValor('#p' + numero + 'Grupo'),
      anioPeriodo: obtenerValor('#p' + numero + 'Periodo'),
      objetivo: obtenerValor('#p' + numero + 'Objetivo'),
      tituloFinal: obtenerValor('#p' + numero + 'Titulo')
    };
  }

  function obtenerValor(selector) {
    var element = document.querySelector(selector);
    return element ? limpiarTexto(element.value) : '';
  }

  function error(mensaje, selector) {
    return {
      ok: false,
      data: '',
      mensaje: mensaje,
      selector: selector || ''
    };
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  window.TAEstudianteValidaciones = Object.freeze({
    limpiarCedula: limpiarCedula,
    validarCedulaBasica: validarCedulaBasica,
    validarDatosContacto: validarDatosContacto,
    validarPropuestaPorNumero: validarPropuestaPorNumero,
    validarPaso: validarPaso,
    validarFormularioParaBorrador: validarFormularioParaBorrador,
    validarEnvio: validarEnvio,
    limpiarTexto: limpiarTexto
  });
})();