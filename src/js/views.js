// Pure string renderers shared by the build step, the gates and the browser.
// Every external fact is a register record; only a stated record may carry a value or a url.

export const ICONS = {
  x: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  github:
    '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>',
};

export const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const STATES = ['stated', 'absent', 'unconfirmed'];
const INERT_FORBIDDEN = ['value', 'url', 'rpc', 'endpoints', 'handle'];

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function isStated(rec) {
  return !!rec && rec.state === 'stated';
}

// Derive the visible handle from the stored URL; never store it.
export function deriveHandle(kind, url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length) return u.hostname;
    return kind === 'x' ? '@' + parts[0].replace(/^@/, '') : parts.slice(0, 2).join('/');
  } catch {
    return '';
  }
}

export function safeHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

export function validateRegister(reg) {
  const errors = [];
  const recs = reg && reg.records;
  if (!recs) return ['register has no records'];
  for (const [k, r] of Object.entries(recs)) {
    if (!STATES.includes(r.state)) errors.push(`${k}: bad state ${r.state}`);
    if (typeof r.label !== 'string' || !r.label) errors.push(`${k}: missing label`);
    if (r.state !== 'stated') {
      for (const f of INERT_FORBIDDEN) if (f in r) errors.push(`${k}: inert record carries ${f}`);
    }
  }
  const ca = recs.ca;
  if (ca && ca.state === 'stated' && !BASE58.test(ca.value || '')) errors.push('ca: stated value is not address-shaped');
  for (const k of ['x', 'github']) {
    const r = recs[k];
    if (r && r.state === 'stated' && !safeHttpUrl(r.url)) errors.push(`${k}: stated url is not https`);
  }
  return errors;
}

export function renderCa(rec) {
  if (isStated(rec) && BASE58.test(rec.value || '')) {
    const v = esc(rec.value);
    return (
      '<!--ca:start--><div class="ca" data-slot="ca" data-state="stated">' +
      `<span class="ca-label">${esc(rec.label)}</span>` +
      `<button type="button" class="ca-copy" data-copy="${v}" aria-label="Copy contract address"><span class="ca-value">${v}</span><span class="ca-hint" data-copy-hint>Copy</span></button>` +
      '<span class="sr-only" role="status" data-copy-live></span></div><!--ca:end-->'
    );
  }
  return (
    '<!--ca:start--><div class="ca" data-slot="ca" data-state="inert">' +
    `<span class="ca-label">${esc((rec && rec.label) || 'Contract')}</span>` +
    '<span class="ca-value ca-pending" aria-disabled="true">pending</span></div><!--ca:end-->'
  );
}

export function renderSocial(kind, rec) {
  const icon = ICONS[kind];
  const label = (rec && rec.label) || kind;
  const href = isStated(rec) ? safeHttpUrl(rec.url) : '';
  if (href) {
    const handle = deriveHandle(kind, href);
    return `<a class="social" data-social="${kind}" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)} ${esc(handle)}">${icon}</a>`;
  }
  return `<span class="social inert" data-social="${kind}" role="link" aria-disabled="true" aria-label="${esc(label)}, pending" title="${esc(label)}: pending">${icon}</span>`;
}

export function renderChip(rec) {
  const stated = isStated(rec) && rec.value;
  const tail = stated ? esc(rec.value) : 'pending';
  return `<li class="chip${stated ? '' : ' inert'}" data-record-state="${stated ? 'stated' : 'inert'}"><span class="chip-label">${esc(rec.label)}</span><span class="chip-value">${tail}</span></li>`;
}

export function renderChain(rec) {
  return isStated(rec) && rec.value ? esc(rec.value) : 'pending';
}

// Tile whose slot stays even when the record is inert.
export function renderRecordTile(key, rec) {
  const stated = isStated(rec) && rec.value;
  return (
    `<div class="tile spot${stated ? '' : ' inert'}" data-reveal data-tile="${esc(key)}"><span class="tile-label">${esc(rec.label)}</span>` +
    `<span class="tile-value">${stated ? esc(rec.value) : 'pending'}</span></div>`
  );
}
