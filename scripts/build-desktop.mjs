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
  { name: 'led-lightbox', folder: 'led-lightbox', routes: ['led-lightbox'] },
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
const desktopStyleTag = '<link rel="stylesheet" href="/desktop-ui.css">';
function patchHtml(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) patchHtml(path);
    else if (item.isFile() && item.name.endsWith('.html')) {
      const html = readFileSync(path, 'utf8');
      if (!html.includes('</head>')) throw new Error('Malformed HTML: ' + path);
      if (!html.includes(bridgeTag) || !html.includes(desktopStyleTag)) {
        writeFileSync(path, html.replace('</head>',
          '  ' + desktopStyleTag + '\n  ' + bridgeTag + '\n</head>'));
      }
    }
  }
}
patchHtml(output);
cpSync(join(root, 'scripts', 'desktop-bridge.js'), join(output, 'desktop-bridge.js'));
cpSync(join(root, 'scripts', 'desktop-ui.css'), join(output, 'desktop-ui.css'));


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

  // The Windows catalogue has no navigation/header control at all.
  // Detail/topic pages keep exactly one clear return link to the catalogue.
  const isDesktopHome = htmlFile === join(output, 'index.html');
  if (isDesktopHome) {
    // This is a private Windows-only generator: keep the public website catalogue intact.
    const shelf = document.querySelector('#web-apps .hub-grid');
    if (!shelf) throw new Error('Missing web-app shelf for LED Lightbox card.');
    const card = document.createElement('article');
    card.setAttribute('class', 'hub-card');
    card.setAttribute('data-card', '');
    card.setAttribute('data-topics', 'boxes desk-home signs');
    card.setAttribute('data-process', '3d-print');
    card.setAttribute('data-search', 'image led lightbox box silhouette led strips illuminated sign wire hole');
    card.innerHTML =
      '<a class="hub-card__media" href="/led-lightbox/" tabindex="-1" aria-hidden="true">' +
      '<img class="hub-thumb" src="/led-lightbox/preview.svg" alt="" loading="lazy" width="800" height="600"></a>' +
      '<div class="hub-card__body">' +
      '<p class="hub-card__meta">3D print · Offline desktop</p>' +
      '<h3 class="hub-card__name"><a href="/led-lightbox/">Image LED Lightbox</a></h3>' +
      '<p class="hub-card__blurb" title="Custom hollow LED boxes from a logo or silhouette image">Custom hollow LED boxes from a logo or silhouette image.</p>' +
      '<div class="hub-card__actions"><a class="vl-btn vl-btn--primary" href="/led-lightbox/">Open app</a></div></div>';
    shelf.prepend(card);
    const heading = document.querySelector('#web-apps .hub-section__title');
    if (heading) heading.textContent = 'Web apps · ' + shelf.querySelectorAll('[data-card]').length;
    rail.remove();
    document.querySelector('.hub-page')?.classList.add('hub-page--desktop-home');
  } else {
    rail.querySelector('.hub-rail__logo')?.remove();
    const generatorLink = rail.querySelector('a[href="/make/"]');
    if (!generatorLink) throw new Error('Missing Generators return link: ' + htmlFile);
    generatorLink.setAttribute('href', '/');
    generatorLink.removeAttribute('target');
    generatorLink.removeAttribute('rel');
    generatorLink.querySelector('.vl-tool-rail__label')?.replaceChildren('See all generators');
    generatorLink.setAttribute('aria-label', 'See all generators');
  }

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
if (!home.includes('Generators') || !home.includes('data-catalogue-filter') || !home.includes('Image LED Lightbox')) {
  throw new Error('Invalid Windows Generators start page');
}
if (home.includes('hub-rail__logo') || home.includes('nav class="vl-tool-rail') ||
    !home.includes('hub-page--desktop-home')) {
  throw new Error('Unwanted desktop home navigation or logo remains');
}
for (const path of [join(output, 'desktop-ui.css'), join(output, 'desktop-bridge.js')]) {
  if (!existsSync(path)) throw new Error('Missing desktop UI asset: ' + path);
}
for (const htmlFile of hubFiles.filter((file) => file !== join(output, 'index.html'))) {
  const html = readFileSync(htmlFile, 'utf8');
  if (html.includes('hub-rail__logo')) throw new Error('Redundant logo in ' + htmlFile);
  if (!html.includes('See all generators')) throw new Error('Missing home link: ' + htmlFile);
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
