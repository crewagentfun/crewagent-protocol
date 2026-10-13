const dash = '\u2014';

export function fmtUsd(n) {
  if (!Number.isFinite(n)) return dash;
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

export function fmtPrice(p) {
  if (!Number.isFinite(p)) return dash;
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return '$' + p.toFixed(2);
  if (p >= 0.01) return '$' + p.toFixed(4);
  if (p <= 0) return '$0';
  const d = Math.min(12, 3 - Math.floor(Math.log10(p)));
  return '$' + p.toFixed(d);
}

export function fmtPct(n) {
  if (!Number.isFinite(n)) return dash;
  const a = Math.abs(n);
  return (a >= 1000 ? Math.round(a).toLocaleString('en-US') : a.toFixed(2)) + '%';
}

export function fmtInt(n) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : dash;
}

export const letter = (s) => (String(s || '?').replace(/[^\p{L}\p{N}]/gu, '')[0] || '?').toUpperCase();
