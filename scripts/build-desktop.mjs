// Build the Vostok Labs hub and all 10 live, locally hosted generators
// together. The GitHub Pages builds and sources remain untouched.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'desktop-dist');
const apps = [
  { name: 'hub', folder: 'hub', routes: [''] },
  { name: 'name-keychain', folder: 'name-keychain', routes: ['name-keychain'] },
  { name: 'clicker-generator', folder: 'clicker-generator', routes: ['Clicker-Generator', 'clicker'] },
  { name: 'keycap-generator', folder: 'keycap-generator', routes: ['SVG-keycap-generator', 'keycap'] },
  { name: 'magnet-generator', folder: 'magnet-generator', routes: ['magnet'] },
  { name: 'house-number', folder: 'house-number', routes: ['house-number'] },
  { name: 'pen-topper', folder: 'pen-topper', routes: ['pen-topper'] },
  { name: 'foldbox', folder: 'foldbox', routes: ['foldbox'] },
  { name: 'keychain-carabiner', folder: 'keychain-carabiner', routes: ['keychain-carabiner'] },
  { name: 'laser-studio', folder: 'laser-studio', routes: ['laser-studio'] },
  { name: 'laser-box', folder: 'laser-box', routes: ['laser-box'] },
];

const registry = JSON.parse(readFileSync(join(root, 'generators.json'), 'utf8'));
const localRoutes = registry.generators
  .filter((g) => g.status === 'live' && ['app', 'both'].includes(g.route) && !g.external)
  .map((g) => (g.appUrl ?? '/' + g.id + '/').replace(/^\/|\/$/g, ''));
const availableRoutes = new Set(apps.flatMap((a) => a.routes));
const missing = localRoutes.filter((route) => !availableRoutes.has(route));
if (missing.length) throw new Error('Desktop build missing registered routes: ' + missing.join(', '));

rmSync(output, { recursive: true, force: true });
for (const app of apps) {
  console.log('Building ' + app.name);
  const child = spawnSync('pnpm', ['--filter', app.name, 'build'], {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (child.status !== 0 || child.error) {
    throw new Error(app.name + ': ' + (child.error?.message ?? child.status));
  }
  const dist = join(root, 'apps', app.folder, 'dist');
  if (!existsSync(join(dist, 'index.html'))) throw new Error('Missing index.html in ' + dist);
  for (const route of app.routes) {
    const destination = join(output, route);
    mkdirSync(destination, { recursive: true });
    cpSync(dist, destination, { recursive: true, force: true });
  }
}

// The bridge is loaded on every generated HTML page so the desktop behavior
// survives navigating between independently built generators and hub pages.
const bridgeTag = '<script defer src="/desktop-bridge.js"></script>';
function patchHtml(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) patchHtml(path);
    else if (item.isFile() && item.name.endsWith('.html')) {
      const html = readFileSync(path, 'utf8');
      if (!html.includes('</head>')) throw new Error('Malformed HTML: ' + path);
      if (!html.includes(bridgeTag)) {
        writeFileSync(path, html.replace('</head>', '  ' + bridgeTag + '\n</head>'));
      }
    }
  }
}
patchHtml(output);
cpSync(join(root, 'scripts', 'desktop-bridge.js'), join(output, 'desktop-bridge.js'));

for (const route of localRoutes) {
  if (!existsSync(join(output, route, 'index.html'))) {
    throw new Error('Missing packaged route: /' + route + '/');
  }
}
console.log('Desktop frontend ready: ' + output);
