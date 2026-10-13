// Damped spring solver, semi-implicit Euler on a fixed sub-step for stability.
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Spring {
  constructor(value = 0, { stiffness = 170, damping = 22, mass = 1 } = {}) {
    this.x = value;
    this.v = 0;
    this.target = value;
    this.k = stiffness;
    this.c = damping;
    this.m = mass;
  }
  step(dt) {
    const h = 1 / 240;
    let t = Math.min(dt, 0.05);
    while (t > 0) {
      const s = Math.min(h, t);
      const a = (-this.k * (this.x - this.target) - this.c * this.v) / this.m;
      this.v += a * s;
      this.x += this.v * s;
      t -= s;
    }
    return this.settled();
  }
  settled() {
    return Math.abs(this.x - this.target) < 0.0005 && Math.abs(this.v) < 0.0005;
  }
}

// Run a spring 0 -> 1 after a delay; calls onFrame(progress) and onDone().
export function runSpring(onFrame, { delay = 0, ...opts } = {}) {
  if (reduced()) {
    onFrame(1);
    return;
  }
  const sp = new Spring(0, opts);
  sp.target = 1;
  let last = 0;
  const tick = (now) => {
    const dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    const done = sp.step(dt);
    onFrame(done ? 1 : sp.x);
    if (!done) requestAnimationFrame(tick);
  };
  setTimeout(() => requestAnimationFrame(tick), delay);
}
