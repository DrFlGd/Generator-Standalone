// Write the Generator Library manifests from generators.json, so the registry stays the one
// place a tool is described.
//
//   node scripts/generator-manifests.mjs            write apps/<app>/generator.json and generator-library.json
//   node scripts/generator-manifests.mjs --check    fail if any of them is out of date
//
// generator-library.json lists every tool for https://github.com/DrFlGd/Generator-Library:
// one card per generator, each with the ways it can be run. Own-site apps get the offline
// bundle published by the web-release workflow, which is the standalone build (no web-only
// top bar links or licence prompts), plus their MakerWorld listing when they have one. The
// public website is not linked: it is the web edition, with the web chrome. MakerWorld-only
// tools get the listing alone. Apps only the standalone ships (BUNDLE_ONLY) get a bundle.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCHEMA = 'https://raw.githubusercontent.com/DrFlGd/Generator-Library/main/schema/';
const HUB = 'https://vostoklabs.github.io';

// Registry ids that differ from their app folder.
const FOLDERS = { clicker: 'clicker-generator', magnet: 'magnet-generator', keycap: 'keycap-generator' };
export const folderFor = (g) => FOLDERS[g.id] ?? g.id;

// Apps the standalone build ships that are not on the public website, so not in
// generators.json. Described here the way scripts/build-desktop.mjs describes its card.
export const BUNDLE_ONLY = [
  {
    id: 'led-lightbox',
    name: 'Image LED Lightbox',
    blurb: 'Custom hollow LED boxes from a logo or silhouette image.',
    topics: ['boxes', 'desk-home', 'signs'],
    process: '3d-print',
    icon: 'apps/led-lightbox/public/preview.svg',
  },
];

const registry = JSON.parse(readFileSync(join(ROOT, 'generators.json'), 'utf8')).generators;
const live = registry.filter((g) => g.status === 'live' && !g.external);
const apps = live.filter((g) => g.route === 'app' || g.route === 'both');
const listings = live.filter((g) => g.route === 'mw');

/** App folders that get an offline bundle: every live own-site app, then BUNDLE_ONLY. */
export const bundleFolders = () => [...apps.map(folderFor), ...BUNDLE_ONLY.map((g) => g.id)];

function thumb(g) {
  for (const ext of ['png', 'jpg']) {
    const rel = `apps/hub/public/thumbs/${g.id}.${ext}`;
    if (existsSync(join(ROOT, rel))) return rel;
  }
  return undefined;
}

function manifest(g) {
  const folder = folderFor(g);
  const distributions = [];
  if (g.route !== 'mw') {
    distributions.push({
      kind: 'bundle',
      label: 'Install offline copy',
      from: { type: 'release', tag: 'web-*', asset: `${folder}-web-*.zip` },
      entry: 'index.html',
    });
  }
  if (g.mwUrl) distributions.push({ kind: 'web', url: g.mwUrl, label: 'Open on MakerWorld' });
  return {
    $schema: `${SCHEMA}generator.schema.json`,
    id: folder,
    name: g.name,
    summary: g.blurb,
    tags: g.topics ?? [],
    process: g.process,
    icon: g.icon ?? thumb(g),
    distributions,
  };
}

const files = new Map();
for (const g of [...apps, ...BUNDLE_ONLY.map((b) => ({ ...b, route: 'app' }))]) {
  files.set(`apps/${folderFor(g)}/generator.json`, manifest(g));
}
files.set('generator-library.json', {
  $schema: `${SCHEMA}collection.schema.json`,
  id: 'vostok-labs',
  name: 'Vostok Labs',
  defaults: { license: 'CC-BY-NC-ND-4.0', tags: ['vostok-labs'], homepage: HUB },
  generators: [
    ...bundleFolders().map((folder) => ({ path: `apps/${folder}/generator.json` })),
    ...listings.map(manifest),
    {
      id: 'vostok-labs-standalone',
      name: 'Vostok Labs Standalone (Windows)',
      summary: 'Every live generator bundled as one offline Windows desktop app.',
      tags: ['desktop', 'offline'],
      process: '3d-print',
      icon: 'apps/hub/public/favicon.png',
      distributions: [
        {
          kind: 'exe',
          platform: 'windows',
          install: 'installer',
          label: 'Install Windows app',
          from: { type: 'release', tag: 'v*', asset: '*-setup.exe' },
        },
      ],
    },
  ],
});

function writeManifests() {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [rel, data] of files) {
    const text = JSON.stringify(data, null, 2) + '\n';
    const file = join(ROOT, rel);
    const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (current === text) continue;
    stale++;
    if (check) console.error(`${rel} is out of date: run node scripts/generator-manifests.mjs`);
    else {
      writeFileSync(file, text);
      console.log(`wrote ${rel}`);
    }
  }
  if (check && stale) process.exit(1);
  if (!stale) console.log(`${files.size} manifests up to date`);
}

// scripts/web-bundles.mjs imports this file for its app list, so only write when run directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeManifests();
