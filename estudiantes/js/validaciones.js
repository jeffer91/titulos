/* Validaciones base del módulo estudiantes. */
(function () {
  'use strict';

  function limpiarCedula(valor) {
    return String(valor || '').replace(/\D/g, '').slice(0, 10);
  }

  function validarCedulaBasica(cedula) {
    var limpia = limpiarCedula(cedula);

    if (!limpia) {
      return error('Ingresa tu número de identificación.', '#cedulaInput');
    }

    if (limpia.length !== 10) {
      return error('La cédula debe tener 10 dígitos.', '#cedulaInput');
    }

    return ok(limpia);
  }

  function validarPropuesta(propuesta) {
    var numero = Number(propuesta.numero);
    var campos = [
      ['temaGeneral', 'tema general', '#p' + numero + 'Tema'],
      ['problemaNecesidad', 'problema o necesidad', '#p' + numero + 'Problema'],
      ['lugarContexto', 'lugar o contexto', '#p' + numero + 'Contexto'],
      ['grupoEstudio', 'grupo de estudio', '#p' + numero + 'Grupo'],
      ['anioPeriodo', 'año o período', '#p' + numero + 'Periodo'],
      ['objetivo', 'objetivo simple', '#p' + numero + 'Objetivo'],
      ['tituloFinal', 'título final', '#p' + numero + 'Titulo']
    ];

    for (var i = 0; i < campos.length; i += 1) {
      var key = campos[i][0];
      var label = campos[i][1];
      var selector = campos[i][2];
      if (!String(propuesta[key] || '').trim()) {
        return error('Completa el campo "' + label + '" de la propuesta ' + numero + '.', selector);
      }
    }

    if (propuesta.tituloFinal.length < 20) {
      return error('El título final de la propuesta ' + numero + ' debe ser más claro y completo.', '#p' + numero + 'Titulo');
    }

    if (propuesta.objetivo.length < 15) {
      return error('El objetivo simple de la propuesta ' + numero + ' debe explicar mejor qué quieres lograr.', '#p' + numero + 'Objetivo');
    }

    return ok(propuesta);
  }

  function validarEnvio(formData, totalPropuestas) {
    var total = totalPropuestas || 3;
    var preferido = Number(formData && formData.tituloPreferidoNumero);

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

    if ([1, 2, 3].indexOf(preferido) === -1) {
      return error('Selecciona un título preferido válido.');
    }

    return ok(formData);
  }

  function validarFormularioParaBorrador(formData) {
    if (!formData || !Array.isArray(formData.propuestas)) {
      return error('No hay información suficiente para guardar el borrador.');
    }

    var tieneContenido = Boolean(formData.telegram || formData.celular);

    formData.propuestas.forEach(function (propuesta) {
      Object.keys(propuesta).forEach(function (key) {
        if (key !== 'numero' && String(propuesta[key] || '').trim()) tieneContenido = true;
      });
    });

    if (!tieneContenido) {
      return error('Escribe al menos un dato antes de guardar el borrador.');
    }

    return ok(formData);
  }

  function ok(data) {
    return { ok: true, data: data, mensaje: '', selector: '' };
  }

  function error(mensaje, selector) {
    return { ok: false, data: null, mensaje: mensaje, selector: selector || '' };
  }

  window.TAEstudianteValidaciones = Object.freeze({
    limpiarCedula: limpiarCedula,
    validarCedulaBasica: validarCedulaBasica,
    validarPropuesta: validarPropuesta,
    validarEnvio: validarEnvio,
    validarFormularioParaBorrador: validarFormularioParaBorrador
  });
})();
