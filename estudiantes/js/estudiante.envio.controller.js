/*
  Archivo: estudiante.envio.controller.js
  Ruta: estudiantes/js/estudiante.envio.controller.js
  Funciones principales del archivo:
  - Controlar la vista previa del resumen antes del envío.
  - Validar el formulario final antes de guardar.
  - Construir el payload final usando formulario.service.js.
  - Exigir que el estudiante elija el título preferido en el resumen.
  - Guardar el envío final en Firebase.
  - Respaldar el envío en Google Sheets si el servicio está disponible.
  - Renderizar el comprobante final y bloquear el formulario.
  - Copiar el código de registro al portapapeles.
*/
(function () {
  'use strict';

  var envioEnProceso = false;

  function mostrarVistaPrevia(event) {
    if (event && event.preventDefault) {
      event.preventDefault();
    }

    prepararResumen(false);
  }

  function manejarEnvio(event) {
    if (event && event.preventDefault) {
      event.preventDefault();
    }

    prepararResumen(true);
  }

  function prepararResumen(abrirComoEnvio) {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var validaciones = window.TAEstudianteValidaciones;
    var formularioService = window.TAEstudianteFormulario;
    var estado = state ? state.obtener() : {};
    var formData;
    var resultado;
    var payload;

    if (!ui) {
      return null;
    }

    if (!estado.estudiante) {
      ui.showAlert('Primero consulta la cédula del estudiante.', '#cedulaInput');
      return null;
    }

    if (estado.enviadoFinal) {
      ui.showAlert('Este formulario ya fue enviado y registrado.', '');
      return null;
    }

    if (!formularioService || typeof formularioService.construirPayload !== 'function') {
      ui.showAlert('No se pudo preparar el envío porque el servicio de formulario no está disponible.', '');
      return null;
    }

    if (ui.clearFieldErrors) {
      ui.clearFieldErrors();
    }

    formData = ui.readFormData(obtenerTotalPropuestas());
    formData = normalizarFormulario(formData);

    if (validaciones && typeof validaciones.validarEnvio === 'function') {
      resultado = validaciones.validarEnvio(formData, obtenerTotalPropuestas());

      if (!resultado.ok) {
        ui.showAlert(resultado.mensaje, resultado.selector);
        return null;
      }
    }

    payload = formularioService.construirPayload(
      estado.estudiante,
      estado.appConfig,
      formData,
      estado.envioExistente
    );

    if (!payload || !payload.cedula) {
      ui.showAlert('No se pudo preparar el envío porque falta información del estudiante.', '');
      return null;
    }

    if (state && typeof state.guardarPayloadFinal === 'function') {
      state.guardarPayloadFinal(formData, payload);
    }

    if (typeof ui.renderSummary === 'function') {
      ui.renderSummary(estado.estudiante, formData, payload);
    }

    if (!abrirComoEnvio) {
      abrirModalResumen();
    }

    if (!abrirComoEnvio && typeof ui.showStatus === 'function') {
      ui.showStatus('#envioMensaje', 'Resumen generado correctamente. Revisa antes de confirmar.', 'success');
    }

    return {
      formData: formData,
      payload: payload
    };
  }

  function confirmarEnvioFinal() {
    var state = window.TAEstudianteState;
    var ui = window.TAEstudianteUI;
    var repository = window.TAEstudianteRepository;
    var estado = state ? state.obtener() : {};
    var preparado;
    var btnConfirmar = qs('#btnConfirmarEnvio');
    var btnConfirmarModal = qs('#btnConfirmarEnvioModal');
    var payload;

    if (!ui) {
      return Promise.resolve(null);
    }

    if (envioEnProceso) {
      return Promise.resolve(null);
    }

    if (!repository || typeof repository.guardarEnvioFinal !== 'function') {
      ui.showAlert('No se pudo guardar el envío porque el repositorio no está disponible.', '');
      return Promise.resolve(null);
    }

    if (!estado.estudiante) {
      ui.showAlert('Primero consulta la cédula del estudiante.', '#cedulaInput');
      return Promise.resolve(null);
    }

    if (estado.enviadoFinal) {
      ui.showAlert('Este formulario ya fue enviado y registrado.', '');
      return Promise.resolve(null);
    }

    preparado = prepararResumen(true);

    if (!preparado || !preparado.payload) {
      return Promise.resolve(null);
    }

    payload = preparado.payload;
    envioEnProceso = true;

    if (ui.setLoading) {
      ui.setLoading(btnConfirmar, true, 'Enviando...');
      ui.setLoading(btnConfirmarModal, true, 'Enviando...');
    }

    if (ui.showStatus) {
      ui.showStatus('#envioMensaje', 'Guardando envío final...', 'info');
    }

    return repository.guardarEnvioFinal(payload)
      .then(function (respuesta) {
        var data = respuesta && respuesta.data ? respuesta.data : respuesta;

        if (state && typeof state.actualizar === 'function') {
          state.actualizar({
            envioExistente: data || null,
            ultimoPayload: data || payload
          });
        }

        eliminarBorradorFinal();
        cerrarModalResumen();

        if (ui.showStatus) {
          ui.showStatus('#envioMensaje', 'Propuestas registradas. Generando respaldo...', 'info');
        }

        return respaldarEnSheets(respuesta);
      })
      .then(function (resultadoFinal) {
        if (state && typeof state.guardarResultadoFinal === 'function') {
          state.guardarResultadoFinal(resultadoFinal);
        }

        if (state && typeof state.marcarEnvioFinal === 'function') {
          state.marcarEnvioFinal(true);
        }

        if (ui.setFormDisabled) {
          ui.setFormDisabled('#formPropuestas', true);
          ui.setFormDisabled('#formTitulos', true);
        }

        if (ui.renderComprobante) {
          ui.renderComprobante(resultadoFinal);
        }

        mostrarMensajeFinal(resultadoFinal);

        return resultadoFinal;
      })
      .catch(function (error) {
        console.error('[Estudiantes] Error envío:', error);
        ui.showAlert('No se pudo guardar el envío. Revisa tu conexión e intenta nuevamente.', '');
        return null;
      })
      .finally(function () {
        envioEnProceso = false;

        if (ui.setLoading) {
          ui.setLoading(btnConfirmar, false);
          ui.setLoading(btnConfirmarModal, false);
        }
      });
  }

  function respaldarEnSheets(respuestaFirebase) {
    var state = window.TAEstudianteState;
    var sheetsService = window.TAEstudianteSheets;
    var repository = window.TAEstudianteRepository;
    var estado = state ? state.obtener() : {};
    var envio = respuestaFirebase && respuestaFirebase.data
      ? respuestaFirebase.data
      : respuestaFirebase || {};

    if (!sheetsService || typeof sheetsService.respaldarEnvio !== 'function') {
      return Promise.resolve({
        id: obtenerIdResultado(respuestaFirebase),
        firebase: respuestaFirebase,
        payload: envio,
        sheets: {
          ok: false,
          mensaje: 'Servicio de respaldo no disponible.'
        }
      });
    }

    return sheetsService.respaldarEnvio(envio, estado.appConfig)
      .then(function (resultadoSheets) {
        if (!repository || typeof repository.actualizarRespaldoSheets !== 'function') {
          return resultadoSheets;
        }

        return repository.actualizarRespaldoSheets(
          envio.periodoId,
          envio.cedula,
          resultadoSheets
        ).then(function () {
          return resultadoSheets;
        }).catch(function () {
          return resultadoSheets;
        });
      })
      .then(function (resultadoSheetsFinal) {
        return {
          id: obtenerIdResultado(respuestaFirebase),
          firebase: respuestaFirebase,
          payload: envio,
          sheets: resultadoSheetsFinal
        };
      })
      .catch(function (error) {
        console.warn('[Estudiantes] Respaldo Sheets no completado:', error);

        return {
          id: obtenerIdResultado(respuestaFirebase),
          firebase: respuestaFirebase,
          payload: envio,
          sheets: {
            ok: false,
            mensaje: error && error.message ? error.message : 'No se pudo generar respaldo.'
          }
        };
      });
  }

  function copiarCodigoRegistro() {
    var ui = window.TAEstudianteUI;
    var codeElement = qs('#codigoRegistroTexto');
    var codigo = codeElement ? String(codeElement.textContent || '').trim() : '';

    if (!ui) {
      return Promise.resolve(false);
    }

    if (!codigo || codigo === '—') {
      ui.showAlert('No hay código de registro para copiar.', '');
      return Promise.resolve(false);
    }

    return copiarTexto(codigo)
      .then(function () {
        ui.showStatus('#envioMensaje', 'Código de registro copiado.', 'success');
        return true;
      })
      .catch(function () {
        ui.showAlert('No se pudo copiar el código automáticamente. Puedes seleccionarlo y copiarlo manualmente.', '');
        return false;
      });
  }

  function copiarTexto(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto);
    }

    return new Promise(function (resolve, reject) {
      var input = document.createElement('textarea');

      try {
        input.value = texto;
        input.setAttribute('readonly', 'readonly');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        resolve();
      } catch (error) {
        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }

        reject(error);
      }
    });
  }

  function eliminarBorradorFinal() {
    var borradorController = window.TAEstudianteBorradorController;

    if (borradorController && typeof borradorController.limpiarBorradorSilencioso === 'function') {
      borradorController.limpiarBorradorSilencioso();
    }
  }

  function abrirModalResumen() {
    var ui = window.TAEstudianteUI;
    var modalService = window.TAEstudianteModal;

    if (ui && typeof ui.openModal === 'function') {
      ui.openModal();
      return;
    }

    if (modalService && typeof modalService.abrir === 'function') {
      modalService.abrir('#modalResumen');
      return;
    }

    abrirModalFallback('#modalResumen');
  }

  function cerrarModalResumen() {
    var ui = window.TAEstudianteUI;
    var modalService = window.TAEstudianteModal;

    if (ui && typeof ui.closeModal === 'function') {
      ui.closeModal();
      return;
    }

    if (modalService && typeof modalService.cerrar === 'function') {
      modalService.cerrar('#modalResumen');
      return;
    }

    cerrarModalFallback('#modalResumen');
  }

  function abrirModalFallback(selector) {
    var modal = qs(selector);

    if (!modal) {
      return;
    }

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-open-modal');
  }

  function cerrarModalFallback(selector) {
    var modal = qs(selector);

    if (!modal) {
      return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');

    if (!hayModalAbierto()) {
      document.body.classList.remove('has-open-modal');
    }
  }

  function hayModalAbierto() {
    return qsa('.modal').some(function (modal) {
      return !modal.classList.contains('is-hidden');
    });
  }

  function mostrarMensajeFinal(resultadoFinal) {
    var ui = window.TAEstudianteUI;
    var codigo = obtenerIdResultado(resultadoFinal);

    if (!ui || !ui.showStatus) {
      return;
    }

    if (resultadoFinal && resultadoFinal.sheets && resultadoFinal.sheets.ok) {
      ui.showStatus(
        '#envioMensaje',
        'Propuestas enviadas correctamente y respaldadas. Código de registro: ' + codigo + '.',
        'success'
      );
      return;
    }

    ui.showStatus(
      '#envioMensaje',
      'Propuestas enviadas correctamente. Código de registro: ' + codigo + '.',
      'success'
    );
  }

  function obtenerIdResultado(resultadoFinal) {
    var firebase;
    var payload;

    if (!resultadoFinal) {
      return '';
    }

    firebase = resultadoFinal.firebase || {};
    payload = resultadoFinal.payload || firebase.payload || firebase.data || resultadoFinal.data || {};

    return resultadoFinal.id ||
      firebase.id ||
      payload.id ||
      payload.idRegistro ||
      '';
  }

  function normalizarFormulario(formData) {
    var formularioController = window.TAEstudianteFormularioController;

    if (formularioController && typeof formularioController.normalizarFormulario === 'function') {
      return formularioController.normalizarFormulario(formData);
    }

    return formData || {};
  }

  function obtenerTotalPropuestas() {
    var config = window.TA_ESTUDIANTES_CONFIG || {};
    return Number(config.propuestasObligatorias || 3);
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function qsa(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  window.TAEstudianteEnvioController = Object.freeze({
    mostrarVistaPrevia: mostrarVistaPrevia,
    manejarEnvio: manejarEnvio,
    prepararResumen: prepararResumen,
    confirmarEnvioFinal: confirmarEnvioFinal,
    respaldarEnSheets: respaldarEnSheets,
    copiarCodigoRegistro: copiarCodigoRegistro,
    copiarTexto: copiarTexto,
    cerrarModalResumen: cerrarModalResumen
  });
})();