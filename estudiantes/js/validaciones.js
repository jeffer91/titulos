/* Validaciones base del módulo estudiantes. */
(function () {
  'use strict';

  function limpiarCedula(valor) {
    return String(valor || '').replace(/\D/g, '').slice(0, 10);
  }

  function validarCedulaBasica(cedula) {
    var limpia = limpiarCedula(cedula);

    if (!limpia) {
      return error('Ingresa tu número de identificación.');
    }

    if (limpia.length !== 10) {
      return error('La cédula debe tener 10 dígitos.');
    }

    return ok(limpia);
  }

  function validarPropuesta(propuesta) {
    var campos = [
      ['temaGeneral', 'tema general'],
      ['problemaNecesidad', 'problema o necesidad'],
      ['lugarContexto', 'lugar o contexto'],
      ['grupoEstudio', 'grupo de estudio'],
      ['anioPeriodo', 'año o período'],
      ['objetivo', 'objetivo simple'],
      ['tituloFinal', 'título final']
    ];

    for (var i = 0; i < campos.length; i += 1) {
      var key = campos[i][0];
      var label = campos[i][1];
      if (!String(propuesta[key] || '').trim()) {
        return error('Completa el campo "' + label + '" de la propuesta ' + propuesta.numero + '.');
      }
    }

    if (propuesta.tituloFinal.length < 20) {
      return error('El título final de la propuesta ' + propuesta.numero + ' debe ser más claro y completo.');
    }

    return ok(propuesta);
  }

  function validarEnvio(formData, totalPropuestas) {
    var total = totalPropuestas || 3;

    if (!formData || !Array.isArray(formData.propuestas)) {
      return error('No se pudieron leer las propuestas.');
    }

    if (formData.propuestas.length !== total) {
      return error('Debes completar exactamente ' + total + ' propuestas.');
    }

    for (var i = 0; i < formData.propuestas.length; i += 1) {
      var resultado = validarPropuesta(formData.propuestas[i]);
      if (!resultado.ok) return resultado;
    }

    if (![1, 2, 3].indexOf(Number(formData.tituloPreferidoNumero)) === -1) {
      return error('Selecciona un título preferido válido.');
    }

    return ok(formData);
  }

  function ok(data) {
    return { ok: true, data: data, mensaje: '' };
  }

  function error(mensaje) {
    return { ok: false, data: null, mensaje: mensaje };
  }

  window.TAEstudianteValidaciones = Object.freeze({
    limpiarCedula: limpiarCedula,
    validarCedulaBasica: validarCedulaBasica,
    validarPropuesta: validarPropuesta,
    validarEnvio: validarEnvio
  });
})();
