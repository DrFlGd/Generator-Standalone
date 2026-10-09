/* Regression for Tauri's native Save As bridge.
 * A browser-style generator calls URL.createObjectURL(blob), anchor.click(),
 * then revokeObjectURL(url) before the user finishes choosing a folder.
 * The Windows bridge must preserve the exported bytes across that delay.
 */
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const script = readFileSync(fileURLToPath(new URL('./desktop-bridge.js', import.meta.url)), 'utf8');
let callbacks = {};
let saveResolve;
let saved = [];
let messages = [];
let revoked = new Set();
const blobs = new Map();
let n = 0;
class FakeElement {
  constructor(link = null) { this.link = link; }
  closest(selector) { return selector === 'a[href]' ? this.link : null; }
  matches() { return false; }
  querySelectorAll() { return []; }
}
class FakeLink {
  constructor(url, filename) {
    this.href = url;
    this.filename = filename;
  }
  closest() { return null; }
  hasAttribute(name) { return name === 'download'; }
  getAttribute(name) { return name === 'download' ? this.filename : null; }
}
class FakeURL extends URL {}
FakeURL.createObjectURL = (blob) => {
  const url = 'blob:desktop-regression-' + (++n);
  blobs.set(url, blob);
  return url;
};
FakeURL.revokeObjectURL = (url) => {
  revoked.add(url);
  blobs.delete(url);
};
const api = {
  dialog: { save: () => new Promise((resolve) => { saveResolve = resolve; }) },
  fs: { writeFile: async (path, data) => saved.push({ path, data }) },
};
const context = createContext({
  URL: FakeURL, Blob, Uint8Array, Promise,
  window: { __TAURI__: api, alert: (msg) => messages.push(msg) },
  document: {
    documentElement: new FakeElement(),
    addEventListener(name, listener) { callbacks[name] = listener; },
  },
  Element: FakeElement,
  HTMLAnchorElement: FakeLink,
  MutationObserver: class { observe() {} },
  location: { href: 'http://tauri.local/' },
  console: { info() {}, error: (error) => messages.push(String(error)) },
  fetch: (url) => {
    if (revoked.has(url)) return Promise.reject(new Error('blob URL already revoked'));
    const blob = blobs.get(url);
    if (!blob) return Promise.reject(new Error('missing blob URL'));
    return Promise.resolve({ ok: true, arrayBuffer: () => blob.arrayBuffer() });
  },
});
new Script(script, { filename: 'desktop-bridge.js' }).runInContext(context);
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function download(filename, data, expectedPath) {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = FakeURL.createObjectURL(blob);
  const link = new FakeLink(url, filename);
  let cancelled = false;
  callbacks.click({
    target: new FakeElement(link),
    button: 0,
    defaultPrevented: false,
    ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    preventDefault() { cancelled = true; },
  });
  assert.equal(cancelled, true, 'native bridge must intercept the anchor');
  assert.equal(typeof saveResolve, 'function', 'native Save As must be opened');
  FakeURL.revokeObjectURL(url); // generator cleanup immediately after click()
  saveResolve(expectedPath); // user selects folder later
  await flush();
  await flush();
}

await download('part.3mf', Uint8Array.from([0x50, 0x4b, 3, 4, 255, 0]), 'C:\\test\\part.3mf');
assert.equal(saved.length, 1);
assert.equal(saved[0].path, 'C:\\test\\part.3mf');
assert.deepEqual([...saved[0].data], [0x50, 0x4b, 3, 4, 255, 0], 'preserve binary 3MF bytes');

await download('project.json', '{"test":true}', 'C:\\test\\project.json');
assert.equal(saved.length, 2);
assert.equal(new TextDecoder().decode(saved[1].data), '{"test":true}', 'preserve JSON bytes');

await download('cancelled.3mf', 'no write', null);
assert.equal(saved.length, 2, 'cancelled Save As must not write a file');
assert.deepEqual(messages, [], 'successful writes and cancel must not show errors');
console.log('PASS Windows bridge saves revoked Blob files (binary and JSON) and handles Cancel.');
