// Market source. Reads ONLY the market register record: no other record can influence it.
const POLL_MS = 60000;
const BASE_MS = 2000;
const CAP_MS = 60000;
const TIMEOUT_MS = 12000;

async function getJson(url, signal) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  signal.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error('http ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

export function normalise(pairs, wanted) {
  const best = new Map();
  for (const p of Array.isArray(pairs) ? pairs : []) {
    if (!p || p.chainId !== 'solana' || !p.baseToken) continue;
    const addr = p.baseToken.address;
    if (!wanted.has(addr)) continue;
    const liq = num(p.liquidity && p.liquidity.usd);
    const cur = best.get(addr);
    if (!cur || (Number.isFinite(liq) ? liq : -1) > cur.liqScore) {
      best.set(addr, {
        address: addr,
        symbol: String(p.baseToken.symbol || '?'),
        name: String(p.baseToken.name || p.baseToken.symbol || '?'),
        img: p.info && typeof p.info.imageUrl === 'string' && p.info.imageUrl.startsWith('https://') ? p.info.imageUrl : '',
        price: num(p.priceUsd),
        change: num(p.priceChange && p.priceChange.h24),
        volume: num(p.volume && p.volume.h24),
        liquidity: Number.isFinite(liq) ? liq : NaN,
        liqScore: Number.isFinite(liq) ? liq : -1,
      });
    }
  }
  return [...best.values()]
    .sort((a, b) => (Number.isFinite(b.volume) ? b.volume : -1) - (Number.isFinite(a.volume) ? a.volume : -1))
    .slice(0, 10);
}

export function createMarket(record, emit) {
  const live = record && record.state === 'stated' && record.endpoints;
  let timer = 0;
  let failures = 0;
  let ctl = null;
  let data = null;
  let stopped = false;

  const clear = () => {
    clearTimeout(timer);
    timer = 0;
  };

  async function once() {
    ctl = new AbortController();
    const { signal } = ctl;
    try {
      const boosts = await getJson(record.endpoints.boosts, signal);
      const addrs = [
        ...new Set((Array.isArray(boosts) ? boosts : []).filter((b) => b && b.chainId === 'solana' && b.tokenAddress).map((b) => b.tokenAddress)),
      ].slice(0, 30);
      if (!addrs.length) throw new Error('no solana entries');
      const pairs = await getJson(record.endpoints.pairs.replace('{addresses}', addrs.map(encodeURIComponent).join(',')), signal);
      const rows = normalise(pairs, new Set(addrs));
      if (!rows.length) throw new Error('no pairs');
      data = rows;
      failures = 0;
      emit({ status: 'live', rows: data });
      schedule(POLL_MS);
    } catch (err) {
      if (signal.aborted && document.hidden) return;
      failures += 1;
      emit({ status: data ? 'retry' : 'error', rows: data });
      schedule(Math.min(CAP_MS, BASE_MS * 2 ** (failures - 1)) * (0.85 + Math.random() * 0.3));
    }
  }

  function schedule(ms) {
    clear();
    if (stopped || document.hidden) return;
    timer = setTimeout(once, ms);
  }

  function onVis() {
    if (document.hidden) {
      clear();
      if (ctl) ctl.abort();
    } else if (!stopped) {
      clear();
      once();
    }
  }

  return {
    start() {
      if (!live) {
        emit({ status: 'inert', rows: null });
        return;
      }
      document.addEventListener('visibilitychange', onVis);
      if (!document.hidden) once();
    },
    stop() {
      stopped = true;
      clear();
      if (ctl) ctl.abort();
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}
