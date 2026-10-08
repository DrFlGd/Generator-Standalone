// Build the Vostok Labs hub and all 10 live, locally hosted generators
// together. The GitHub Pages builds and sources remain untouched.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

// The desktop launcher is the Generators page. Prune pages and navigation
// irrelevant to a private desktop catalogue; leave the website untouched.
// linkedom is already an installed dependency of the hub workspace package.
const { parseHTML } = createRequire(join(root, 'apps', 'hub', 'package.json'))('linkedom');
const catalogue = join(output, 'make', 'index.html');
if (!existsSync(catalogue)) throw new Error('Missing pre-rendered Generators page.');
copyFileSync(catalogue, join(output, 'index.html'));

const removedPages = ['licences', 'faq'];
for (const page of removedPages) rmSync(join(output, page), { recursive: true, force: true });
rmSync(catalogue, { force: true }); // / is the sole Generators landing page.
rmSync(join(output, '404.html'), { force: true });
rmSync(join(output, 'sitemap.xml'), { force: true });

function hubHtmlFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return hubHtmlFiles(full);
    return entry.isFile() && entry.name.endsWith('.html') ? [full] : [];
  });
}
const hubFiles = [
  join(output, 'index.html'),
  ...hubHtmlFiles(join(output, 'generators')),
  ...hubHtmlFiles(join(output, 'make')),
];
for (const htmlFile of hubFiles) {
  const { document } = parseHTML(readFileSync(htmlFile, 'utf8'));
  const rail = document.querySelector('nav.hub-rail');
  if (!rail) throw new Error('Missing hub navigation in ' + htmlFile);

  // Keep the Vostok Labs branding, but it now returns to Generators.
  const logo = rail.querySelector('.hub-rail__logo');
  if (logo) {
    logo.setAttribute('href', '/');
    logo.setAttribute('aria-label', 'Generators home');
  }
  const generatorLink = rail.querySelector('a[href="/make/"]');
  if (!generatorLink) throw new Error('Missing Generators navigation in ' + htmlFile);
  generatorLink.setAttribute('href', '/');

  // Licences, FAQ, MakerWorld and Coffee are not desktop navigation.
  for (const anchor of [...rail.querySelectorAll('a[href]')]) {
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('/licences/') || href.startsWith('/faq/') || /^https?:\/\//i.test(href)) {
      anchor.remove();
    }
  }
  for (const rule of [...rail.querySelectorAll('.vl-tool-rail__rule, .vl-tool-rail__gap')]) rule.remove();

  // Remove the entire footer, including the separator, additional links,
  // redundant navigation, attribution lines and support links. Licence
  // notices in the original source and generator files are untouched.
  document.querySelector('.hub-footer')?.remove();
  document.querySelector('#coming-soon')?.remove();

  // Product detail pages must not link to deleted licence/FAQ pages.
  for (const panel of [...document.querySelectorAll('.hub-panel')]) {
    if (panel.querySelector('.vl-label')?.textContent?.trim() === 'Licence') panel.remove();
  }
  for (const part of [...document.querySelectorAll('.hub-buy__part')]) {
    if (part.querySelector('.hub-buy__plans')) part.remove();
  }
  for (const anchor of [...document.querySelectorAll('a[href]')]) {
    const href = anchor.getAttribute('href') ?? '';
    if (href === '/make/' || href.startsWith('/make/#')) {
      anchor.setAttribute('href', href.replace('/make/', '/'));
    } else if (href.startsWith('/licences/') || href.startsWith('/faq/')) {
      anchor.remove();
    }
  }

  writeFileSync(htmlFile, document.toString());
}
const home = readFileSync(join(output, 'index.html'), 'utf8');
if (!home.includes('Generators') || !home.includes('data-catalogue-filter')) {
  throw new Error('Invalid Windows Generators start page');
}
if (home.includes('id="coming-soon"') || home.includes('class="hub-footer"')) {
  throw new Error('Unwanted Windows landing-page sections remain');
}
if (existsSync(join(output, 'licences')) || existsSync(join(output, 'faq')) ||
    existsSync(join(output, 'make', 'index.html'))) {
  throw new Error('Removed pages still present in packaged Windows assets');
}
console.log('Desktop hub simplified: Generators first; no Home, Licences, FAQ, Coming Soon, rail support links or footer.');

for (const route of localRoutes) {
  if (!existsSync(join(output, route, 'index.html'))) {
    throw new Error('Missing packaged route: /' + route + '/');
  }
}
console.log('Desktop frontend ready: ' + output);
