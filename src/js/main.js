import { renderCa } from './views.js';
import { createMarket } from './market.js';
import { createMarketView, flashCopy } from './marketView.js';
import { initReveal, initProgress, initParallax, initSpotlight, initHeaderOffset, initRailSpy } from './motion.js';

const register = JSON.parse(document.getElementById('register').textContent);
const recs = register.records;

initHeaderOffset();
initProgress();
initParallax();
initSpotlight();
initRailSpy();
initReveal();

// Contract slot: click to copy, with feedback. Inert until a stated record exists.
const caHost = document.querySelector('.ca-wrap');
if (caHost && !caHost.querySelector('[data-state="stated"]') && recs.ca && recs.ca.state === 'stated') caHost.innerHTML = renderCa(recs.ca);
const caBtn = document.querySelector('.ca-copy');
if (caBtn) {
  const live = document.querySelector('[data-copy-live]');
  const hint = caBtn.querySelector('[data-copy-hint]');
  caBtn.addEventListener('click', () => {
    flashCopy(caBtn, caBtn.dataset.copy, live);
    if (hint) {
      hint.textContent = 'Copied';
      clearTimeout(caBtn._h);
      caBtn._h = setTimeout(() => (hint.textContent = 'Copy'), 1600);
    }
  });
}

// Crew tabs.
const tabs = [...document.querySelectorAll('.crew-tab')];
const panels = [...document.querySelectorAll('.crew-panel')];
function pick(i, focus) {
  tabs.forEach((t, n) => {
    t.setAttribute('aria-selected', String(n === i));
    t.tabIndex = n === i ? 0 : -1;
  });
  panels.forEach((p, n) => {
    p.hidden = n !== i;
    p.classList.remove('enter');
    if (n === i) {
      void p.offsetWidth;
      p.classList.add('enter');
    }
  });
  if (focus) tabs[i].focus();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => pick(i));
  t.addEventListener('keydown', (e) => {
    const k = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (k) {
      e.preventDefault();
      pick((i + k + tabs.length) % tabs.length, true);
    } else if (e.key === 'Home') pick(0, true);
    else if (e.key === 'End') pick(tabs.length - 1, true);
  });
});
if (tabs.length) pick(0);

// Market follows its own register record only.
const liveRegion = Object.assign(document.createElement('span'), { className: 'sr-only' });
liveRegion.setAttribute('role', 'status');
document.body.append(liveRegion);
const update = createMarketView(liveRegion);
update({ status: 'loading', rows: null });
createMarket(recs.market, update).start();
