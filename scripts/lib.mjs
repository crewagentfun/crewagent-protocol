import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, renderCa, renderSocial, renderChip, renderChain, renderRecordTile, validateRegister } from '../src/js/views.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = join(ROOT, 'src');
export const DIST = join(ROOT, 'dist');
export const read = (p) => readFileSync(p, 'utf8');

// Glyph traced from the circles fitted to the real logo pixels (src/brand/trace.json),
// scaled so the glyph is 22 units tall inside a 32 unit box.
const TRACE = JSON.parse(readFileSync(join(SRC, 'brand', 'trace.json'), 'utf8'));
const f = (n) => Number(n.toFixed(2));
export function glyphPath() {
  const [bx0, by0, bx1, by1] = [Math.min(TRACE.headBbox[0], TRACE.shouldersBbox[0]), TRACE.headBbox[1], Math.max(TRACE.headBbox[2], TRACE.shouldersBbox[2]), TRACE.shouldersBbox[3]];
  const s = 22 / (by1 - by0);
  const X = (x) => f((x - (bx0 + bx1) / 2) * s + 16);
  const Y = (y) => f((y - (by0 + by1) / 2) * s + 16);
  const R = (r) => f(r * s);
  const ring = ([cx, cy, r]) => `M${f(X(cx) - R(r))} ${Y(cy)}a${R(r)} ${R(r)} 0 1 0 ${f(2 * R(r))} 0a${R(r)} ${R(r)} 0 1 0 ${f(-2 * R(r))} 0z`;
  const h = TRACE.head;
  const sh = TRACE.shoulders;
  const cut = Y(sh.cutY);
  const half = (c) => f(Math.sqrt(Math.max(0, (c[2] * s) ** 2 - (Y(c[1]) - cut) ** 2)));
  const cx = X(sh.outer[0]);
  const ro = R(sh.outer[2]);
  const ri = R(sh.inner[2]);
  const ho = half(sh.outer);
  const hi = half(sh.inner);
  const shoulders = `M${f(cx - ho)} ${cut}A${ro} ${ro} 0 0 1 ${f(cx + ho)} ${cut}L${f(cx + hi)} ${cut}A${ri} ${ri} 0 0 0 ${f(cx - hi)} ${cut}z`;
  return ring(h.outer) + ring(h.inner) + shoulders;
}
export const GLYPH_D = glyphPath();

export function loadRegister() {
  return JSON.parse(read(join(SRC, 'register.json')));
}

// Dates stay in register.json only; the shipped copy drops every *On field.
export function publicRegister(reg) {
  const out = { records: {} };
  for (const [k, r] of Object.entries(reg.records)) {
    out.records[k] = Object.fromEntries(Object.entries(r).filter(([f]) => !/On$/.test(f)));
  }
  return out;
}

export function resolveToken(css, name, depth = 0) {
  const m = css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!m || depth > 8) return '';
  const v = m[1].trim();
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolveToken(css, ref[1], depth + 1) : v;
}

export function crewHtml() {
  const crew = JSON.parse(read(join(SRC, 'crew.json')));
  const tabs = crew
    .map(
      (c, i) =>
        `<button type="button" class="crew-tab" role="tab" id="tab-${i}" aria-controls="panel-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="av">${esc(c.name[0])}</span><span>${esc(c.name)}<small>${esc(c.role)}</small></span></button>`
    )
    .join('');
  const panels = crew
    .map(
      (c, i) =>
        `<div class="crew-panel" role="tabpanel" id="panel-${i}" aria-labelledby="tab-${i}"${i === 0 ? '' : ' hidden'}><div class="crew-art" aria-hidden="true">${esc(c.name[0])}</div><div class="crew-info"><p class="crew-role">${esc(c.role)}</p><h3>${esc(c.name)}</h3><p class="crew-line">${esc(c.line)}</p><ul class="duties">${c.duties.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div></div>`
    )
    .join('');
  return { tabs, panels };
}

export function buildHtml(reg) {
  const errors = validateRegister(reg);
  if (errors.length) throw new Error('register invalid:\n' + errors.join('\n'));
  const r = reg.records;
  const pub = publicRegister(reg);
  const { tabs, panels } = crewHtml();
  const chips = ['chain', 'ca', 'x', 'github']
    .filter((k) => r[k])
    .map((k) => renderChip(r[k]))
    .join('');
  const json = JSON.stringify(pub).replace(/</g, '\\u003c');
  const map = {
    GLYPH_D,
    CA: renderCa(r.ca),
    X: renderSocial('x', r.x),
    GITHUB: renderSocial('github', r.github),
    CHAIN: renderChain(r.chain),
    TILE_SUPPLY: renderRecordTile('supply', r.supply),
    TILE_HOLDERS: renderRecordTile('holders', r.holders),
    CHIPS: chips,
    CREW_TABS: tabs,
    CREW_PANELS: panels,
    REGISTER: json,
  };
  return read(join(SRC, 'index.template.html')).replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in map)) throw new Error('template slot without data: ' + k);
    return map[k];
  });
}
