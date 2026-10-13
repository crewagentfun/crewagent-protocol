import { rmSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SRC, DIST, read, loadRegister, buildHtml, resolveToken, GLYPH_D } from './lib.mjs';

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'assets'), { recursive: true });

writeFileSync(join(DIST, 'index.html'), buildHtml(loadRegister()));

for (const f of ['tokens.css', 'main.css']) copyFileSync(join(SRC, 'css', f), join(DIST, 'assets', f));
for (const f of readdirSync(join(SRC, 'js'))) copyFileSync(join(SRC, 'js', f), join(DIST, 'assets', f));
copyFileSync(join(SRC, 'fonts', 'inter.woff2'), join(DIST, 'assets', 'inter.woff2'));

// Favicon: glyph traced from the logo pixel grid; colors resolved from the tokens file.
const tokens = read(join(SRC, 'css', 'tokens.css'));
const bg = resolveToken(tokens, '--bg');
const fg = resolveToken(tokens, '--fg');
writeFileSync(
  join(DIST, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" fill="${bg}"/><path fill="${fg}" fill-rule="evenodd" d="${GLYPH_D}"/></svg>
`
);

console.log('built dist/ from', ROOT);
