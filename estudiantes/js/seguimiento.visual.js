/* Rediseño visual compacto, profesional y llamativo del seguimiento de títulos. */
(function () {
  'use strict';

  instalarEstilos();
  observar();
  mejorar();

  function observar() {
    if (!window.MutationObserver || window.__taSeguimientoVisualObserver) return;
    var observer = new MutationObserver(function () { mejorar(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__taSeguimientoVisualObserver = observer;
  }

  function mejorar() {
    var panel = document.querySelector('#seguimientoTituloPanel');
    if (!panel || panel.classList.contains('is-hidden')) return;

    var head = panel.querySelector('.seguimiento-head');
    var finalCard = panel.querySelector('.seguimiento-section--final');
    var selectedCard = panel.querySelector('.seguimiento-section--selected');
    var studentGrid = panel.querySelector('.seguimiento-student-grid');
    var proposalsSection = buscarSeccion(panel, 'Tus propuestas');
    var historySection = buscarSeccion(panel, 'Versiones y movimientos anteriores');

    panel.classList.add('seguimiento-v3');

    /* El título definitivo siempre debe quedar inmediatamente debajo del encabezado. */
    if (finalCard && head) {
      finalCard.classList.add('seguimiento-final-hero');
      if (head.nextElementSibling !== finalCard) {
        head.insertAdjacentElement('afterend', finalCard);
      }
    }

    if (finalCard) {
      panel.classList.add('seguimiento-finalizado');
      if (!finalCard.querySelector('.seguimiento-final-hero__icon')) {
        var icon = document.createElement('span');
        icon.className = 'seguimiento-final-hero__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '★';
        finalCard.insertBefore(icon, finalCard.firstChild);
      }
      if (!finalCard.querySelector('.seguimiento-final-hero__eyebrow')) {
        var label = finalCard.querySelector('.seguimiento-label');
        if (label) {
          var eyebrow = document.createElement('span');
          eyebrow.className = 'seguimiento-final-hero__eyebrow';
          eyebrow.textContent = 'APROBACIÓN DEFINITIVA';
          label.parentNode.insertBefore(eyebrow, label);
        }
      }
    }

    if (studentGrid) studentGrid.classList.add('seguimiento-student-grid--compact');
    if (selectedCard) selectedCard.classList.add('seguimiento-selected-compact');
    if (proposalsSection) proposalsSection.classList.add('seguimiento-proposals-section');
    if (historySection) historySection.classList.add('seguimiento-history-section');

    Array.prototype.forEach.call(panel.querySelectorAll('.seguimiento-step__number.is-success'), function (circle) {
      if (!circle.dataset.originalNumber) circle.dataset.originalNumber = circle.textContent;
      circle.textContent = '✓';
    });

    Array.prototype.forEach.call(panel.querySelectorAll('.seguimiento-propuesta'), function (card) {
      var text = String(card.textContent || '');
      if (/Elegido por Coordinaci[oó]n/i.test(text)) card.classList.add('is-coordinacion');
      if (/Preferido por ti/i.test(text)) card.classList.add('is-preferido');
      if (/T[ií]tulo final/i.test(text)) card.classList.add('is-final');
    });

    Array.prototype.forEach.call(panel.querySelectorAll('.seguimiento-mini-tag'), function (tag) {
      var t = String(tag.textContent || '');
      if (/Coordinaci[oó]n/i.test(t)) tag.classList.add('tag-coordinacion');
      if (/Preferido/i.test(t)) tag.classList.add('tag-preferido');
      if (/final/i.test(t)) tag.classList.add('tag-final');
    });
  }

  function buscarSeccion(panel, titulo) {
    var sections = panel.querySelectorAll('.seguimiento-section');
    for (var i = 0; i < sections.length; i += 1) {
      if (String(sections[i].textContent || '').indexOf(titulo) !== -1) return sections[i];
    }
    return null;
  }

  function instalarEstilos() {
    if (document.getElementById('seguimientoVisualV2Styles')) return;

    var style = document.createElement('style');
    style.id = 'seguimientoVisualV2Styles';
    style.textContent = [
      '.seguimiento-v3{max-width:1120px!important;padding:16px!important;margin:0 auto 18px!important;border-radius:20px!important;background:linear-gradient(180deg,#ffffff 0%,#fbfdff 100%)!important;border:1px solid #d8e2ef!important;box-shadow:0 14px 38px rgba(10,36,68,.08)!important}',
      '.seguimiento-v3 .seguimiento-head{margin-bottom:8px!important;align-items:center!important;padding:0 2px!important}',
      '.seguimiento-v3 .seguimiento-head .section-kicker{color:#145ca8!important;letter-spacing:.11em!important}',
      '.seguimiento-v3 .seguimiento-head h2{font-size:clamp(1.45rem,2.5vw,1.9rem)!important;margin:2px 0 3px!important;color:#08244a!important}',
      '.seguimiento-v3 .seguimiento-head p{font-size:.84rem!important;line-height:1.32!important;color:#617086!important;max-width:760px!important}',
      '.seguimiento-v3 .seguimiento-badge{padding:7px 12px!important;font-size:.73rem!important;box-shadow:none!important;font-weight:900!important}',
      '.seguimiento-finalizado .seguimiento-head .seguimiento-badge{background:#daf7e8!important;color:#07663b!important;border-color:#8ed9b4!important}',

      '.seguimiento-final-hero{position:relative!important;margin:8px 0 10px!important;padding:17px 18px 17px 66px!important;border:2px solid #d6a51e!important;background:linear-gradient(125deg,#fff9dc 0%,#ffe7a1 48%,#fff2c7 100%)!important;box-shadow:0 10px 26px rgba(161,112,0,.18),inset 0 1px 0 rgba(255,255,255,.82)!important;border-radius:16px!important;overflow:hidden!important}',
      '.seguimiento-final-hero:after{content:"";position:absolute;left:0;top:0;bottom:0;width:7px;background:linear-gradient(180deg,#f4c842,#c58a00)}',
      '.seguimiento-final-hero__icon{position:absolute;left:20px;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#08244a;color:#ffd65c;font-weight:900;font-size:1rem;border:2px solid #efc33d;box-shadow:0 6px 16px rgba(8,36,74,.20)}',
      '.seguimiento-final-hero__eyebrow{display:block;margin-bottom:2px;font-size:.61rem;font-weight:950;letter-spacing:.12em;color:#8a6100}',
      '.seguimiento-final-hero .seguimiento-label{color:#725000!important;margin-bottom:3px!important;font-size:.69rem!important;letter-spacing:.08em!important}',
      '.seguimiento-final-hero .seguimiento-title-text{font-size:clamp(1.03rem,1.9vw,1.22rem)!important;line-height:1.36!important;margin:0!important;color:#071d3b!important;font-weight:900!important}',

      '.seguimiento-v3 .seguimiento-student-grid{gap:7px!important;margin-bottom:9px!important}',
      '.seguimiento-v3 .seguimiento-dato{padding:9px 11px!important;border-radius:11px!important;background:#f7fbff!important;border:1px solid #cedceb!important;min-height:66px!important;box-shadow:inset 3px 0 0 #2e76bb!important}',
      '.seguimiento-v3 .seguimiento-dato span{font-size:.62rem!important;margin-bottom:3px!important;color:#55708f!important}',
      '.seguimiento-v3 .seguimiento-dato strong{font-size:.81rem!important;line-height:1.26!important;color:#102743!important}',

      '.seguimiento-v3 .seguimiento-progress{margin:0 0 9px!important;padding:10px 12px!important;border-radius:14px!important;border-color:#cad9e9!important;background:linear-gradient(90deg,#f7fbff,#ffffff)!important;box-shadow:0 3px 12px rgba(30,55,90,.04)!important}',
      '.seguimiento-v3 .seguimiento-step{gap:8px!important}',
      '.seguimiento-v3 .seguimiento-step__number{width:31px!important;height:31px!important;flex-basis:31px!important;font-size:.8rem!important;font-weight:950!important}',
      '.seguimiento-v3 .seguimiento-step__number.is-success{background:#0a9b61!important;color:#fff!important;border-color:#08794c!important;box-shadow:0 4px 10px rgba(10,155,97,.18)!important}',
      '.seguimiento-v3 .seguimiento-step span{font-size:.6rem!important;color:#56708d!important}',
      '.seguimiento-v3 .seguimiento-step strong{font-size:.82rem!important;margin:1px 0!important;color:#102743!important}',
      '.seguimiento-v3 .seguimiento-step small{font-size:.66rem!important;line-height:1.18!important;color:#6f8095!important}',
      '.seguimiento-v3 .seguimiento-progress__line{background:linear-gradient(90deg,#20a66d,#9ec9b7)!important;height:2px!important}',

      '.seguimiento-v3 .seguimiento-section{padding:11px 13px!important;border-radius:14px!important;margin-top:8px!important;border-color:#d6e0eb!important}',
      '.seguimiento-v3 .seguimiento-section__head{margin-bottom:6px!important;align-items:center!important}',
      '.seguimiento-v3 .seguimiento-section__head span{font-size:.6rem!important;color:#5f748d!important}',
      '.seguimiento-v3 .seguimiento-section__head h3{font-size:.94rem!important;margin-top:1px!important;color:#0b284f!important}',
      '.seguimiento-v3 .seguimiento-section__head small{font-size:.68rem!important;color:#62758d!important}',

      '.seguimiento-proposals-section{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;background:#f9fbfe!important}',
      '.seguimiento-proposals-section .seguimiento-section__head{grid-column:1/-1!important}',
      '.seguimiento-proposals-section .seguimiento-propuesta{padding:10px!important;border:1px solid #dce5ef!important;border-radius:11px!important;background:#fff!important;min-width:0!important;box-shadow:0 3px 10px rgba(25,55,90,.035)!important}',
      '.seguimiento-proposals-section .seguimiento-propuesta:first-of-type{padding-top:10px!important}',
      '.seguimiento-proposals-section .seguimiento-propuesta p{font-size:.8rem!important;line-height:1.32!important;margin:5px 0 0!important;color:#1d304a!important}',
      '.seguimiento-proposals-section .seguimiento-propuesta__meta{align-items:flex-start!important}',
      '.seguimiento-proposals-section .seguimiento-propuesta__meta>strong{font-size:.76rem!important;color:#0b284f!important}',
      '.seguimiento-propuesta.is-preferido{border-color:#7fb2e8!important;background:#f1f7ff!important}',
      '.seguimiento-propuesta.is-coordinacion{border-color:#286fb8!important;background:#eef6ff!important;box-shadow:inset 0 0 0 1px rgba(40,111,184,.13)!important}',
      '.seguimiento-propuesta.is-final{border-color:#d4a019!important;background:#fff7d8!important}',
      '.seguimiento-v3 .seguimiento-mini-tag{margin:2px 0 0 3px!important;padding:3px 6px!important;font-size:.57rem!important;border-radius:999px!important}',
      '.seguimiento-v3 .seguimiento-mini-tag.tag-preferido{background:#dceaff!important;color:#174e91!important}',
      '.seguimiento-v3 .seguimiento-mini-tag.tag-coordinacion{background:#0f5fa8!important;color:#fff!important}',
      '.seguimiento-v3 .seguimiento-mini-tag.tag-final{background:#f6cc4a!important;color:#5e4300!important}',

      '.seguimiento-selected-compact{padding:10px 13px!important;background:linear-gradient(90deg,#edf6ff,#f8fbff)!important;border-color:#8db9e3!important;box-shadow:inset 4px 0 0 #286fb8!important}',
      '.seguimiento-selected-compact .seguimiento-label{color:#2c5d91!important}',
      '.seguimiento-selected-compact .seguimiento-title-text{font-size:.86rem!important;line-height:1.32!important;margin-top:2px!important;color:#173453!important}',
      '.seguimiento-v3 .seguimiento-note{padding:8px 10px!important;margin-top:6px!important;font-size:.78rem!important;background:#fff8e7!important;border:1px solid #edd497!important}',
      '.seguimiento-v3 .seguimiento-note p{margin-top:3px!important;line-height:1.32!important}',

      '.seguimiento-history-section{background:#fcfdff!important}',
      '.seguimiento-history-section .seguimiento-history{max-height:230px;overflow:auto;padding-right:4px}',
      '.seguimiento-v3 .seguimiento-history__item{padding:5px 0!important;gap:8px!important}',
      '.seguimiento-v3 .seguimiento-history__dot{width:8px!important;height:8px!important;margin-top:6px!important;background:#2e76bb!important;box-shadow:0 0 0 3px #e5f0fb!important}',
      '.seguimiento-v3 .seguimiento-history__body{padding-bottom:6px!important}',
      '.seguimiento-v3 .seguimiento-history__top strong{font-size:.78rem!important;color:#153250!important}',
      '.seguimiento-v3 .seguimiento-history__top time{font-size:.62rem!important}',
      '.seguimiento-v3 .seguimiento-history__title,.seguimiento-v3 .seguimiento-history__obs{font-size:.74rem!important;line-height:1.28!important;margin-top:3px!important}',
      '.seguimiento-v3 .seguimiento-actions{margin-top:9px!important;gap:7px!important}',
      '.seguimiento-v3 .seguimiento-actions .btn{min-height:36px!important;padding:7px 13px!important;font-size:.76rem!important}',

      '@media(max-width:900px){.seguimiento-proposals-section{grid-template-columns:1fr!important}.seguimiento-v3{padding:13px!important}.seguimiento-final-hero{padding-left:58px!important}}',
      '@media(max-width:780px){.seguimiento-v3 .seguimiento-head{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:6px!important}.seguimiento-v3 .seguimiento-badge{margin-top:0!important}.seguimiento-v3 .seguimiento-progress{grid-template-columns:1fr!important;gap:6px!important}.seguimiento-v3 .seguimiento-progress__line{width:2px!important;height:10px!important;margin-left:14px!important}.seguimiento-v3 .seguimiento-student-grid{grid-template-columns:1fr 1fr!important}}',
      '@media(max-width:520px){.seguimiento-v3{padding:9px!important}.seguimiento-v3 .seguimiento-student-grid{grid-template-columns:1fr!important}.seguimiento-final-hero{padding:13px 12px 13px 52px!important}.seguimiento-final-hero__icon{left:12px!important;width:31px!important;height:31px!important}.seguimiento-v3 .seguimiento-actions .btn{width:100%!important}}'
    ].join('');

    document.head.appendChild(style);
  }
})();