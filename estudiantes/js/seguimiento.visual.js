/* Rediseño visual compacto del seguimiento de títulos. */
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

    panel.classList.add('seguimiento-v2');

    if (finalCard && head && finalCard.previousElementSibling !== head) {
      finalCard.classList.add('seguimiento-final-hero');
      head.insertAdjacentElement('afterend', finalCard);
    }

    if (finalCard) {
      finalCard.classList.add('seguimiento-final-hero');
      panel.classList.add('seguimiento-finalizado');
      if (!finalCard.querySelector('.seguimiento-final-hero__icon')) {
        var icon = document.createElement('span');
        icon.className = 'seguimiento-final-hero__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '✓';
        finalCard.insertBefore(icon, finalCard.firstChild);
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
      '.seguimiento-v2{max-width:1120px!important;padding:18px!important;margin:0 auto 18px!important;border-radius:20px!important}',
      '.seguimiento-v2 .seguimiento-head{margin-bottom:10px!important;align-items:center!important}',
      '.seguimiento-v2 .seguimiento-head h2{font-size:clamp(1.45rem,2.5vw,1.9rem)!important;margin:2px 0 4px!important}',
      '.seguimiento-v2 .seguimiento-head p{font-size:.88rem!important;line-height:1.35!important;color:#607089!important;max-width:760px!important}',
      '.seguimiento-v2 .seguimiento-badge{padding:7px 11px!important;font-size:.76rem!important;box-shadow:none!important}',
      '.seguimiento-finalizado .seguimiento-head .seguimiento-badge{background:#fff7d6!important;color:#8a6400!important;border-color:#e8c95b!important}',

      '.seguimiento-final-hero{position:relative!important;margin:8px 0 12px!important;padding:16px 18px 16px 58px!important;border:1px solid #d9b33f!important;background:linear-gradient(135deg,#fffdf5 0%,#fff5c8 52%,#fffaf0 100%)!important;box-shadow:0 8px 24px rgba(146,105,0,.11)!important;border-radius:16px!important}',
      '.seguimiento-final-hero__icon{position:absolute;left:16px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#b88a12;color:#fff;font-weight:900;box-shadow:0 5px 14px rgba(126,89,0,.20)}',
      '.seguimiento-final-hero .seguimiento-label{color:#8b6710!important;margin-bottom:4px!important;font-size:.7rem!important;letter-spacing:.09em!important}',
      '.seguimiento-final-hero .seguimiento-title-text{font-size:clamp(1.02rem,1.8vw,1.18rem)!important;line-height:1.38!important;margin:0!important;color:#18253a!important;font-weight:850!important}',

      '.seguimiento-v2 .seguimiento-student-grid{gap:8px!important;margin-bottom:10px!important}',
      '.seguimiento-v2 .seguimiento-dato{padding:9px 11px!important;border-radius:11px!important;background:linear-gradient(180deg,#fff,#f8fafc)!important;min-height:70px!important}',
      '.seguimiento-v2 .seguimiento-dato span{font-size:.64rem!important;margin-bottom:3px!important;color:#718096!important}',
      '.seguimiento-v2 .seguimiento-dato strong{font-size:.82rem!important;line-height:1.28!important}',

      '.seguimiento-v2 .seguimiento-progress{margin:0 0 10px!important;padding:11px 13px!important;border-radius:14px!important;box-shadow:0 3px 12px rgba(30,55,90,.04)!important}',
      '.seguimiento-v2 .seguimiento-step{gap:8px!important}',
      '.seguimiento-v2 .seguimiento-step__number{width:30px!important;height:30px!important;flex-basis:30px!important;font-size:.8rem!important}',
      '.seguimiento-v2 .seguimiento-step span{font-size:.62rem!important}',
      '.seguimiento-v2 .seguimiento-step strong{font-size:.82rem!important;margin:1px 0!important}',
      '.seguimiento-v2 .seguimiento-step small{font-size:.68rem!important;line-height:1.2!important}',
      '.seguimiento-v2 .seguimiento-progress__line{background:linear-gradient(90deg,#b9dfca,#dbe3ec)!important}',

      '.seguimiento-v2 .seguimiento-section{padding:12px 14px!important;border-radius:14px!important;margin-top:9px!important}',
      '.seguimiento-v2 .seguimiento-section__head{margin-bottom:7px!important;align-items:center!important}',
      '.seguimiento-v2 .seguimiento-section__head span{font-size:.62rem!important}',
      '.seguimiento-v2 .seguimiento-section__head h3{font-size:.96rem!important;margin-top:1px!important}',
      '.seguimiento-v2 .seguimiento-section__head small{font-size:.7rem!important}',

      '.seguimiento-proposals-section{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}',
      '.seguimiento-proposals-section .seguimiento-section__head{grid-column:1/-1!important}',
      '.seguimiento-proposals-section .seguimiento-propuesta{padding:11px!important;border:1px solid #e3e8ef!important;border-radius:11px!important;background:#fbfcfe!important;min-width:0!important}',
      '.seguimiento-proposals-section .seguimiento-propuesta:first-of-type{padding-top:11px!important}',
      '.seguimiento-proposals-section .seguimiento-propuesta p{font-size:.82rem!important;line-height:1.35!important;margin:6px 0 0!important}',
      '.seguimiento-proposals-section .seguimiento-propuesta__meta{align-items:flex-start!important}',
      '.seguimiento-proposals-section .seguimiento-propuesta__meta>strong{font-size:.78rem!important}',
      '.seguimiento-propuesta.is-preferido{border-color:#b9cff1!important;background:#f7faff!important}',
      '.seguimiento-propuesta.is-coordinacion{border-color:#7ca8df!important;box-shadow:inset 0 0 0 1px rgba(50,105,175,.10)!important}',
      '.seguimiento-propuesta.is-final{border-color:#d8b23f!important;background:#fffaf0!important}',
      '.seguimiento-v2 .seguimiento-mini-tag{margin:2px 0 0 3px!important;padding:3px 6px!important;font-size:.59rem!important}',
      '.seguimiento-v2 .seguimiento-mini-tag.tag-preferido{background:#e8f0ff!important;color:#285a9f!important}',
      '.seguimiento-v2 .seguimiento-mini-tag.tag-coordinacion{background:#eaf4ff!important;color:#174f97!important}',
      '.seguimiento-v2 .seguimiento-mini-tag.tag-final{background:#fff0b8!important;color:#7b5b00!important}',

      '.seguimiento-selected-compact{padding:10px 13px!important;background:#f6f9fd!important;border-color:#c9d9ec!important}',
      '.seguimiento-selected-compact .seguimiento-title-text{font-size:.88rem!important;line-height:1.35!important;margin-top:2px!important}',
      '.seguimiento-v2 .seguimiento-note{padding:8px 10px!important;margin-top:6px!important;font-size:.8rem!important}',
      '.seguimiento-v2 .seguimiento-note p{margin-top:3px!important;line-height:1.35!important}',

      '.seguimiento-history-section .seguimiento-history{max-height:260px;overflow:auto;padding-right:4px}',
      '.seguimiento-v2 .seguimiento-history__item{padding:6px 0!important;gap:8px!important}',
      '.seguimiento-v2 .seguimiento-history__dot{width:8px!important;height:8px!important;margin-top:6px!important}',
      '.seguimiento-v2 .seguimiento-history__body{padding-bottom:7px!important}',
      '.seguimiento-v2 .seguimiento-history__top strong{font-size:.8rem!important}',
      '.seguimiento-v2 .seguimiento-history__top time{font-size:.64rem!important}',
      '.seguimiento-v2 .seguimiento-history__title,.seguimiento-v2 .seguimiento-history__obs{font-size:.76rem!important;line-height:1.3!important;margin-top:4px!important}',
      '.seguimiento-v2 .seguimiento-actions{margin-top:10px!important;gap:7px!important}',
      '.seguimiento-v2 .seguimiento-actions .btn{min-height:38px!important;padding:8px 14px!important;font-size:.78rem!important}',

      '@media(max-width:900px){.seguimiento-proposals-section{grid-template-columns:1fr!important}.seguimiento-v2{padding:14px!important}.seguimiento-final-hero{padding-left:52px!important}}',
      '@media(max-width:780px){.seguimiento-v2 .seguimiento-head{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:7px!important}.seguimiento-v2 .seguimiento-badge{margin-top:0!important}.seguimiento-v2 .seguimiento-progress{grid-template-columns:1fr!important;gap:7px!important}.seguimiento-v2 .seguimiento-progress__line{width:2px!important;height:11px!important;margin-left:14px!important}.seguimiento-v2 .seguimiento-student-grid{grid-template-columns:1fr 1fr!important}}',
      '@media(max-width:520px){.seguimiento-v2{padding:10px!important}.seguimiento-v2 .seguimiento-student-grid{grid-template-columns:1fr!important}.seguimiento-final-hero{padding:13px 13px 13px 50px!important}.seguimiento-final-hero__icon{left:12px!important}.seguimiento-v2 .seguimiento-actions .btn{width:100%!important}}'
    ].join('');
    document.head.appendChild(style);
  }
})();