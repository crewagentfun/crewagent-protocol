import { fmtUsd, fmtPrice, fmtPct, fmtInt, letter } from './format.js';
import { reduced } from './spring.js';
import { springIn } from './motion.js';

const LABELS = { loading: 'Connecting', live: 'Live feed', retry: 'Reconnecting', error: 'Feed offline', inert: 'Feed pending' };
const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// Count-up to a value; flash when an already shown value changes.
function setNum(node, value, fmt) {
  const prev = node._v;
  node._v = value;
  if (prev === value) return;
  if (!Number.isFinite(value)) {
    node.textContent = '\u2014';
    return;
  }
  const from = Number.isFinite(prev) ? prev : 0;
  if (reduced()) {
    node.textContent = fmt(value);
    return;
  }
  if (Number.isFinite(prev)) {
    node.classList.remove('flash');
    void node.offsetWidth;
    node.classList.add('flash');
    setTimeout(() => node.classList.remove('flash'), 60);
  }
  const t0 = performance.now();
  const dur = 700;
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    if (node._v !== value) return;
    node.textContent = fmt(from + (value - from) * e);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function setChange(node, value) {
  node.classList.toggle('up', value > 0);
  node.classList.toggle('down', value < 0);
  setNum(node, value, fmtPct);
}

function logo(row, size) {
  const holder = el('span', 'logo-slot');
  holder.style.display = 'contents';
  const tile = () => {
    const t = el('span', 'tile-letter', letter(row.symbol));
    if (size) {
      t.style.width = t.style.height = size + 'px';
      t.style.fontSize = Math.round(size * 0.42) + 'px';
    }
    return t;
  };
  if (!row.img) {
    holder.append(tile());
    return holder;
  }
  const img = new Image();
  img.className = 'logo';
  if (size) img.style.width = img.style.height = size + 'px';
  img.alt = '';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => holder.replaceChildren(tile());
  img.src = row.img;
  holder.append(img);
  return holder;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function flashCopy(btn, text, live) {
  copyText(text).then((ok) => {
    if (live) live.textContent = ok ? 'Copied' : 'Copy failed';
    if (!ok) return;
    btn.dataset.done = '1';
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      delete btn.dataset.done;
      if (live) live.textContent = '';
    }, 1600);
  });
}

export function createMarketView(live) {
  const rowsHost = $('[data-rows]');
  const board = $('[data-board]');
  const track = $('[data-ticker-track]');
  const err = $('[data-feed-error]');
  const map = new Map();
  let shown = false;

  const skeletonRows = () => {
    rowsHost.replaceChildren(
      ...Array.from({ length: 10 }, () => {
        const r = el('div', 'trow srow');
        r.setAttribute('role', 'row');
        r.append(el('span'), Object.assign(el('span', 'skel'), {}), el('span', 'skel'), el('span', 'skel'), el('span', 'skel'), el('span', 'skel'), el('span'));
        return r;
      })
    );
  };
  skeletonRows();

  function dashRows() {
    rowsHost.replaceChildren(
      ...Array.from({ length: 10 }, (_, i) => {
        const r = el('div', 'trow');
        r.setAttribute('role', 'row');
        const dashes = ['c-price', 'c-chg', 'c-vol', 'c-liq'].map((c) => el('span', 'num ' + c, '\u2014'));
        r.append(el('span', 'rank', String(i + 1)), el('span', 'token', '\u2014'), ...dashes, el('span', 'copycol'));
        return r;
      })
    );
  }

  function buildRow(row) {
    const r = el('div', 'trow');
    r.setAttribute('role', 'row');
    r.dataset.addr = row.address;
    const rank = el('span', 'rank');
    const token = el('span', 'token');
    const names = el('span', 'tname');
    names.append(el('b', '', row.symbol), el('small', '', row.name));
    token.append(logo(row), names);
    const price = el('span', 'num c-price');
    const chg = el('span', 'num c-chg');
    const vol = el('span', 'num c-vol');
    const liq = el('span', 'num c-liq');
    for (const n of [price, chg, vol, liq]) {
      const c = el('span', 'cell');
      n.append(c);
    }
    const col = el('span', 'copycol');
    const b = el('button', 'copy');
    b.type = 'button';
    b.setAttribute('aria-label', `Copy address for ${row.symbol}`);
    b.innerHTML = COPY_ICON;
    b.addEventListener('click', () => flashCopy(b, row.address, live));
    col.append(b);
    r.append(rank, token, price, chg, vol, liq, col);
    r._cells = { rank, price: price.firstChild, chg: chg.firstChild, vol: vol.firstChild, liq: liq.firstChild };
    return r;
  }

  function renderRows(rows) {
    const first = !shown;
    if (first) rowsHost.replaceChildren();
    const keep = new Set(rows.map((r) => r.address));
    for (const [k, node] of map) if (!keep.has(k)) (node.remove(), map.delete(k));
    rows.forEach((row, i) => {
      let node = map.get(row.address);
      const fresh = !node;
      if (fresh) {
        node = buildRow(row);
        map.set(row.address, node);
      }
      rowsHost.append(node);
      const c = node._cells;
      c.rank.textContent = String(i + 1);
      setNum(c.price, row.price, fmtPrice);
      setChange(c.chg, row.change);
      setNum(c.vol, row.volume, fmtUsd);
      setNum(c.liq, row.liquidity, fmtUsd);
      if (fresh) {
        if (!reduced()) node.style.opacity = '0';
        springIn(node, i * 60);
      }
    });
    shown = true;
  }

  function renderBoard(rows) {
    const top = rows.slice(0, 4);
    const frag = top.map((row) => {
      const li = el('li');
      const p = el('span', 'px');
      const c = el('span', 'px');
      li.append(logo(row, 32), el('span', 'sym', row.symbol), p, c);
      setNum(p, row.price, fmtPrice);
      setChange(c, row.change);
      if (!reduced()) li.style.opacity = '0';
      return li;
    });
    board.replaceChildren(...frag);
    frag.forEach((li, i) => springIn(li, i * 70));
  }

  function renderTicker(rows) {
    const build = (hidden) => {
      const frag = document.createDocumentFragment();
      for (const row of rows) {
        const it = el('span', 'ticker-item');
        const chg = el('span', 'chg', `${row.change > 0 ? '\u25B2 ' : row.change < 0 ? '\u25BC ' : ''}${fmtPct(row.change)}`);
        it.append(logo(row, 20), el('span', '', row.symbol), el('span', '', fmtPrice(row.price)), chg);
        if (hidden) it.setAttribute('aria-hidden', 'true');
        frag.append(it);
      }
      return frag;
    };
    track.replaceChildren(build(false), build(true));
  }

  function renderTiles(rows) {
    const pairs = $('[data-num="pairs"]');
    const vol = $('[data-num="volume"]');
    const mover = $('[data-mover]');
    setNum(pairs, rows.length, fmtInt);
    setNum(vol, rows.reduce((s, r) => s + (Number.isFinite(r.volume) ? r.volume : 0), 0), fmtUsd);
    const best = rows.filter((r) => Number.isFinite(r.change)).sort((a, b) => b.change - a.change)[0];
    mover.textContent = best ? `${best.symbol} ${best.change > 0 ? '+' : ''}${fmtPct(best.change)}` : '\u2014';
  }

  return function update({ status, rows }) {
    document.documentElement.dataset.feed = status === 'live' ? 'live' : status === 'retry' ? 'retry' : status === 'error' ? 'error' : status === 'inert' ? 'inert' : 'loading';
    document.querySelectorAll('[data-feed-label]').forEach((n) => (n.textContent = LABELS[status] || LABELS.loading));
    err.hidden = status !== 'error' && status !== 'retry';
    if (status === 'retry' && rows) err.textContent = 'Latest refresh failed. Showing the last good data while retrying.';
    else err.textContent = 'Market source unreachable. Retrying with backoff.';
    if (status === 'inert') {
      err.hidden = false;
      err.textContent = 'Market source is pending.';
      dashRows();
      return;
    }
    if (rows) {
      renderRows(rows);
      if (status === 'live') {
        renderBoard(rows);
        renderTicker(rows);
        renderTiles(rows);
      }
    } else if (status === 'error') {
      dashRows();
      shown = false;
      map.clear();
      board.replaceChildren(...Array.from({ length: 4 }, () => Object.assign(el('li'), { textContent: '\u2014' })));
    }
  };
}
