// Stage "06 Design System/" as an npm-package-shaped tree the design-sync
// converter can read.
//
// The FEB design system is plain CSS: tokens, components, two woff2 faces, no
// JavaScript. The converter is built for React packages and reads its inputs
// from a package directory under a node_modules root, so this script mirrors
// the canonical files into that shape. Nothing here is authored — it is a copy,
// regenerated on every run, and the files under "06 Design System/" stay the
// single source of truth.
//
// The emitted dist entry is deliberately empty. With no PascalCase exports and
// a cssEntry set, the converter takes its tokens-only path: a styling layer
// with an empty-bodied _ds_bundle.js and no component cards.
//
// Run from the git root:  node .design-sync/stage-pkg.mjs

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, '06 Design System');
const PKG_NAME = 'feb-composites-design-system';
// A real node_modules root: the converter vendors react out of it for the
// preview runtime even when the DS itself ships no JavaScript.
const NM = join(ROOT, '.design-sync', '.cache', 'node_modules');
const PKG = join(NM, PKG_NAME);

rmSync(PKG, { recursive: true, force: true });
mkdirSync(join(PKG, 'dist'), { recursive: true });

cpSync(join(SRC, 'components.css'), join(PKG, 'components.css'));
cpSync(join(SRC, 'fonts'), join(PKG, 'fonts'), { recursive: true });

// Split the @font-face rules out of tokens.css into their own file, the way
// "06 Design System/build.mjs" already does for the style guide. The converter
// copies tokens.css into ds-bundle/tokens/ verbatim but harvests fonts from a
// separate cfg.extraFonts stylesheet, so a face left in tokens.css would keep
// its url('fonts/…') and resolve one directory too deep.
const tokens = readFileSync(join(SRC, 'tokens.css'), 'utf8');
const faces = [...tokens.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
if (faces.length !== 2) throw new Error(`expected 2 @font-face rules in tokens.css, found ${faces.length}`);
writeFileSync(join(PKG, 'tokens.css'), tokens.replace(/@font-face\s*\{[^}]*\}\s*/g, ''));
writeFileSync(join(PKG, 'fonts.css'), faces.join('\n') + '\n');

writeFileSync(
  join(PKG, 'package.json'),
  JSON.stringify(
    {
      name: PKG_NAME,
      version: '1.0.0',
      description: 'FEB Composites design system — tokens, components, fonts (CSS only)',
      module: './dist/index.js',
      main: './dist/index.js',
      types: './dist/index.d.ts',
    },
    null,
    2,
  ) + '\n',
);

// No components to export. The CSS is the whole system.
writeFileSync(join(PKG, 'dist', 'index.js'), 'export {};\n');
writeFileSync(join(PKG, 'dist', 'index.d.ts'), 'export {};\n');

console.log(`staged ${PKG_NAME} at ${PKG}`);
