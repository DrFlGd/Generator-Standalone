// Build every live own-site generator and zip each dist/ as an offline web bundle.
//
//   node scripts/web-bundles.mjs [label]
//
// Out: web-bundles/<app>-web-<label>.zip, one per app, ready to attach to a release. The
// web-release workflow does this on every push to master. Generator Library installs a
// bundle by unpacking it and serving it from a local server, which works because every app
// builds with a relative base (`base: './'`).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { folderFor } from './generator-manifests.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'web-bundles');
const label = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '');

const registry = JSON.parse(readFileSync(join(ROOT, 'generators.json'), 'utf8')).generators;
const apps = registry
  .filter((g) => g.status === 'live' && !g.external && (g.route === 'app' || g.route === 'both'))
  .map(folderFor);

const walk = (dir, base = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name)).split(sep).join(posix.sep)],
  );

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const app of apps) {
  console.log(`Building ${app}`);
  execFileSync('pnpm', ['--filter', app, 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  const dist = join(ROOT, 'apps', app, 'dist');
  const files = walk(dist);
  if (!files.includes('index.html')) throw new Error(`${app}: dist has no index.html`);
  const entries = {};
  for (const file of files) entries[file] = new Uint8Array(readFileSync(join(dist, file)));
  const zip = zipSync(entries, { level: 6 });
  const out = join(OUT, `${app}-web-${label}.zip`);
  writeFileSync(out, zip);
  console.log(`  ${relative(ROOT, out)} (${(statSync(out).size / 1048576).toFixed(1)} MB, ${files.length} files)`);
}
