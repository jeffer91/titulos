/*
  Archivo: estudiante.envio.controller.js
  Ruta: estudiantes/js/estudiante.envio.controller.js
  Funciones principales del archivo:
  - Controlar la vista previa del resumen antes del envío.
  - Validar el formulario final antes de guardar.
  - Construir el payload final usando formulario.service.js.
  - Guardar el envío final en Firebase.
  - Respaldar el envío en Google Sheets si el servicio está disponible.
  - Renderizar el comprobante final y bloquear el formulario.
  - Copiar el código de registro al portapapeles.
*/
(function () {
  'use strict';

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

    if (!formularioService || !formularioService.construirPayload) {
      ui.showAlert('No se pudo preparar el envío porque el servicio de formulario no está disponible.', '');
      return null;
    }

    formData = ui.readFormData(obtenerTotalPropuestas());

    if (validaciones && validaciones.validarEnvio) {
      resultado = validaciones.validarEnvio(formData, obtenerTotalPropuestas());

      if (ui.clearFieldErrors) {
        ui.clearFieldErrors();
      }

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

    if (state && state.guardarPayloadFinal) {
      state.guardarPayloadFinal(formData, payload);
    }

    if (ui.renderSummary) {
      ui.renderSummary(estado.estudiante, formData, payload);
    }

    abrirModalResumen();

    if (!abrirComoEnvio) {
      ui.showStatus('#envioMensaje', 'Vista previa generada correctamente.', 'success');
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
    var formularioController = window.TAEstudianteFormularioController;
    var consultaController = window.TAEstudianteConsultaController;
    var estado = state ? state.obtener() : {};
    var btnConfirmar = qs('#btnConfirmarEnvio');
    var btnConfirmarModal = qs('#btnConfirmarEnvioModal');

    if (!ui) {
      return Promise.resolve(null);
    }

    if (estado.enviadoFinal) {
      cerrarModalResumen();
      ui.showAlert('El envío ya fue registrado.', '');
      return Promise.resolve(null);
    }

    if (!repository || !repository.guardarEnvioFinal) {
      cerrarModalResumen();
      ui.showAlert('No se pudo guardar el envío porque el repositorio no está disponible.', '');
      return Promise.resolve(null);
    }

    if (!estado.firebaseListo && consultaController && consultaController.asegurarFirebase) {
      return consultaController.asegurarFirebase()
        .then(function () {
          return confirmarEnvioFinal();
        })
        .catch(function () {
          cerrarModalResumen();
          ui.showAlert('No se pudo guardar el envío. Revisa tu conexión e intenta nuevamente.', '');
          return null;
        });
    }

    if (!estado.estudiante || !estado.ultimoFormulario || !estado.ultimoPayload) {
      if (formularioController && formularioController.prepararPayloadFinalSinModal) {
        formularioController.prepararPayloadFinalSinModal();
        estado = state ? state.obtener() : estado;
      }

      if (!estado.ultimoPayload) {
        cerrarModalResumen();
        ui.showAlert('No hay información lista para enviar.', '');
        return Promise.resolve(null);
      }
    }

    ui.setLoading(btnConfirmar, true, 'Enviando...');
    ui.setLoading(btnConfirmarModal, true, 'Enviando...');
    ui.showStatus('#envioMensaje', 'Registrando propuestas.', 'info');

    return repository.guardarEnvioFinal(estado.ultimoPayload)
      .then(function (respuesta) {
        var data = respuesta && respuesta.data ? respuesta.data : respuesta;

        if (state) {
          state.actualizar({
            envioExistente: data || null,
            ultimoPayload: data || estado.ultimoPayload
          });
        }

        eliminarBorradorFinal();

        cerrarModalResumen();
        ui.showStatus('#envioMensaje', 'Propuestas registradas. Generando respaldo...', 'info');

        return respaldarEnSheets(respuesta);
      })
      .then(function (resultadoFinal) {
        if (state && state.guardarResultadoFinal) {
          state.guardarResultadoFinal(resultadoFinal);
        }

        if (ui.setFormDisabled) {
          ui.setFormDisabled('#formPropuestas', true);
          ui.setFormDisabled('#formTitulos', true);
        }

        if (ui.renderComprobante) {
          ui.renderComprobante(resultadoFinal);
        }

        if (resultadoFinal && resultadoFinal.sheets && resultadoFinal.sheets.ok) {
          ui.showStatus(
            '#envioMensaje',
            'Propuestas enviadas correctamente y respaldadas. Código de registro: ' + obtenerIdResultado(resultadoFinal) + '.',
            'success'
          );
        } else {
          ui.showStatus(
            '#envioMensaje',
            'Propuestas enviadas correctamente. Código de registro: ' + obtenerIdResultado(resultadoFinal) + '.',
            'success'
          );
        }

        return resultadoFinal;
      })
      .catch(function (error) {
        console.error('[Estudiantes] Error envío:', error);
        ui.showAlert('No se pudo guardar el envío. Revisa tu conexión e intenta nuevamente.', '');
        return null;
      })
      .finally(function () {
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

    if (!sheetsService || !sheetsService.respaldarEnvio) {
      return Promise.resolve({
        id: respuestaFirebase && respuestaFirebase.id ? respuestaFirebase.id : envio.id || '',
        firebase: respuestaFirebase,
        sheets: {
          ok: false,
          mensaje: 'Servicio de respaldo no disponible.'
        }
      });
    }

    return sheetsService.respaldarEnvio(envio, estado.appConfig)
      .then(function (resultadoSheets) {
        if (!repository || !repository.actualizarRespaldoSheets) {
          return resultadoSheets;
        }

        return repository.actualizarRespaldoSheets(
          envio.periodoId,
          envio.cedula,
          resultadoSheets
        ).catch(function () {
          return resultadoSheets;
        });
      })
      .then(function (resultadoSheetsFinal) {
        return {
          id: respuestaFirebase && respuestaFirebase.id ? respuestaFirebase.id : envio.id || '',
          firebase: respuestaFirebase,
          sheets: resultadoSheetsFinal
        };
      })
      .catch(function (error) {
        console.warn('[Estudiantes] Respaldo Sheets no completado:', error);

        return {
          id: respuestaFirebase && respuestaFirebase.id ? respuestaFirebase.id : envio.id || '',
          firebase: respuestaFirebase,
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

    if (borradorController && borradorController.limpiarBorradorSilencioso) {
      borradorController.limpiarBorradorSilencioso();
    }
  }

  function abrirModalResumen() {
    var ui = window.TAEstudianteUI;
    var modalService = window.TAEstudianteModal;

    if (ui && ui.openModal) {
      ui.openModal();
      return;
    }

    if (modalService && modalService.abrir) {
      modalService.abrir('#modalResumen');
      return;
    }

    abrirModalFallback('#modalResumen');
  }

  function cerrarModalResumen() {
    var ui = window.TAEstudianteUI;
    var modalService = window.TAEstudianteModal;

    if (ui && ui.closeModal) {
      ui.closeModal();
      return;
    }

    if (modalService && modalService.cerrar) {
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

  function obtenerIdResultado(resultadoFinal) {
    if (!resultadoFinal) {
      return '';
    }

    return resultadoFinal.id ||
      resultadoFinal.codigoRegistro ||
      resultadoFinal.firebase && resultadoFinal.firebase.id ||
      resultadoFinal.firebase && resultadoFinal.firebase.data && resultadoFinal.firebase.data.id ||
      '';
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
    copiarTexto: copiarTexto
  });
})();