import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { ROOT, SRC, DIST, read, loadRegister, buildHtml, resolveToken, GLYPH_D } from './lib.mjs';
import { validateRegister, renderCa, renderSocial, BASE58, deriveHandle } from '../src/js/views.js';
import { normalise, createMarket } from '../src/js/market.js';

const results = [];
const gate = (name, fn) => {
  try {
    const out = fn();
    results.push({ name, ok: true, note: typeof out === 'string' ? out : '' });
  } catch (e) {
    results.push({ name, ok: false, note: e.message });
  }
};
const ok = (c, m) => {
  if (!c) throw new Error(m);
};

const walk = (dir, skip = []) => {
  const out = [];
  for (const n of readdirSync(dir)) {
    if (skip.includes(n)) continue;
    const p = join(dir, n);
    statSync(p).isDirectory() ? out.push(...walk(p, skip)) : out.push(p);
  }
  return out;
};
const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.md', '']);
const distFiles = existsSync(DIST) ? walk(DIST) : [];
const dist = (rel) => read(join(DIST, rel));

const reg = loadRegister();
const R = reg.records;
const html = existsSync(join(DIST, 'index.html')) ? dist('index.html') : '';
const distText = distFiles.filter((f) => TEXT.has(extname(f))).map((f) => ({ f: relative(DIST, f).replace(/\\/g, '/'), s: read(f) }));

// ---- forced-state variants: state independent, current record is read at runtime ----
const randomB58 = () => {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  return Array.from(randomBytes(44), (b) => A[b % A.length]).join('');
};
function variant(base, key, state) {
  const copy = JSON.parse(JSON.stringify(base));
  const r = copy.records[key];
  for (const f of ['value', 'url', 'rpc', 'endpoints', 'handle']) delete r[f];
  r.state = state;
  if (state === 'stated') {
    if (key === 'ca') r.value = randomB58();
    else if (key === 'x') r.url = 'https://x.com/crewagent_probe';
    else if (key === 'github') r.url = 'https://github.com/crewagent-probe/site';
    else r.value = 'probe';
  }
  return copy;
}
const both = ['stated', 'absent'];

// ---- address scanner: match address-shaped strings to the stated registry ----
const B58G = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z])/g;
const HEX0X = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
function scanAddresses(page, register) {
  const body = page.replace(/<!--ca:start-->[\s\S]*?<!--ca:end-->/g, ''); // CA slot is exempt
  const stated = new Set();
  for (const [k, r] of Object.entries(register.records)) {
    if (r.state !== 'stated') continue;
    for (const f of ['value', 'url']) if (r[f]) stated.add(String(r[f]));
  }
  const stray = [];
  for (const m of [...body.matchAll(B58G), ...body.matchAll(HEX0X)]) {
    const s = m[0];
    if (![...stated].some((v) => v === s || v.includes(s))) stray.push(s);
  }
  return stray;
}

// ================= gates =================
gate('01 register is valid (states, labels, inert records carry no value/url)', () => {
  const e = validateRegister(reg);
  ok(!e.length, e.join('; '));
  return `${Object.keys(R).length} records`;
});

gate('02 register keeps dates as data; shipped copy has none', () => {
  ok(Object.values(R).some((r) => Object.keys(r).some((k) => /On$/.test(k))), 'register.json lost its date data');
  ok(!/On"/.test(html.match(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/)?.[1] || ''), 'dates leaked into shipped register');
});

gate('03 dist contains the deploy set and nothing from the repo root', () => {
  for (const f of ['index.html', 'favicon.svg', 'assets/main.css', 'assets/tokens.css', 'assets/main.js', 'assets/inter.woff2']) ok(existsSync(join(DIST, f)), 'missing dist/' + f);
  for (const f of ['README.md', 'LICENSE', 'whitepaper.md', 'register.json']) ok(!distFiles.some((x) => x.endsWith(f)), f + ' must not be in dist');
});

gate('04 dist is in sync with a fresh build of src', () => {
  ok(buildHtml(reg) === html, 'dist/index.html differs from buildHtml(register); run npm run build');
});

gate('05 LINK RULE: hrefs exist only for stated records (current state)', () => {
  const urls = new Set(Object.values(R).filter((r) => r.state === 'stated' && r.url).map((r) => r.url));
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).filter((h) => /^https?:/.test(h));
  for (const h of hrefs) ok(urls.has(h), 'href without stated record: ' + h);
  for (const k of ['x', 'github']) {
    const stated = R[k].state === 'stated';
    const tag = html.match(new RegExp(`<(?:a|span) class="social[^"]*" data-social="${k}"[^>]*>`))?.[0] || '';
    ok(tag, `${k} icon missing`);
    ok(stated ? /^<a /.test(tag) && tag.includes('href=') : !tag.includes('href=') && tag.includes('aria-disabled="true"'), `${k} wrong branch for state ${R[k].state}`);
  }
});

gate('06 social icons: both present, official marks, header position', () => {
  ok((html.match(/data-social="x"/g) || []).length === 1 && (html.match(/data-social="github"/g) || []).length === 1, 'icons must appear once each');
  ok(html.includes('M18.244 2.25h3.308l-7.227 8.26'), 'official X mark missing');
  ok(html.includes('M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59'), 'official Octicon missing');
  const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] || '';
  ok(header.includes('class="socials"'), 'socials not in header');
  const css = dist('assets/main.css');
  ok(!/\.socials\s*\{[^}]*display\s*:\s*none/.test(css) && !/\.social[^{]*\{[^}]*display\s*:\s*none/.test(css), 'social icon hidden at some breakpoint');
  ok(!/<span class="social[^"]*"[^>]*>[^<]*[A-Za-z]{2,}[^<]*<svg/.test(html), 'text label next to icon');
});

gate('07 CA slot sits in the header, large, full address, inert when absent', () => {
  const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] || '';
  ok(header.includes('data-slot="ca"'), 'CA slot not in header');
  const css = dist('assets/main.css');
  const px = css.replace(/\s+/g, '').match(/\.ca-value\{[^}]*font-size:clamp\((\d+)px,[^,]+,(\d+)px\)/);
  ok(px && Number(px[1]) >= 16 && Number(px[2]) >= 20, 'CA value font is not large enough');
  ok(/\.ca-value\{[^}]*overflow-wrap:anywhere/.test(css.replace(/\s+/g, '')), 'CA value must wrap, never truncate');
  const st = R.ca.state;
  ok(header.includes(st === 'stated' ? 'data-state="stated"' : 'data-state="inert"'), 'CA branch does not match record');
});

gate('08 MUTATION: CA both branches (state-independent)', () => {
  for (const s of both) {
    const v = variant(reg, 'ca', s);
    ok(!validateRegister(v).length, 'variant invalid for ' + s);
    const page = buildHtml(v);
    const slot = page.match(/<!--ca:start-->[\s\S]*?<!--ca:end-->/)[0];
    if (s === 'stated') {
      const a = v.records.ca.value;
      ok(slot.includes(`data-copy="${a}"`) && slot.includes(`>${a}<`), 'stated: full address / copy hook missing');
      ok(slot.includes('data-copy-hint') && slot.includes('role="status"'), 'stated: copy feedback missing');
    } else {
      ok(slot.includes('pending') && !slot.includes('data-copy=') && !slot.includes('<button'), 'absent: slot must be inert');
      ok(!BASE58.test(slot.replace(/<[^>]+>/g, '')), 'absent: slot carries an address');
    }
  }
  return 'stated + absent proven';
});

gate('09 MUTATION: X and GitHub both branches (state-independent)', () => {
  for (const k of ['x', 'github']) {
    for (const s of both) {
      const v = variant(reg, k, s);
      const out = renderSocial(k, v.records[k]);
      if (s === 'stated') {
        ok(/^<a /.test(out) && out.includes(`href="${v.records[k].url}"`) && out.includes('rel="noopener noreferrer"'), `${k} stated: link missing`);
        ok(out.includes(deriveHandle(k, v.records[k].url)), `${k} stated: handle not derived from url`);
      } else {
        ok(!out.includes('href') && out.includes('aria-disabled="true"') && out.includes('<svg'), `${k} absent: must be inert icon`);
      }
    }
    for (const s of ['unconfirmed']) {
      const v = variant(reg, k, s);
      ok(!renderSocial(k, v.records[k]).includes('href'), `${k} unconfirmed must be inert`);
    }
  }
  return 'x, github x stated/absent/unconfirmed';
});

gate('10 MUTATION: inert records cannot smuggle a value or url', () => {
  for (const k of Object.keys(R)) {
    for (const s of ['absent', 'unconfirmed']) {
      const v = variant(reg, k, s);
      ok(!validateRegister(v).length, `${k}/${s} variant should validate`);
      v.records[k].value = 'x';
      ok(validateRegister(v).length > 0, `${k}/${s}: value on inert record was accepted`);
      delete v.records[k].value;
      v.records[k].url = 'https://example.com';
      ok(validateRegister(v).length > 0, `${k}/${s}: url on inert record was accepted`);
    }
  }
});

gate('11 MUTATION: inert chips show label + "pending" only', () => {
  for (const k of ['ca', 'x', 'github', 'supply', 'holders']) {
    const page = buildHtml(variant(reg, k, 'absent'));
    const chip = page.match(/<li class="chip inert"[^>]*><span class="chip-label">([^<]*)<\/span><span class="chip-value">([^<]*)<\/span><\/li>/g) || [];
    ok(chip.some((c) => c.includes('>pending<')), `${k}: inert chip missing`);
  }
});

gate('12 GATE WARNING: scanner matches address-shaped strings to the stated registry', () => {
  ok(scanAddresses(html, reg).length === 0, 'stray address in dist: ' + scanAddresses(html, reg).join(','));
  const hex = '0x' + randomBytes(20).toString('hex');
  const b58 = randomB58();
  ok(scanAddresses(`<p>${hex}</p>`, reg).length >= 1, 'unknown 0x address not caught');
  ok(scanAddresses(`<p>${b58}</p>`, reg).length >= 1, 'unknown base58 address not caught');
  const withHex = variant(reg, 'chain', 'stated');
  withHex.records.chain.value = hex;
  ok(scanAddresses(`<p>${hex}</p>`, withHex).length === 0, '0x hex that matches a stated record was blanket-rejected');
  const withB58 = variant(reg, 'chain', 'stated');
  withB58.records.chain.value = b58;
  ok(scanAddresses(`<p>${b58}</p>`, withB58).length === 0, 'base58 matching a stated record was rejected');
  const v = variant(reg, 'ca', 'stated');
  ok(scanAddresses(buildHtml(v), v).length === 0, 'CA address must be exempt from the scanner');
  const inJson = buildHtml(v).includes(v.records.ca.value);
  ok(inJson, 'CA value should be present in the stated branch');
  return 'hex + base58 + CA exemption';
});

gate('13 MARKET INDEPENDENCE: CA state has zero effect on market', () => {
  const pick = (page) => JSON.parse(page.match(/<script type="application\/json" id="register">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, '<')).records.market;
  const a = pick(buildHtml(variant(reg, 'ca', 'stated')));
  const b = pick(buildHtml(variant(reg, 'ca', 'absent')));
  ok(JSON.stringify(a) === JSON.stringify(b), 'market record changed with CA state');
  for (const f of ['market.js', 'marketView.js']) {
    const s = read(join(SRC, 'js', f));
    ok(!/records\.ca|recs\.ca|\bcontract\b|renderCa|views\.js/i.test(s), f + ' references CA');
  }
  ok(/createMarket\(recs\.market,/.test(read(join(SRC, 'js', 'main.js'))), 'market must be wired from recs.market only');
  ok(R.market.state === 'stated' && R.market.endpoints.boosts.includes('token-boosts/top/v1'), 'market record not stated');
});

gate('14 MARKET LOGIC: solana filter, top 10 by 24h volume, best pair, logo fallback input', () => {
  const mk = (i, over = {}) => ({ chainId: 'solana', baseToken: { address: 'A' + i, symbol: 'S' + i, name: 'N' + i }, priceUsd: '1', liquidity: { usd: 10 }, volume: { h24: i * 100 }, priceChange: { h24: 1 }, info: { imageUrl: 'https://x/i.png' }, ...over });
  const pairs = Array.from({ length: 14 }, (_, i) => mk(i + 1));
  pairs.push(mk(3, { liquidity: { usd: 9999 }, volume: { h24: 1 } }));
  pairs.push(mk(99, { chainId: 'ethereum' }));
  pairs.push(mk(2, { info: undefined }));
  const wanted = new Set(pairs.map((p) => p.baseToken.address));
  const out = normalise(pairs, wanted);
  ok(out.length === 10, 'must keep exactly 10, got ' + out.length);
  ok(out.every((r, i, a) => !i || a[i - 1].volume >= r.volume), 'not sorted by 24h volume');
  ok(!out.some((r) => r.address === 'A99'), 'non-solana pair leaked');
  const noLogo = normalise([mk(1, { info: { imageUrl: 'http://insecure/x.png' } })], new Set(['A1']));
  ok(noLogo[0].img === '', 'insecure logo url must be dropped for letter tile');
  const none = normalise([mk(1, { info: undefined })], new Set(['A1']));
  ok(none[0].img === '', 'missing logo must yield empty img');
});

gate('15 MARKET BEHAVIOUR: backoff, last-good kept, 60s poll, hidden pause, immediate resume', async () => {});
await (async () => {
  const idx = results.length - 1;
  try {
    const timers = [];
    const g = globalThis;
    const real = { setTimeout: g.setTimeout, clearTimeout: g.clearTimeout, fetch: g.fetch, document: g.document };
    let hidden = false;
    const listeners = {};
    g.document = { get hidden() { return hidden; }, addEventListener: (t, f) => (listeners[t] = f), removeEventListener() {} };
    g.setTimeout = (fn, ms) => (timers.push({ fn, ms }), timers.length);
    g.clearTimeout = () => {};
    let mode = 'fail';
    const fixture = { chainId: 'solana', baseToken: { address: 'AAA', symbol: 'A', name: 'A' }, priceUsd: '1', liquidity: { usd: 1 }, volume: { h24: 1 }, priceChange: { h24: 1 } };
    g.fetch = async (url) => {
      if (mode === 'fail') throw new Error('down');
      if (url.includes('token-boosts')) return { ok: true, json: async () => [{ chainId: 'solana', tokenAddress: 'AAA' }, { chainId: 'base', tokenAddress: 'BBB' }] };
      if (!url.endsWith('/AAA')) throw new Error('non-solana address requested: ' + url);
      return { ok: true, json: async () => [fixture] };
    };
    const events = [];
    const m = createMarket(R.market, (e) => events.push(e));
    m.start();
    await new Promise((r) => real.setTimeout(r, 20));
    const fails = [];
    // drive failures and read delays
    for (let i = 0; i < 8; i++) {
      const t = timers.length ? timers.pop() : null;
      if (t) {
        fails.push(t.ms);
        t.fn();
        await new Promise((r) => real.setTimeout(r, 10));
      }
    }
    ok(events[0].status === 'error' && events[0].rows === null, 'first failure must report error without rows');
    mode = 'ok';
    const pending = timers.pop();
    pending.fn();
    await new Promise((r) => real.setTimeout(r, 20));
    const live = events.at(-1);
    ok(live.status === 'live' && live.rows.length === 1, 'recovery must publish live rows');
    ok(timers.at(-1).ms === 60000, 'poll interval must be 60000ms, got ' + timers.at(-1).ms);
    mode = 'fail';
    timers.pop().fn();
    await new Promise((r) => real.setTimeout(r, 10));
    const kept = events.at(-1);
    ok(kept.status === 'retry' && kept.rows && kept.rows.length === 1, 'last good data must be kept on failed refresh');
    ok(Math.max(...fails) <= 60000 * 1.15 && fails.length >= 2 && fails[1] > fails[0] * 1.3, 'backoff must grow exponentially: ' + fails.join(','));
    hidden = true;
    listeners.visibilitychange();
    hidden = false;
    mode = 'ok';
    const before = events.length;
    listeners.visibilitychange();
    await new Promise((r) => real.setTimeout(r, 20));
    ok(events.length > before, 'visible must fetch immediately');
    m.stop();
    Object.assign(g, real);
    results[idx] = { name: results[idx].name, ok: true, note: 'delays ' + fails.map(Math.round).join(',') };
  } catch (e) {
    results[idx] = { name: results[idx].name, ok: false, note: e.message };
  }
})();

gate('16 NO DATES: no dates, timestamps, clocks or "as of" anywhere shipped', () => {
  const rx = [
    [/\b\d{4}-\d{2}-\d{2}\b/, 'iso date'],
    [/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, 'numeric date'],
    [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i, 'month day'],
    [/\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/i, 'clock string'],
    [/\b(as of|checked|last updated|updated|last sync|timestamp|ago)\b/i, 'time wording'],
  ];
  for (const { f, s } of distText) {
    const t = f.endsWith('.css') ? s.replace(/\/\*[\s\S]*?\*\//g, '') : s;
    for (const [r, n] of rx) {
      if (f.endsWith('.css') && n === 'clock string') continue;
      const m = t.match(r);
      ok(!m, `${f}: ${n} "${m && m[0]}"`);
    }
    if (f.endsWith('.js')) ok(!/new Date|Date\.now|toLocale(Time|Date)String|DateTimeFormat|RelativeTimeFormat/.test(s), f + ' touches Date APIs');
  }
  const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
  ok(!/\b(19|20)\d{2}\b/.test(visible), 'a year appears in the page');
});

const PALETTE = JSON.parse(read(join(SRC, 'brand', 'palette.json')));
const TRACE = JSON.parse(read(join(SRC, 'brand', 'trace.json')));
const brandHex = new Set(Object.values(PALETTE.tokens).map((t) => t.hex));

gate('17 PALETTE: every literal comes from brand/ pixels, lives in tokens.css only', () => {
  const tokens = read(join(SRC, 'css', 'tokens.css')).replace(/\/\*[\s\S]*?\*\//g, '');
  const hexes = [...tokens.matchAll(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b/g)].map((m) => m[1].toLowerCase());
  ok(hexes.length > 15, 'tokens file has no ramp');
  for (const h of hexes) {
    const base = '#' + h.slice(0, 6);
    ok(h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6), 'hex is not achromatic: #' + h);
    ok(brandHex.has(base), `#${h} is not a measured brand level`);
  }
  ok(!/\b(oklch|oklab|rgba?|hsla?|hwb|lab|lch|color)\(/.test(tokens), 'non-hex literal in tokens');
  for (const [name, t] of Object.entries(PALETTE.tokens)) ok(t.pngPixels > 0 && t.jpegPixels > 0 || t.level === 0 || t.level === 255, `${name} lacks provenance`);
  const named = /(?<![\w-])(red|blue|green|yellow|orange|purple|pink|brown|cyan|magenta|teal|navy|gold|violet|indigo|crimson|lime|olive|maroon|coral|salmon|turquoise|silver|beige|ivory|tan|gray|grey|white|black)(?![\w-])/i;
  const scan = (label, text, css) => {
    const t = css ? text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"/g, '""') : text;
    ok(!/#[0-9a-fA-F]{3,8}\b/.test(css ? t : t.replace(/&#\w+;|href="#[^"]*"|"#[^"]*"|'#[^']*'/g, '')), `${label}: hex literal outside tokens`);
    ok(!/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/.test(t), `${label}: color literal outside tokens`);
    if (css) ok(!named.test(t.replace(/font-family:[^;]*;/g, '').replace(/url\([^)]*\)/g, '')), `${label}: named color`);
  };
  scan('src/main.css', read(join(SRC, 'css', 'main.css')), true);
  for (const f of readdirSync(join(SRC, 'js'))) scan('src/js/' + f, read(join(SRC, 'js', f)), false);
  scan('src/index.template.html', read(join(SRC, 'index.template.html')), false);
  for (const { f, s } of distText) {
    if (f === 'assets/tokens.css' || f === 'favicon.svg') continue;
    if (f === 'index.html') scan(f, s.replace(/<script type="application\/json"[\s\S]*?<\/script>/, ''), false);
    else if (f.endsWith('.css')) scan('dist/' + f, s, true);
    else if (f.endsWith('.js')) scan('dist/' + f, s, false);
  }
  ok(read(join(SRC, 'css', 'tokens.css')) === dist('assets/tokens.css'), 'dist tokens differ from src');
  return `${hexes.length} literals, all on brand levels`;
});

gate('18 FAVICON: SVG 32x32 traced from the logo pixel grid', () => {
  const s = dist('favicon.svg');
  ok(/viewBox="0 0 32 32"/.test(s) && /width="32"/.test(s) && /height="32"/.test(s), 'not 32x32');
  const tokens = read(join(SRC, 'css', 'tokens.css'));
  ok(s.includes(`<rect width="32" height="32" fill="${resolveToken(tokens, '--bg')}"/>`) && s.includes(`fill="${resolveToken(tokens, '--fg')}"`), 'favicon colors do not come from tokens');
  ok(s.includes(`d="${GLYPH_D}"`), 'favicon path differs from the traced glyph');
  // Rebuild the shapes from the shipped path data and compare with the real pixel grid.
  const num = (str) => str.match(/-?\d*\.?\d+/g).map(Number);
  const parts = GLYPH_D.split(/(?=M)/);
  ok(parts.length === 3, 'glyph must be two rings and a shoulder arc');
  const ring = (p) => { const n = num(p); return { cx: n[0] + n[2], cy: n[1], r: n[2] }; };
  const ho = ring(parts[0]);
  const hi = ring(parts[1]);
  const sn = num(parts[2]);
  const [x0, cut, ro, , , , , x1] = sn;
  const cxs = (x0 + x1) / 2;
  const cys = cut + Math.sqrt(Math.max(0, ro * ro - ((x1 - x0) / 2) ** 2));
  const ri = sn[11];
  let diff = 0;
  for (let gy = 0; gy < 32; gy++) {
    for (let gx = 0; gx < 32; gx++) {
      let cov = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const x = gx + (sx + 0.5) / 4;
        const y = gy + (sy + 0.5) / 4;
        const dh = Math.hypot(x - ho.cx, y - ho.cy);
        const ds = Math.hypot(x - cxs, y - cys);
        if ((dh <= ho.r && dh >= hi.r) || (ds <= ro && ds >= ri && y <= cut)) cov += 1 / 16;
      }
      diff += Math.abs(cov - Number(TRACE.grid32[gy][gx]) / 9);
    }
  }
  const mean = diff / 1024;
  ok(mean < 0.02, 'favicon deviates from the real pixel grid: mean error ' + mean.toFixed(4));
  return `mean pixel error ${mean.toFixed(4)}`;
});


gate('19 NO ch UNITS anywhere shipped', () => {
  for (const { f, s } of distText) ok(!/(^|[^\w.])\d*\.?\d+ch\b/.test(f.endsWith('.json') ? '' : s.replace(/"[^"]*"/g, (q) => (/\d+ch\b/.test(q) ? q : ''))), f + ' uses ch units');
});

gate('20 TAP TARGETS: 44px token wired into every control', () => {
  const css = read(join(SRC, 'css', 'main.css'));
  ok(/--tap:44px/.test(css), '--tap token missing');
  for (const sel of ['.social', '.ca-copy', '.copy', '.btn', '.rail-link', '.crew-tab', '.chip', '.ticker-item', '.brand']) {
    const m = css.match(new RegExp('(^|\\n|\\})\\s*' + sel.replace('.', '\\.') + '\\{[^}]*\\}'));
    ok(m && /(min-)?(width|height):(var\(--tap\)|(4[4-9]|[5-9]\d)px)/.test(m[0]), sel + ' lacks a 44px floor');
  }
});

gate('21 MOTION: reduced-motion fallback covers CSS and JS', () => {
  const css = read(join(SRC, 'css', 'main.css'));
  const block = css.match(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*\n\}/)?.[0] || '';
  ok(/animation:none!important/.test(block) && /transition:none!important/.test(block), 'CSS reduced-motion block missing');
  ok(/reduced\(\)/.test(read(join(SRC, 'js', 'spring.js'))) && /reduced\(\)/.test(read(join(SRC, 'js', 'motion.js'))) && /reduced\(\)/.test(read(join(SRC, 'js', 'marketView.js'))), 'JS paths ignore reduced motion');
  const mo = read(join(SRC, 'js', 'motion.js'));
  ok(/initParallax[\s\S]*?reduced\(\)\) return/.test(mo) && /initSpotlight\(\) \{\s*if \(reduced\(\)\) return/.test(mo), 'parallax/spotlight not disabled');
});

gate('22 SPEC FEATURES present: progress bar, spring solver, count-up+flash, spotlight, pulse dot, skeletons, mesh, parallax, ticker', () => {
  ok(html.includes('data-progress') && html.includes('class="mesh"') && html.includes('data-depth') && html.includes('data-ticker'), 'markup hooks missing');
  const css = read(join(SRC, 'css', 'main.css'));
  for (const k of ['@keyframes ping', '@keyframes pulse', '@keyframes shimmer', '@keyframes mesh-drift', '@keyframes screen-ticker', '.spot::before', '.flash', 'position:fixed;inset:0 0 auto 0;height:3px']) ok(css.includes(k), 'css missing ' + k);
  ok(/class Spring/.test(read(join(SRC, 'js', 'spring.js'))) && /stiffness/.test(read(join(SRC, 'js', 'spring.js'))), 'spring solver missing');
  const mv = read(join(SRC, 'js', 'marketView.js'));
  for (const k of ['classList.add(\'flash\')', 'onerror', 'tile-letter', 'springIn(node, i * 60)', 'skeletonRows', 'copyText']) ok(mv.includes(k), 'marketView missing ' + k);
});

gate('23 CHAIN record rendered from register', () => {
  ok(R.chain.state === 'stated' && R.chain.value === 'Solana' && R.chain.rpc === 'https://solana-rpc.publicnode.com', 'chain record drifted');
  ok(html.includes('data-chain>Solana<'), 'chain tile not rendered');
});

gate('24 HYGIENE: no assistant files, no attribution wording anywhere in the repo', () => {
  ok(!existsSync(join(ROOT, ['CLA', 'UDE.md'].join(''))) && !existsSync(join(ROOT, ['.cla', 'ude'].join(''))), 'assistant config present');
  const bad = new RegExp(['cla' + 'ude', 'anthr' + 'opic', '\\bA' + 'I\\b', 'gener' + 'ated by', 'co-' + 'authored', '\\bL' + 'LM\\b', 'chat' + 'gpt', 'copi' + 'lot'].join('|'), 'i');
  const files = walk(ROOT, ['node_modules', '.git', 'reference', 'brand']).filter((f) => TEXT.has(extname(f)));
  for (const f of files) ok(!bad.test(read(f)), 'attribution wording in ' + relative(ROOT, f));
});

gate('25 REPO FILES: README, whitepaper, LICENSE present, outside dist', () => {
  const readme = read(join(ROOT, 'README.md'));
  for (const k of ['Crewagent', 'Solana', 'Overview', 'Features', 'Links', 'shields.io']) ok(readme.includes(k), 'README missing ' + k);
  ok(/contract/i.test(readme) && /pending/i.test(readme), 'README needs CA placeholder');
  const wp = read(join(ROOT, 'docs', 'whitepaper.md'));
  ok(/vision/i.test(wp) && /mission/i.test(wp) && /tokenomics/i.test(wp) && /team/i.test(wp), 'whitepaper sections missing');
  const phases = (wp.match(/^###? Phase \d/gm) || []).length;
  ok(phases >= 3 && phases <= 4, 'roadmap needs 3-4 phases, got ' + phases);
  const lic = read(join(ROOT, 'LICENSE'));
  ok(/MIT License/.test(lic) && /Copyright \(c\) 2026 Crewagent/.test(lic), 'LICENSE not MIT / wrong holder');
});

gate('26 COPY: zero shared 2-grams with the reference site', () => {
  const ref = new Set(JSON.parse(read(join(ROOT, 'scripts', 'ref-bigrams.json'))));
  const strip = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ');
  const attrs = [...strip.matchAll(/(?:aria-label|title|alt)="([^"]+)"/g)].map((m) => m[1]).concat([...strip.matchAll(/<meta (?:name|property)="(?!viewport)[^"]*" content="([^"]+)"/g)].map((m) => m[1])).join(' ');
  const jsStrings = distText.filter((x) => x.f.endsWith('.js') && !/views\.js|format\.js/.test(x.f)).flatMap((x) => [...x.s.matchAll(/'([^'\n]{4,})'|`([^`\n]{4,})`/g)].map((m) => m[1] || m[2]));
  const text = strip.replace(/<[^>]+>/g, ' ') + ' ' + attrs + ' ' + jsStrings.join(' ');
  const words = text.replace(/&[#\w]+;/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  const hits = [];
  for (let i = 0; i < words.length - 1; i++) {
    const h = createHash('sha1').update(words[i] + ' ' + words[i + 1]).digest('hex').slice(0, 10);
    if (ref.has(h) && /[a-z]/.test(words[i] + words[i + 1])) hits.push(words[i] + ' ' + words[i + 1]);
  }
  ok(!hits.length, 'shared 2-grams: ' + [...new Set(hits)].slice(0, 12).join(' | '));
  return `${words.length} words checked`;
});

gate('27 SECURITY SURFACE: CSP, no inline script/style, no stray hosts, no animated-logo or coin art', () => {
  ok(/Content-Security-Policy/.test(html) && /connect-src 'self' https:\/\/api\.dexscreener\.com/.test(html), 'CSP missing');
  ok(!/<script(?![^>]*\bsrc=)(?![^>]*application\/json)[^>]*>/.test(html), 'inline script');
  ok(!/\sstyle="/.test(html), 'inline style attribute');
  for (const { f, s } of distText) {
    if (f === 'index.html') continue;
    const urls = (s.match(/https?:\/\/[^\s"'`)]+/g) || []).filter((u) => !/^https?:\/\/(www\.w3\.org)/.test(u));
    ok(!urls.length, f + ' hardcodes ' + urls[0]);
  }
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  ok(!/coin|lottie|\.gif/i.test(visible), 'coin icon or copy found');
});

gate('28 BRAND PROVENANCE: palette + trace are present, read from brand/ files', () => {
  for (const f of ['LOGO CREW PNG.png', 'LOGO CREW PNG...png', 'LOGO CREW JPG.jpg.jpeg']) ok(PALETTE.files[f] && existsSync(join(ROOT, 'brand', f)), 'brand file not analysed: ' + f);
  const png = PALETTE.files['LOGO CREW PNG...png'];
  ok(png.ihdr.colorType === 6 && png.alpha.partial > 0 && png.alpha.transparent > 0, 'transparent PNG facts missing');
  ok(PALETTE.files['LOGO CREW PNG.png'].ihdr.colorType === 6 && PALETTE.files['LOGO CREW PNG.png'].alpha.transparent === 0, 'opaque PNG facts missing');
  for (const f of Object.values(PALETTE.files)) ok(f.maxChannelSpread <= 2 || f === png, 'a brand file carries hue');
  ok(PALETTE.tokens.ink.hex === '#000000' && PALETTE.tokens.paper.hex === '#fefefe', 'anchors drifted');
  ok(TRACE.grid32.length === 32 && TRACE.head.outer[2] > 150, 'trace incomplete');
});

gate('29 COPY: no distinctive vocabulary from the reference site', () => {
  const banned = ['coin', 'coins', 'memecoin', 'memecoins', 'meme', 'memes', 'launch', 'launched', 'hire', 'hirecat', 'flywheel', 'milestones', 'leaderboard', 'agency', 'wallet', 'pump', 'dexscreener', 'zorp', 'mango', 'chirp', 'hopper', 'rosie', 'research', 'marketing', 'creative', 'content', 'social', 'web', 'home'];
  const strip = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ');
  const jsStrings = distText.filter((x) => x.f.endsWith('.js') && !/views\.js|format\.js/.test(x.f)).flatMap((x) => [...x.s.matchAll(/'([^'\n]{3,})'|`([^`\n]{3,})`/g)].map((m) => m[1] || m[2]).filter((t) => !/^(Home|End|Arrow.+|Enter|Escape)$/.test(t)));
  const words = new Set((strip.replace(/<[^>]+>/g, ' ') + ' ' + jsStrings.join(' ')).toLowerCase().replace(/&[#\w]+;/g, ' ').split(/[^a-z0-9]+/).filter(Boolean));
  const hit = banned.filter((w) => words.has(w));
  ok(!hit.length, 'reference vocabulary present: ' + hit.join(', '));
});

// ---- report ----
let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? '  [' + r.note + ']' : ''}`);
}
console.log(`\ngates: ${results.length}  passed: ${results.length - failed}  failed: ${failed}`);
process.exit(failed ? 1 : 0);
