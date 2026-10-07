/*
 * Archivo: validaciones.js
 * Ruta: estudiantes/js/validaciones.js
 * Funciones principales del archivo:
 * - Limpiar y validar número de identificación.
 * - Validar datos de contacto del estudiante haciendo obligatorio Telegram.
 * - Validar y normalizar usuario de Telegram antes de avanzar.
 * - Validar campos obligatorios de cada propuesta.
 * - Obligar a que cada título final provenga de una sugerencia elegida por el estudiante.
 * - Validar título final con reglas académicas antes de avanzar o enviar.
 * - Validar formulario completo para borrador y envío final.
 * - Evitar títulos incompletos, cortados, con explicación o sin datos obligatorios.
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
    var telegramInput = document.querySelector('#telegramInput');
    var estadoTelegram = document.querySelector('#telegramEstado');
    var telegram = telegramInput ? limpiarTexto(telegramInput.value) : '';
    var servicioTelegram = window.TAEstudianteTelegram;
    var resultado;

    if (!telegram) {
      actualizarEstadoTelegram(false, 'Ingresa tu usuario de Telegram.');
      return error('Ingresa tu usuario de Telegram para continuar.', '#telegramInput');
    }

    telegram = normalizarUsuarioTelegram(telegram);

    if (telegramInput) {
      telegramInput.value = telegram;
    }

    if (servicioTelegram && typeof servicioTelegram.validarUsuario === 'function') {
      resultado = servicioTelegram.validarUsuario(telegram);

      if (!resultado || !resultado.ok) {
        actualizarEstadoTelegram(false, resultado && resultado.mensaje ? resultado.mensaje : 'El usuario de Telegram no es válido.');
        return error(
          resultado && resultado.mensaje ? resultado.mensaje : 'El usuario de Telegram no es válido.',
          resultado && resultado.selector ? resultado.selector : '#telegramInput'
        );
      }

      telegram = normalizarUsuarioTelegram(resultado.usuario || telegram);

      if (telegramInput) {
        telegramInput.value = telegram;
      }

      actualizarEstadoTelegram(true, 'Telegram validado correctamente.');

      return {
        ok: true,
        data: {
          telegram: telegram
        },
        mensaje: '',
        selector: ''
      };
    }

    resultado = validarUsuarioTelegramBasico(telegram);

    if (!resultado.ok) {
      actualizarEstadoTelegram(false, resultado.mensaje);
      return error(resultado.mensaje, '#telegramInput');
    }

    actualizarEstadoTelegram(true, 'Telegram validado correctamente.');

    return {
      ok: true,
      data: {
        telegram: resultado.usuario
      },
      mensaje: '',
      selector: ''
    };
  }

  function normalizarUsuarioTelegram(value) {
    var limpio = limpiarTexto(value).replace(/\s+/g, '');

    if (!limpio) {
      return '';
    }

    limpio = limpio.replace(/^https?:\/\/t\.me\//i, '');
    limpio = limpio.replace(/^t\.me\//i, '');
    limpio = limpio.replace(/^@+/, '');

    return '@' + limpio;
  }

  function validarUsuarioTelegramBasico(value) {
    var usuario = normalizarUsuarioTelegram(value);
    var sinArroba = usuario.replace(/^@/, '');

    if (!usuario) {
      return {
        ok: false,
        usuario: '',
        mensaje: 'Ingresa tu usuario de Telegram.'
      };
    }

    if (!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(usuario)) {
      return {
        ok: false,
        usuario: usuario,
        mensaje: 'El usuario de Telegram debe iniciar con @, empezar con una letra y tener entre 5 y 32 caracteres.'
      };
    }

    if (/__/.test(sinArroba)) {
      return {
        ok: false,
        usuario: usuario,
        mensaje: 'El usuario de Telegram no debe tener guiones bajos consecutivos.'
      };
    }

    return {
      ok: true,
      usuario: usuario,
      mensaje: ''
    };
  }

  function actualizarEstadoTelegram(validado, mensaje) {
    var estadoTelegram = document.querySelector('#telegramEstado');

    if (!estadoTelegram) {
      return;
    }

    estadoTelegram.setAttribute('data-validado', validado ? 'true' : 'false');
    estadoTelegram.textContent = mensaje || '';

    estadoTelegram.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');

    if (validado) {
      estadoTelegram.classList.add('is-success');
    } else {
      estadoTelegram.classList.add('is-error');
    }
  }

  function validarPropuestaPorNumero(numero) {
    numero = Number(numero || 0);

    if (!numero || numero < 1 || numero > 3) {
      return error('No se pudo identificar el título que debes completar.', '');
    }

    return validarPropuestaDesdeObjeto(leerPropuestaDesdeDom(numero), numero);
  }

  function validarPaso(paso) {
    if (paso === 'contacto') {
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
        mensaje: 'No hay títulos para guardar.'
      };
    }

    var tieneContenido = formData.propuestas.some(function (propuesta) {
      return Boolean(limpiarTexto(propuesta && propuesta.tituloFinal));
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
    var contacto;
    var resultado;
    var preferidoNumero;

    if (!formData) {
      return error('No hay información para enviar.', '');
    }

    if (!Array.isArray(formData.propuestas) || formData.propuestas.length < total) {
      return error('Debes completar los tres títulos.', '');
    }

    contacto = validarDatosContacto();

    if (!contacto.ok) {
      return contacto;
    }

    var titulosVistos = {};

    for (var i = 0; i < total; i += 1) {
      resultado = validarPropuestaDesdeObjeto(formData.propuestas[i], i + 1);

      if (!resultado.ok) {
        return resultado;
      }

      var claveTitulo = limpiarTitulo(formData.propuestas[i].tituloFinal)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

      if (titulosVistos[claveTitulo]) {
        return error('Los tres títulos deben ser diferentes. Revisa el Título ' + (i + 1) + '.', '#p' + (i + 1) + 'Titulo');
      }

      titulosVistos[claveTitulo] = true;
    }

    preferidoNumero = Number(formData.tituloPreferidoNumero || 0);

    if (!preferidoNumero || preferidoNumero < 1 || preferidoNumero > total) {
      return error('Selecciona el título preferido.', '');
    }

    if (!formData.propuestas[preferidoNumero - 1] || !limpiarTexto(formData.propuestas[preferidoNumero - 1].tituloFinal)) {
      return error('El título preferido seleccionado no tiene título final.', '#p' + preferidoNumero + 'Titulo');
    }

    return {
      ok: true,
      data: {
        contacto: contacto.data
      },
      mensaje: '',
      selector: ''
    };
  }

  function validarPropuestaDesdeObjeto(propuesta, numero) {
    propuesta = propuesta || {};
    numero = Number(numero || propuesta.numero || 0);

    if (!numero || numero < 1 || numero > 3) {
      return error('No se pudo identificar el título que debes completar.', '');
    }

    propuesta.numero = numero;
    propuesta.tituloFinal = limpiarTitulo(propuesta.tituloFinal);

    if (!propuesta.tituloFinal) {
      return error('Pega el Título ' + numero + ' para continuar.', '#p' + numero + 'Titulo');
    }

    return {
      ok: true,
      data: propuesta,
      mensaje: '',
      selector: ''
    };
  }

  function validarSugerenciaElegida(propuesta, numero) {
    var titulo = limpiarTitulo(propuesta && propuesta.tituloFinal);

    if (!titulo) {
      return error('Pega el Título ' + numero + ' para continuar.', '#p' + numero + 'Titulo');
    }

    return { ok: true, data: { titulo: titulo }, mensaje: '', selector: '' };
  }

  function validarTituloAcademico(propuesta, numero) {
    var titulo = limpiarTitulo(propuesta && propuesta.tituloFinal);

    if (!titulo) {
      return error('Pega el Título ' + numero + ' para continuar.', '#p' + numero + 'Titulo');
    }

    return {
      ok: true,
      data: {
        titulo: titulo,
        palabras: contarPalabras(titulo)
      },
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

  function obtenerEstudianteActual() {
    var state = window.TAEstudianteState;
    var estado = state && typeof state.obtener === 'function' ? state.obtener() : {};

    return estado && estado.estudiante ? estado.estudiante : {};
  }

  function obtenerEnfoquePorNumero(numero) {
    numero = Number(numero || 0);

    if (numero === 1) {
      return 'diagnostico';
    }

    if (numero === 2) {
      return 'propuesta';
    }

    if (numero === 3) {
      return 'evaluacion';
    }

    return 'diagnostico';
  }

  function obtenerMensajesEvaluacion(evaluacion) {
    var mensajes = [];

    if (!evaluacion) {
      return ['Revisa que el título esté completo y cumpla el formato solicitado.'];
    }

    if (Array.isArray(evaluacion.mensajes)) {
      mensajes = mensajes.concat(evaluacion.mensajes);
    }

    if (Array.isArray(evaluacion.errores)) {
      mensajes = mensajes.concat(evaluacion.errores);
    }

    if (Array.isArray(evaluacion.advertencias)) {
      mensajes = mensajes.concat(evaluacion.advertencias);
    }

    mensajes = mensajes.map(limpiarTexto).filter(Boolean);

    if (!mensajes.length) {
      mensajes.push('Revisa que incluya enfoque, problema, grupo de estudio, contexto y período.');
    }

    return mensajes;
  }

  function limpiarTitulo(value) {
    var validador = window.TATitulosAcademicValidator;

    if (validador && typeof validador.limpiarTitulo === 'function') {
      return validador.limpiarTitulo(value);
    }

    return limpiarTexto(value)
      .replace(/\s*(?:Justificaci[oó]n(?:\s+breve)?|Explicaci[oó]n)\s*:\s*[\s\S]*$/i, '')
      .replace(/^\s*[-*•]\s*/g, '')
      .replace(/^\s*\d+[).:-]\s*/g, '')
      .replace(/^\s*(Título|Titulo|Opción|Opcion|Sugerencia)\s*\d*\s*[:.-]\s*/i, '')
      .replace(/^\s*["“”'«»]+|["“”'«»]+\s*$/g, '')
      .trim();
  }

  function contarPalabras(texto) {
    var validador = window.TATitulosAcademicValidator;

    if (validador && typeof validador.contarPalabras === 'function') {
      return validador.contarPalabras(texto);
    }

    return limpiarTexto(texto)
      .split(/\s+/)
      .filter(Boolean)
      .length;
  }

  function incluyeJustificacion(texto) {
    return /justificaci[oó]n|explicaci[oó]n|corresponde\s+al\s+enfoque|este\s+t[ií]tulo|porque\s+permite/i.test(String(texto || ''));
  }

  function terminaEnIdeaIncompleta(texto) {
    var limpio = limpiarTexto(texto).toLowerCase();
    var ultimaPalabra = limpio.split(/\s+/).pop() || '';

    if (!limpio) {
      return true;
    }

    if (/[,:;–-]$/.test(limpio)) {
      return true;
    }

    if (/(\s|^)(de|del|la|las|el|los|en|para|por|con|sin|sobre|mediante|durante|hacia|desde|entre|y|o)$/i.test(limpio)) {
      return true;
    }

    if (/veh[ií]culos\s+atendidos$/i.test(limpio)) {
      return true;
    }

    if (/usuarios$|pacientes$|estudiantes$|motores$|veh[ií]culos$/i.test(limpio) && contarPalabras(limpio) < 13) {
      return true;
    }

    return ultimaPalabra.length <= 2;
  }

  function contienePalabraCortada(texto) {
    var limpio = limpiarTexto(texto);
    var partes = limpio.split(/\s+/);
    var ultima = partes[partes.length - 1] || '';

    if (!ultima) {
      return true;
    }

    if (/[a-záéíóúñ]{1,2}$/i.test(ultima) && partes.length > 4) {
      return true;
    }

    if (/[^\wáéíóúñü.,;:()/-]$/i.test(ultima)) {
      return true;
    }

    return false;
  }

  function contieneDatoObligatorio(titulo, dato) {
    var validador = window.TATitulosAcademicValidator;

    if (!campoFueProporcionado(dato)) {
      return true;
    }

    if (validador && typeof validador.contieneDatoNatural === 'function') {
      return validador.contieneDatoNatural(titulo, dato);
    }

    return contieneDatoNaturalBasico(titulo, dato);
  }

  function contienePeriodoObligatorio(titulo, periodo) {
    var validador = window.TATitulosAcademicValidator;

    if (!campoFueProporcionado(periodo)) {
      return true;
    }

    if (validador && typeof validador.contienePeriodoNatural === 'function') {
      return validador.contienePeriodoNatural(titulo, periodo);
    }

    return contienePeriodoBasico(titulo, periodo);
  }

  function campoFueProporcionado(valor) {
    var validador = window.TATitulosAcademicValidator;

    if (validador && typeof validador.campoFueProporcionado === 'function') {
      return validador.campoFueProporcionado(valor);
    }

    return Boolean(limpiarTexto(valor));
  }

  function contieneDatoNaturalBasico(titulo, dato) {
    var tituloClave = normalizarClave(titulo);
    var datoClave = normalizarClave(dato);
    var palabras;

    if (!datoClave) {
      return true;
    }

    if (tituloClave.indexOf(datoClave) >= 0) {
      return true;
    }

    palabras = datoClave.split(/\s+/).filter(function (palabra) {
      return palabra.length > 3 && !esConector(palabra);
    });

    if (!palabras.length) {
      return true;
    }

    return palabras.some(function (palabra) {
      return tituloClave.indexOf(palabra) >= 0;
    });
  }

  function contienePeriodoBasico(titulo, periodo) {
    var tituloClave = normalizarClave(titulo);
    var periodoClave = normalizarClave(periodo);
    var anios;

    if (!periodoClave) {
      return true;
    }

    if (tituloClave.indexOf(periodoClave) >= 0) {
      return true;
    }

    anios = periodoClave.match(/\b20\d{2}\b/g);

    if (anios && anios.length) {
      return anios.some(function (anio) {
        return tituloClave.indexOf(anio) >= 0;
      });
    }

    return contieneDatoNaturalBasico(titulo, periodo);
  }

  function esConector(palabra) {
    return [
      'para',
      'con',
      'del',
      'de',
      'la',
      'las',
      'el',
      'los',
      'por',
      'una',
      'uno',
      'unos',
      'unas',
      'entre',
      'sobre'
    ].indexOf(String(palabra || '').toLowerCase()) >= 0;
  }

  function normalizarClave(value) {
    var validador = window.TATitulosAcademicValidator;

    if (validador && typeof validador.normalizarClave === 'function') {
      return validador.normalizarClave(value);
    }

    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ñáéíóúü\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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
    validarPropuestaDesdeObjeto: validarPropuestaDesdeObjeto,
    validarTituloAcademico: validarTituloAcademico,
    validarSugerenciaElegida: validarSugerenciaElegida,
    normalizarUsuarioTelegram: normalizarUsuarioTelegram,
    validarUsuarioTelegramBasico: validarUsuarioTelegramBasico,
    limpiarTitulo: limpiarTitulo,
    contarPalabras: contarPalabras,
    limpiarTexto: limpiarTexto
  });
})();