// Build every app the standalone ships and zip each dist/ as an offline web bundle.
//
//   node scripts/web-bundles.mjs [label]
//
// Out: web-bundles/<app>-web-<label>.zip, one per app, ready to attach to a release. The
// web-release workflow does this on every push to master. Generator Library installs a
// bundle by unpacking it and serving it from a local server, which works because every app
// builds with a relative base (`base: './'`).
//
// A bundle is the standalone edition, not the website: every HTML page gets the same
// desktop-ui.css that scripts/build-desktop.mjs injects and sets __VOSTOK_OFFLINE_BUNDLE__,
// which keeps the post-export licence prompts quiet exactly as they are in the Windows app.
// A bundle has no hub to return to (the app that installed it is the catalogue), so the one
// link desktop-ui.css keeps would leave for the website: the bar is collapsed instead.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import { bundleFolders } from './generator-manifests.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'web-bundles');
const label = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const DESKTOP_CSS = 'desktop-ui.css';
// Collapsed rather than display:none: the shell's grid rows are `auto minmax(0, 1fr)`, so the
// bar has to keep its row for the panels to stay in the one that fills.
const NO_TOPBAR = '.vl-topbar { min-height: 0 !important; height: 0 !important; padding: 0 !important;'
  + ' border: 0 !important; overflow: hidden !important; }';
const desktopCss = readFileSync(join(ROOT, 'scripts', DESKTOP_CSS));

const walk = (dir, base = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name)).split(sep).join(posix.sep)],
  );

/** The page with the standalone stylesheet, collapsed bar and flag added before </head>. */
export function standaloneHtml(html, file) {
  if (!html.includes('</head>')) throw new Error(`${file}: no </head>`);
  const depth = file.split('/').length - 1;
  const href = '../'.repeat(depth) + DESKTOP_CSS;
  return html.replace(
    '</head>',
    `  <link rel="stylesheet" href="${href}">\n`
      + `  <style>${NO_TOPBAR}</style>\n`
      + '  <script>globalThis.__VOSTOK_OFFLINE_BUNDLE__ = true;</script>\n</head>',
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const app of bundleFolders()) {
    console.log(`Building ${app}`);
    execFileSync('pnpm', ['--filter', app, 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    const dist = join(ROOT, 'apps', app, 'dist');
    const files = walk(dist);
    if (!files.includes('index.html')) throw new Error(`${app}: dist has no index.html`);
    if (files.includes(DESKTOP_CSS)) throw new Error(`${app}: dist already has a ${DESKTOP_CSS}`);
    const entries = { [DESKTOP_CSS]: new Uint8Array(desktopCss) };
    for (const file of files) {
      const bytes = readFileSync(join(dist, file));
      entries[file] = file.endsWith('.html')
        ? strToU8(standaloneHtml(bytes.toString('utf8'), file))
        : new Uint8Array(bytes);
    }
    const zip = zipSync(entries, { level: 6 });
    const out = join(OUT, `${app}-web-${label}.zip`);
    writeFileSync(out, zip);
    console.log(`  ${relative(ROOT, out)} (${(statSync(out).size / 1048576).toFixed(1)} MB, ${files.length + 1} files)`);
  }
}
