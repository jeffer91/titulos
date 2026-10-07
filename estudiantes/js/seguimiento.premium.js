/*
  Capa visual premium del módulo estudiantes.
  No modifica el flujo ni las consultas: solo presentación, responsive e identidad institucional.
*/
(function () {
  'use strict';

  var STYLE_ID = 'taSeguimientoPremiumStyles';
  var pendiente = false;

  instalarEstilos();
  mejorarTodo();
  observarCambios();

  function observarCambios() {
    if (!window.MutationObserver || window.__taSeguimientoPremiumObserver) return;

    var observer = new MutationObserver(function () {
      if (pendiente) return;
      pendiente = true;
      window.requestAnimationFrame(function () {
        pendiente = false;
        mejorarTodo();
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-hidden']
    });

    window.__taSeguimientoPremiumObserver = observer;
  }

  function mejorarTodo() {
    document.body.classList.add('ta-premium');

    var panel = document.querySelector('#seguimientoTituloPanel');
    if (!panel || panel.classList.contains('is-hidden')) return;

    panel.classList.add('seguimiento-premium');
    mejorarCabeceraSeguimiento(panel);
    mejorarTarjetas(panel);
    mejorarHistorial(panel);
  }

  function mejorarCabeceraSeguimiento(panel) {
    var head = panel.querySelector('.seguimiento-head');
    var badge = head && head.querySelector('.seguimiento-badge');
    var finalCard = panel.querySelector('.seguimiento-section--final, .seguimiento-final-hero');
    var textoEstado = normalizar(badge && badge.textContent);
    var aprobadoFinal = /APROBACION FINAL|APROBADO FINAL|APROBACION DEFINITIVA/.test(textoEstado);

    panel.classList.toggle('seguimiento-premium--final', aprobadoFinal);
    panel.classList.toggle('seguimiento-premium--en-proceso', !aprobadoFinal);

    if (finalCard && head) {
      finalCard.classList.add('seguimiento-premium__titulo-principal');
      finalCard.classList.toggle('is-final-approved', aprobadoFinal);
      finalCard.classList.toggle('is-reviewing', !aprobadoFinal);

      if (head.nextElementSibling !== finalCard) {
        head.insertAdjacentElement('afterend', finalCard);
      }

      var eyebrow = finalCard.querySelector('.seguimiento-final-hero__eyebrow');
      var label = finalCard.querySelector('.seguimiento-label');
      var icon = finalCard.querySelector('.seguimiento-final-hero__icon');

      if (!eyebrow) {
        eyebrow = document.createElement('span');
        eyebrow.className = 'seguimiento-final-hero__eyebrow';
        finalCard.insertBefore(eyebrow, finalCard.firstChild);
      }

      if (!icon) {
        icon = document.createElement('span');
        icon.className = 'seguimiento-final-hero__icon';
        icon.setAttribute('aria-hidden', 'true');
        finalCard.insertBefore(icon, finalCard.firstChild);
      }

      if (aprobadoFinal) {
        eyebrow.textContent = 'APROBACIÓN DEFINITIVA';
        if (label) label.textContent = 'Título final aprobado';
        icon.textContent = '✓';
      } else {
        eyebrow.textContent = 'TÍTULO REGISTRADO';
        if (label) label.textContent = 'Título en proceso de revisión';
        icon.textContent = 'T';
      }
    }

    if (badge) {
      var requiereCorreccion = /REQUIERE CORRECCION|DEVUELTO|CORREGIR/.test(textoEstado);

      badge.classList.toggle('is-premium-final', aprobadoFinal);
      badge.classList.toggle('is-premium-danger', requiereCorreccion);
      badge.classList.toggle('is-premium-pending', !aprobadoFinal && !requiereCorreccion);

      if (aprobadoFinal) {
        badge.textContent = 'Aprobado';
      } else if (requiereCorreccion) {
        badge.textContent = 'Requiere corrección';
      } else {
        badge.textContent = 'En proceso';
      }
    }
  }

  function mejorarTarjetas(panel) {
    Array.prototype.forEach.call(panel.querySelectorAll('.seguimiento-dato'), function (item, index) {
      item.classList.add('seguimiento-premium__dato');
      item.classList.add('seguimiento-premium__dato--' + ((index % 4) + 1));
    });

    Array.prototype.forEach.call(panel.querySelectorAll('.seguimiento-propuesta'), function (card, index) {
      var texto = normalizar(card.textContent);
      card.classList.add('seguimiento-premium__propuesta');
      card.classList.add('seguimiento-premium__propuesta--' + ((index % 3) + 1));
      card.classList.toggle('is-preferido', /PREFERIDO POR TI/.test(texto));
      card.classList.toggle('is-coordinacion', /SELECCIONADO EN REVISION|ELEGIDO POR COORDINACION/.test(texto));
      card.classList.toggle('is-final', /TITULO FINAL/.test(texto));

      Array.prototype.forEach.call(card.querySelectorAll('.seguimiento-mini-tag'), function (tag) {
        var tagTexto = normalizar(tag.textContent);
        tag.classList.toggle('tag-preferido', /PREFERIDO POR TI/.test(tagTexto));
        tag.classList.toggle('tag-coordinacion', /SELECCIONADO EN REVISION|ELEGIDO POR COORDINACION/.test(tagTexto));
        tag.classList.toggle('tag-final', /TITULO FINAL/.test(tagTexto));
      });
    });

    Array.prototype.forEach.call(panel.querySelectorAll('.seguimiento-step'), function (step) {
      var estado = normalizar(step.textContent);
      var pendienteActual = /PENDIENTE/.test(estado) && !/NO HABILITADO|AUN NO HABILITADO/.test(estado);
      var noHabilitado = /NO HABILITADO|AUN NO HABILITADO/.test(estado);

      step.classList.toggle('is-approved', /APROBADO|VALIDADO/.test(estado));
      step.classList.toggle('is-returned', /DEVUELTO|RECHAZADO|CORRECCION/.test(estado));
      step.classList.toggle('is-current-pending', pendienteActual);
      step.classList.toggle('is-disabled-stage', noHabilitado);
      step.classList.toggle('is-waiting', pendienteActual || noHabilitado);
    });
  }

  function mejorarHistorial(panel) {
    var history = panel.querySelector('.seguimiento-history');
    if (history) {
      history.classList.add('seguimiento-premium__history');
      history.style.maxHeight = 'none';
      history.style.overflow = 'visible';

      Array.prototype.forEach.call(history.querySelectorAll('.seguimiento-history__item'), function (item) {
        var texto = normalizar(item.textContent);
        item.classList.toggle('is-history-pending', /PENDIENTE/.test(texto));
        item.classList.toggle('is-history-approved', /APROBADO|VALIDADO/.test(texto));
        item.classList.toggle('is-history-returned', /DEVUELTO|RECHAZADO|CORRECCION/.test(texto));
        item.classList.toggle('is-history-sent', /ENVIADO|REENVIADO|ENVIO DEL ESTUDIANTE|REENVIO DEL ESTUDIANTE/.test(texto));
      });
    }
  }

  function normalizar(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function instalarEstilos() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      ':root{--ta-navy:#071b34;--ta-blue:#0c5ea8;--ta-blue-2:#1683c8;--ta-cyan:#159c9a;--ta-teal:#087f76;--ta-violet:#6655b8;--ta-gold:#d39a12;--ta-gold-2:#f4c84a;--ta-amber-bg:#fff6d9;--ta-green:#078958;--ta-red:#b42318;--ta-ink:#10243f;--ta-muted:#62748b;--ta-line:#d6e2ef;--ta-surface:#f4f8fc}',
      'body.ta-premium{background:radial-gradient(circle at 15% 0%,#edf6ff 0,#f5f8fc 34%,#f4f7fb 70%)!important;color:var(--ta-ink)}',

      'body.ta-premium .student-hero{position:relative;background:linear-gradient(118deg,#06162c 0%,#08264b 55%,#0b315a 100%)!important;padding:22px 20px!important;overflow:hidden}',
      'body.ta-premium .student-hero:before{content:"";position:absolute;width:360px;height:360px;right:-140px;top:-230px;border-radius:50%;background:radial-gradient(circle,rgba(28,156,191,.22),rgba(28,156,191,0) 68%);pointer-events:none}',
      'body.ta-premium .student-hero:after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,#d7a51d 0 18%,#16a0a4 47%,#1779bb 78%,transparent)}',
      'body.ta-premium .student-hero__inner{position:relative;z-index:1;width:min(1180px,100%);margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:28px}',
      'body.ta-premium .student-hero__brand{display:flex;align-items:center;gap:24px;min-width:0;flex:1}',
      '',
      'body.ta-premium .student-hero__text{min-width:0}',
      'body.ta-premium .student-hero__text .eyebrow{display:inline-flex;align-items:center;gap:7px;margin-bottom:5px;color:#f2d371;font-size:.72rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}',
      'body.ta-premium .student-hero__text .eyebrow:before{content:"";width:18px;height:2px;border-radius:2px;background:#f2d371}',
      'body.ta-premium .student-hero h1{margin:0 0 5px!important;font-size:clamp(1.7rem,3vw,2.35rem)!important;line-height:1.06!important;letter-spacing:-.015em;color:#fff}',
      'body.ta-premium .student-hero p{font-size:.94rem;line-height:1.45;color:#dce8f5!important;max-width:720px}',
      'body.ta-premium .student-hero__status{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;flex:0 0 auto}',
      'body.ta-premium .student-hero__status .status-pill{min-height:32px;padding:6px 11px;font-size:.72rem;border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}',
      'body.ta-premium #estadoProcesoBadge{background:rgba(17,154,102,.17);border-color:rgba(77,211,156,.38);color:#baf5d9}',
      'body.ta-premium #periodoActivoBadge{background:rgba(255,255,255,.09);color:#e9f0f8}',

      'body.ta-premium .student-shell{width:min(1180px,100%)!important;margin:18px auto 48px!important;padding:0 18px!important}',
      'body.ta-premium .card{border:1px solid #d5e1ee;border-radius:18px;box-shadow:0 12px 34px rgba(8,38,75,.07)}',

      'body.ta-premium .seguimiento-premium{max-width:1120px!important;margin:0 auto 22px!important;padding:18px!important;border:1px solid #d2dfec!important;border-radius:22px!important;background:linear-gradient(180deg,#fff,#fbfdff)!important;box-shadow:0 22px 60px rgba(7,31,61,.10)!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:18px!important;margin:0 0 10px!important;padding:2px 2px 8px!important;border-bottom:1px solid #e8eef5}',
      'body.ta-premium .seguimiento-premium .seguimiento-head .section-kicker{color:#1468aa!important;font-size:.68rem!important;letter-spacing:.14em!important;margin-bottom:3px!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-head h2{font-size:clamp(1.55rem,2.7vw,2.05rem)!important;line-height:1.08!important;color:#082548!important;margin:0 0 4px!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-head p{font-size:.84rem!important;color:#66778d!important;line-height:1.4!important;margin:0!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-badge{padding:8px 13px!important;border-radius:999px!important;font-size:.7rem!important;font-weight:900!important;letter-spacing:.01em!important;white-space:nowrap!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-badge.is-premium-final{background:#e4f8ee!important;color:#056f45!important;border-color:#9bddbd!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-badge.is-premium-pending{background:#fff1c6!important;color:#7a5200!important;border-color:#dfb13b!important;box-shadow:0 4px 12px rgba(184,125,0,.10)!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-badge.is-premium-danger{background:#fff0f0!important;color:#9d2828!important;border-color:#e6aaaa!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-status-hero{position:relative!important;overflow:hidden!important;margin:2px 0 13px!important;padding:17px 18px 17px 21px!important;border-radius:16px!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-status-hero:before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:#d39a12}',
      'body.ta-premium .seguimiento-premium .seguimiento-status-hero.is-pending{border:1px solid #e4bd59!important;background:linear-gradient(112deg,#fff1bd 0%,#fff8df 52%,#fffdf5 100%)!important;box-shadow:0 12px 30px rgba(181,123,0,.13)!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-status-hero.is-pending .seguimiento-status-hero__icon{background:#d39a12!important;color:#fff!important;box-shadow:0 8px 20px rgba(191,128,0,.22)!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-status-hero.is-pending .seguimiento-status-hero__body span{color:#8b670c!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-status-hero.is-pending .seguimiento-status-hero__body strong{color:#815600!important;font-size:clamp(1.28rem,2.25vw,1.7rem)!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-status-hero.is-pending .seguimiento-status-hero__body p{color:#6f5b26!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-status-hero.is-success:before{background:#078958}',
      'body.ta-premium .seguimiento-premium .seguimiento-status-hero.is-danger:before{background:#b42318}',
      'body.ta-premium .seguimiento-premium .seguimiento-status-hero__action{margin-top:10px!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-status-hero__action .btn{width:auto!important;min-height:36px!important;padding:7px 13px!important;border-radius:10px!important;background:#b42318!important;color:#fff!important;border:1px solid #991f16!important;box-shadow:0 6px 16px rgba(180,35,24,.16)!important;font-size:.73rem!important}',

      'body.ta-premium .seguimiento-premium__titulo-principal{position:relative!important;overflow:hidden!important;margin:10px 0 11px!important;padding:18px 20px 18px 66px!important;border-radius:16px!important}',
      'body.ta-premium .seguimiento-premium__titulo-principal.is-final-approved{border:1px solid #d9ab2c!important;background:linear-gradient(118deg,#fff9dc 0%,#ffe7a6 46%,#fff4cf 100%)!important;box-shadow:0 10px 26px rgba(166,117,0,.14)!important}',
      'body.ta-premium .seguimiento-premium__titulo-principal.is-reviewing{border:1px solid #8dbbe5!important;background:linear-gradient(118deg,#f0f7ff 0%,#e2f2ff 50%,#f5fbff 100%)!important;box-shadow:0 10px 24px rgba(21,95,160,.10)!important}',
      'body.ta-premium .seguimiento-premium__titulo-principal:after{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:linear-gradient(180deg,#e1b12f,#bd8200)}',
      'body.ta-premium .seguimiento-premium__titulo-principal.is-reviewing:after{background:linear-gradient(180deg,#1685c7,#0d5ca4)}',
      'body.ta-premium .seguimiento-premium__titulo-principal .seguimiento-final-hero__icon{position:absolute!important;left:18px!important;top:50%!important;transform:translateY(-50%)!important;width:34px!important;height:34px!important;border-radius:50%!important;display:grid!important;place-items:center!important;background:#082548!important;color:#f4ce52!important;border:2px solid #e7bd3e!important;font-size:.92rem!important;font-weight:950!important;box-shadow:0 7px 18px rgba(8,37,72,.18)!important}',
      'body.ta-premium .seguimiento-premium__titulo-principal.is-reviewing .seguimiento-final-hero__icon{background:#0d65aa!important;color:#fff!important;border-color:#8fc5ed!important}',
      'body.ta-premium .seguimiento-premium__titulo-principal .seguimiento-final-hero__eyebrow{display:block!important;margin-bottom:1px!important;font-size:.58rem!important;font-weight:950!important;letter-spacing:.13em!important;color:#8a6200!important}',
      'body.ta-premium .seguimiento-premium__titulo-principal.is-reviewing .seguimiento-final-hero__eyebrow{color:#1c6098!important}',
      'body.ta-premium .seguimiento-premium__titulo-principal .seguimiento-label{font-size:.65rem!important;margin-bottom:3px!important;color:#725100!important}',
      'body.ta-premium .seguimiento-premium__titulo-principal.is-reviewing .seguimiento-label{color:#315f86!important}',
      'body.ta-premium .seguimiento-premium__titulo-principal .seguimiento-title-text{margin:0!important;font-size:clamp(1.04rem,2vw,1.3rem)!important;line-height:1.34!important;color:#071e3d!important;font-weight:900!important;letter-spacing:-.005em!important}',

      'body.ta-premium .seguimiento-premium .seguimiento-student-grid{display:grid!important;grid-template-columns:1.05fr .72fr 1.18fr 1.05fr!important;gap:8px!important;margin:0 0 10px!important}',
      'body.ta-premium .seguimiento-premium__dato{position:relative;padding:10px 12px!important;min-height:68px!important;border:1px solid #cfdeec!important;border-radius:12px!important;background:linear-gradient(180deg,#fff,#f6faff)!important;box-shadow:none!important}',
      'body.ta-premium .seguimiento-premium__dato:before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:4px;background:#1684c7}',
      'body.ta-premium .seguimiento-premium__dato--1:before{background:#1684c7}',
      'body.ta-premium .seguimiento-premium__dato--2:before{background:#159c9a}',
      'body.ta-premium .seguimiento-premium__dato--3:before{background:#6655b8}',
      'body.ta-premium .seguimiento-premium__dato--4:before{background:#d39a12}',
      'body.ta-premium .seguimiento-premium__dato span{font-size:.59rem!important;color:#58718c!important;letter-spacing:.075em!important;margin-bottom:3px!important}',
      'body.ta-premium .seguimiento-premium__dato strong{font-size:.8rem!important;line-height:1.25!important;color:#102a48!important;font-weight:850!important}',

      'body.ta-premium .seguimiento-premium .seguimiento-progress{display:grid!important;grid-template-columns:1fr 42px 1fr 42px 1fr!important;align-items:center!important;gap:0!important;margin:0 0 10px!important;padding:11px 13px!important;border:1px solid #d2dfec!important;border-radius:14px!important;background:linear-gradient(90deg,#f8fbff,#fff,#f8fbff)!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-progress__line{height:2px!important;width:100%!important;background:#d5e2ee!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-step{display:flex!important;align-items:center!important;gap:8px!important;min-width:0}',
      'body.ta-premium .seguimiento-premium .seguimiento-step__number{width:30px!important;height:30px!important;flex:0 0 30px!important;border-radius:50%!important;font-size:.72rem!important;font-weight:950!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-step.is-approved .seguimiento-step__number{background:#0b9661!important;color:#fff!important;border-color:#07784c!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-step.is-returned .seguimiento-step__number{background:#b42318!important;color:#fff!important;border-color:#8e1b13!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-step.is-current-pending .seguimiento-step__number{background:#f4c84a!important;color:#5f4300!important;border-color:#d39a12!important;box-shadow:0 4px 12px rgba(188,128,0,.16)!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-step.is-current-pending strong{color:#815600!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-step.is-disabled-stage .seguimiento-step__number{background:#eef2f6!important;color:#728197!important;border-color:#d7e0e8!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-step span{font-size:.57rem!important;color:#58708a!important;letter-spacing:.07em!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-step strong{font-size:.8rem!important;color:#102b49!important;margin:1px 0!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-step small{font-size:.63rem!important;color:#718197!important;line-height:1.2!important}',

      'body.ta-premium .seguimiento-premium .seguimiento-section{margin-top:8px!important;padding:12px 13px!important;border-radius:14px!important;border-color:#d7e2ed!important;background:#fff!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-section__head{margin-bottom:8px!important;align-items:center!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-section__head span{font-size:.57rem!important;letter-spacing:.09em!important;color:#61768f!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-section__head h3{font-size:.93rem!important;color:#0c294d!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-section__head small{font-size:.65rem!important;color:#6f8095!important}',

      'body.ta-premium .seguimiento-premium .seguimiento-proposals-section{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:9px!important;background:#f8fbff!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-proposals-section .seguimiento-section__head{grid-column:1/-1!important}',
      'body.ta-premium .seguimiento-premium__propuesta{position:relative;padding:11px!important;border:1px solid #d9e4ef!important;border-radius:12px!important;background:#fff!important;min-width:0!important;box-shadow:0 4px 14px rgba(22,55,90,.04)!important;overflow:hidden!important}',
      'body.ta-premium .seguimiento-premium__propuesta:before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:#1684c7}',
      'body.ta-premium .seguimiento-premium__propuesta--2:before{background:#159c9a}',
      'body.ta-premium .seguimiento-premium__propuesta--3:before{background:#6655b8}',
      'body.ta-premium .seguimiento-premium__propuesta.is-preferido{border-color:#dfb13b!important;background:linear-gradient(180deg,#fff9e8,#fffdf7)!important;box-shadow:0 6px 18px rgba(183,124,0,.08)!important}',
      'body.ta-premium .seguimiento-premium__propuesta.is-preferido:before{background:#d39a12!important}',
      'body.ta-premium .seguimiento-premium__propuesta.is-coordinacion{border-color:#2e75b7!important;background:#edf6ff!important;box-shadow:inset 0 0 0 1px rgba(46,117,183,.12)!important}',
      'body.ta-premium .seguimiento-premium__propuesta p{font-size:.78rem!important;line-height:1.35!important;color:#1e334f!important;margin:6px 0 0!important}',
      'body.ta-premium .seguimiento-premium__propuesta .seguimiento-propuesta__meta>strong{font-size:.73rem!important;color:#0d2a4e!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-mini-tag{display:inline-flex!important;align-items:center!important;padding:3px 6px!important;margin:2px 0 0 3px!important;font-size:.54rem!important;font-weight:900!important;border-radius:999px!important}',
      'body.ta-premium .seguimiento-premium .tag-preferido{background:#ffe9a3!important;color:#704b00!important;border:1px solid #e2bb4c!important}',
      'body.ta-premium .seguimiento-premium .tag-coordinacion{background:#0f5fa8!important;color:#fff!important}',
      'body.ta-premium .seguimiento-premium .tag-final{background:#f3cc56!important;color:#674900!important}',

      'body.ta-premium .seguimiento-premium .seguimiento-selected-compact{background:linear-gradient(90deg,#edf6ff,#f9fcff)!important;border-color:#9cc4e7!important;box-shadow:inset 4px 0 0 #226fb3!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-selected-compact .seguimiento-title-text{font-size:.84rem!important;line-height:1.35!important;color:#153858!important}',

      'body.ta-premium .seguimiento-premium .seguimiento-history-section{background:#fbfdff!important}',
      'body.ta-premium .seguimiento-premium__history{max-height:none!important;overflow:visible!important;padding:0!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item{grid-template-columns:13px 1fr!important;gap:8px!important;padding:7px 0!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__dot{width:8px!important;height:8px!important;margin-top:6px!important;background:#2876b8!important;box-shadow:0 0 0 3px #e4f0fb!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-section--history{padding:9px 11px!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history--compact{gap:0!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item--compact{grid-template-columns:12px 1fr!important;gap:7px!important;padding:5px 0!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item--compact .seguimiento-history__body{padding-bottom:5px!important;border-bottom:1px solid #edf1f5!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item--compact:last-child .seguimiento-history__body{border-bottom:0!important;padding-bottom:0!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item--compact .seguimiento-history__top{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item--compact .seguimiento-history__top strong{font-size:.74rem!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item--compact .seguimiento-history__top time{font-size:.58rem!important;white-space:nowrap!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item--compact .seguimiento-history__obs{margin:2px 0 0!important;font-size:.68rem!important;line-height:1.28!important;color:#5c6f82!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item.is-history-sent .seguimiento-history__dot{background:#2876b8!important;box-shadow:0 0 0 3px #e4f0fb!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item.is-history-pending .seguimiento-history__dot{background:#d39a12!important;box-shadow:0 0 0 3px #fff0b9!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item.is-history-approved .seguimiento-history__dot{background:#078958!important;box-shadow:0 0 0 3px #dff5e9!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item.is-history-returned .seguimiento-history__dot{background:#b42318!important;box-shadow:0 0 0 3px #fde0de!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item.is-history-pending .seguimiento-mini-tag{background:#fff0bd!important;color:#775000!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item.is-history-approved .seguimiento-mini-tag{background:#ddf4e8!important;color:#087044!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__item.is-history-returned .seguimiento-mini-tag{background:#fde8e6!important;color:#962a22!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__body{padding-bottom:7px!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__top strong{font-size:.76rem!important;color:#173653!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__top time{font-size:.59rem!important;color:#78899d!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-history__title,body.ta-premium .seguimiento-premium .seguimiento-history__obs{font-size:.72rem!important;line-height:1.32!important;margin-top:3px!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-actions{margin-top:10px!important;gap:8px!important}',
      'body.ta-premium .seguimiento-premium .seguimiento-actions .btn{min-height:38px!important;padding:8px 14px!important;font-size:.73rem!important;border-radius:10px!important}',

      '@media(max-width:1020px){body.ta-premium .student-hero__inner{align-items:flex-start}body.ta-premium .student-hero__status{max-width:250px}body.ta-premium .seguimiento-premium .seguimiento-student-grid{grid-template-columns:1fr 1fr!important}body.ta-premium .seguimiento-premium .seguimiento-proposals-section{grid-template-columns:1fr 1fr!important}.seguimiento-proposals-section .seguimiento-propuesta:last-child{grid-column:1/-1}}',
      '@media(max-width:780px){body.ta-premium .student-hero{padding:17px 15px!important}body.ta-premium .student-hero__inner{flex-direction:column!important;gap:14px!important}body.ta-premium .student-hero__brand{width:100%;align-items:flex-start;gap:15px!important}body.ta-premium .student-hero__status{width:100%;max-width:none;justify-content:flex-start}body.ta-premium .student-shell{padding:0 12px!important;margin-top:12px!important}body.ta-premium .seguimiento-premium{padding:13px!important;border-radius:17px!important}body.ta-premium .seguimiento-premium .seguimiento-head{flex-direction:column!important;align-items:flex-start!important;gap:7px!important}body.ta-premium .seguimiento-premium .seguimiento-progress{grid-template-columns:1fr!important;gap:6px!important}body.ta-premium .seguimiento-premium .seguimiento-progress__line{width:2px!important;height:12px!important;margin-left:14px!important}body.ta-premium .seguimiento-premium .seguimiento-proposals-section{grid-template-columns:1fr!important}body.ta-premium .seguimiento-premium .seguimiento-proposals-section .seguimiento-propuesta:last-child{grid-column:auto}}',
      '@media(max-width:560px){body.ta-premium .student-hero__brand{flex-direction:column!important}body.ta-premium .student-hero h1{font-size:1.58rem!important}body.ta-premium .student-hero p{font-size:.85rem!important}body.ta-premium .student-hero__status .status-pill{font-size:.66rem!important}body.ta-premium .seguimiento-premium{padding:10px!important}body.ta-premium .seguimiento-premium .seguimiento-student-grid{grid-template-columns:1fr!important}body.ta-premium .seguimiento-premium__titulo-principal{padding:14px 12px 14px 53px!important}body.ta-premium .seguimiento-premium__titulo-principal .seguimiento-final-hero__icon{left:12px!important;width:30px!important;height:30px!important}body.ta-premium .seguimiento-premium__titulo-principal .seguimiento-title-text{font-size:1rem!important}body.ta-premium .seguimiento-premium .seguimiento-section{padding:10px!important}body.ta-premium .seguimiento-premium .seguimiento-history__top{flex-direction:column!important;gap:2px!important}body.ta-premium .seguimiento-premium .seguimiento-actions{flex-direction:column!important}body.ta-premium .seguimiento-premium .seguimiento-actions .btn{width:100%!important}body.ta-premium .seguimiento-premium .seguimiento-status-hero__action .btn{width:100%!important}}'
    ].join('');

    document.head.appendChild(style);
  }
})();
