import { Spring, runSpring, reduced } from './spring.js';

export function springIn(el, delay = 0) {
  if (el.dataset.sprung) return;
  el.dataset.sprung = '1';
  runSpring(
    (p) => {
      el.style.opacity = String(Math.min(1, Math.max(0, p * 1.4)));
      el.style.transform = `translate3d(0,${(1 - p) * 28}px,0) scale(${0.97 + 0.03 * p})`;
      if (p >= 1) {
        el.style.transform = '';
        el.style.opacity = '';
        el.classList.add('in');
      }
    },
    { delay, stiffness: 190, damping: 20 }
  );
}

// Scroll reveal with stagger inside a shared parent.
export function initReveal(root = document) {
  const els = [...root.querySelectorAll('[data-reveal]:not(.in)')];
  if (reduced() || !('IntersectionObserver' in window)) {
    els.forEach((e) => e.classList.add('in'));
    return;
  }
  const seen = new Map();
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        const parent = en.target.parentElement;
        const n = seen.get(parent) || 0;
        seen.set(parent, n + 1);
        setTimeout(() => seen.set(parent, Math.max(0, (seen.get(parent) || 1) - 1)), 400);
        springIn(en.target, n * 70);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );
  els.forEach((e) => io.observe(e));
}

export function initProgress() {
  const bar = document.querySelector('[data-progress]');
  if (!bar) return;
  const sp = new Spring(0, { stiffness: 260, damping: 30 });
  let running = false;
  let last = 0;
  const read = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    return h > 0 ? Math.min(1, Math.max(0, scrollY / h)) : 0;
  };
  const tick = (now) => {
    const dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    const done = sp.step(dt);
    bar.style.transform = `scaleX(${sp.x})`;
    if (done) {
      running = false;
      last = 0;
    } else requestAnimationFrame(tick);
  };
  const go = () => {
    sp.target = read();
    if (reduced()) {
      sp.x = sp.target;
      bar.style.transform = `scaleX(${sp.x})`;
      return;
    }
    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  };
  addEventListener('scroll', go, { passive: true });
  addEventListener('resize', go);
  go();
}

export function initParallax() {
  const hero = document.querySelector('.hero');
  const layers = [...document.querySelectorAll('.layer')];
  if (!hero || !layers.length || reduced()) return;
  const px = new Spring(0, { stiffness: 90, damping: 16 });
  const py = new Spring(0, { stiffness: 90, damping: 16 });
  const sy = new Spring(0, { stiffness: 120, damping: 20 });
  let running = false;
  let last = 0;
  let visible = true;
  const apply = () => {
    for (const l of layers) {
      const d = parseFloat(l.dataset.depth || '1');
      l.style.transform = `translate3d(${px.x * d * 18}px,${py.x * d * 14 + sy.x * d * -40}px,0)`;
    }
  };
  const tick = (now) => {
    const dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    const a = px.step(dt);
    const b = py.step(dt);
    const c = sy.step(dt);
    apply();
    if (a && b && c) {
      running = false;
      last = 0;
    } else requestAnimationFrame(tick);
  };
  const kick = () => {
    if (!running && visible) {
      running = true;
      requestAnimationFrame(tick);
    }
  };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    px.target = ((e.clientX - r.left) / r.width - 0.5) * 2;
    py.target = ((e.clientY - r.top) / r.height - 0.5) * 2;
    kick();
  });
  hero.addEventListener('pointerleave', () => {
    px.target = 0;
    py.target = 0;
    kick();
  });
  addEventListener(
    'scroll',
    () => {
      const r = hero.getBoundingClientRect();
      sy.target = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
      kick();
    },
    { passive: true }
  );
  new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    if (visible) kick();
  }).observe(hero);
}

// Pointer-following spotlight for every .spot element and table row.
export function initSpotlight() {
  if (reduced()) return;
  document.addEventListener(
    'pointermove',
    (e) => {
      const t = e.target instanceof Element ? e.target.closest('.spot, .tbody .trow') : null;
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', `${e.clientX - r.left}px`);
      t.style.setProperty('--my', `${e.clientY - r.top}px`);
    },
    { passive: true }
  );
}

export function initHeaderOffset() {
  const top = document.querySelector('[data-top]');
  if (!top) return;
  const set = () => document.documentElement.style.setProperty('--hdr', `${Math.ceil(top.getBoundingClientRect().height)}px`);
  new ResizeObserver(set).observe(top);
  set();
}

export function initRailSpy() {
  const links = [...document.querySelectorAll('[data-nav]')];
  const secs = links.map((l) => document.querySelector(`[data-section="${l.dataset.nav}"]`)).filter(Boolean);
  if (!secs.length) return;
  const io = new IntersectionObserver(
    (es) => {
      for (const en of es) {
        if (!en.isIntersecting) continue;
        links.forEach((l) => l.classList.toggle('active', l.dataset.nav === en.target.dataset.section));
      }
    },
    { rootMargin: '-35% 0px -55% 0px' }
  );
  secs.forEach((s) => io.observe(s));
}
