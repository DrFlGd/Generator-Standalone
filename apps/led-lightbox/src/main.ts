import '@vostok/ui-kit/styles.css';
import '@vostok/plates/plates.css';
import './style.css';
import {
  appShell, linkButton, generatorHeader, panelCredit, section, collapsibleSection,
  dropZone, sliderRow, selectField, toggleSwitch, button, stageStatus,
  sidebarFooter, dialog, toast, readProjectFile, markProject, buildLoop, workerClient,
  syncControls, el, ICONS, type ProjectShape,
} from '@vostok/ui-kit';
import { createViewer } from '@vostok/viewer';
import { plateSize, mountPlatePicker, loadPlateChoice } from '@vostok/plates';
import { downloadThreeMF, downloadFile } from '@vostok/export';
import { loadFileToImage, processImage, type RgbaImage, type Ring } from '@vostok/trace';
import { signedArea } from '@vostok/shapes';
import { DEFAULT_SETTINGS, coerceSettings, type LightboxSettings, type WireExit, type ArtworkRegion } from './state';
import type { LightboxBuild } from './geometry';

let settings: LightboxSettings = coerceSettings(DEFAULT_SETTINGS);
let sourceImage: RgbaImage | null = null;
let imageUrl: string | null = null;
let uploadedName = 'starter shape';
const client = workerClient<{ settings: LightboxSettings }, LightboxBuild>(
  () => new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' }),
);
const status = stageStatus('Building lightbox and diffuser...');
const preview = el('img', { className: 'led-preview', attrs: { alt: 'Uploaded image with internal colours' } }) as HTMLImageElement;
const previewWrap = el('div', { className: 'led-preview-wrap hidden' }, [preview]);
const stage = el('div', { className: 'led-stage' });
const viewer = createViewer(stage);
let refitNext = false;
let started = 0;
const loop = buildLoop<LightboxBuild>({
  run: () => {
    started = performance.now();
    // Freeze a snapshot for the worker. Changes during an ongoing build are rebuilt next.
    return client.call({ settings: structuredClone(settings) });
  },
  onResult: (result) => {
    viewer.setParts(result.parts, refitNext);
    refitNext = false;
    const triangles = result.parts.reduce((n, p) => n + p.indices.length / 3, 0);
    status.set(result.width.toFixed(0) + ' × ' + result.height.toFixed(0) + ' × ' + settings.depth.toFixed(0) +
      ' mm shell · ' + result.parts.length + ' printable parts · ' + triangles +
      ' triangles · ' + Math.round(performance.now() - started) + ' ms' +
      (result.warnings.length ? ' · ' + result.warnings.join(' ') : ''));
  },
  onError: (error) => status.set(error.message, 'error'),
});
function rebuild(refit = false) {
  if (refit) refitNext = true;
  loop.request();
}
function simplifyRing(ring: Ring, maxPoints: number): Ring {
  const stride = Math.max(1, Math.ceil(ring.length / maxPoints));
  return ring.filter((_, i) => i % stride === 0);
}
function keepLargest(rings: Ring[]): Ring {
  const filtered = rings.filter((r) => r.length >= 3)
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  if (!filtered.length) throw new Error('No silhouette detected. Use a clear opaque subject on a transparent or flat background.');
  const chosen = simplifyRing(filtered[0]!, 1800);
  if (Math.abs(signedArea(chosen)) < 0.0001) throw new Error('The traced subject is too small.');
  return chosen;
}
/** Use the SAME @vostok/trace call for the outline and all interior colour regions. */
function retrace(): void {
  if (!sourceImage) return;
  const result = processImage({
    width: sourceImage.width, height: sourceImage.height,
    data: new Uint8ClampedArray(sourceImage.data),
  }, settings.colorCount, {
    removeBg: settings.removeBackground,
    smoothing: 0.4,
    preserveDetail: true,
    designMm: settings.size,
  });
  // Commit the outline and the entire palette together: they share exact coordinates.
  const outline = keepLargest(result.outline);
  const artwork: ArtworkRegion[] = result.regions.map((region) => ({
    color: [...region.quantRgb],
    components: region.components.slice(0, 120).map((c) =>
      c.rings.slice(0, 20).map((ring) => simplifyRing(ring, 1800))).filter((rings) => rings.length > 0),
  })).filter((r) => r.components.length > 0);
  settings.outline = outline;
  settings.artwork = artwork;
  rebuild(true);
}
async function importFile(file: File) {
  try {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      throw new Error('Please choose a PNG, JPG or WebP image.');
    }
    const decoded = await loadFileToImage(file, 700);
    sourceImage = decoded;
    retrace();
    uploadedName = file.name;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(file);
    preview.src = imageUrl;
    previewWrap.classList.remove('hidden');
  } catch (error) {
    status.set(error instanceof Error ? error.message : String(error), 'error');
  }
}
const sliders = {
  size: sliderRow({ label: 'Longest side', min: 45, max: 250, step: 5, unit: 'mm', value: settings.size,
    onInput: (v) => { settings.size = v; rebuild(true); } }),
  depth: sliderRow({ label: 'Box depth', min: 10, max: 60, step: 1, unit: 'mm', value: settings.depth,
    onInput: (v) => { settings.depth = v; rebuild(); } }),
  wall: sliderRow({ label: 'Wall thickness', min: 1.2, max: 5, step: 0.2, unit: 'mm', value: settings.wall,
    onInput: (v) => { settings.wall = v; rebuild(); } }),
  back: sliderRow({ label: 'Back thickness', min: 1.2, max: 5, step: 0.2, unit: 'mm', value: settings.back,
    onInput: (v) => { settings.back = v; rebuild(); } }),
  ledgeWidth: sliderRow({ label: 'LED strip shelf width', min: 3, max: 12, step: 0.5, unit: 'mm', value: settings.ledgeWidth,
    help: 'Flat ledge inside the box for gluing LED tape, independent of the diffuser cover.',
    onInput: (v) => { settings.ledgeWidth = v; rebuild(); } }),
  ledgeHeight: sliderRow({ label: 'LED shelf rise', min: 0.8, max: 4, step: 0.2, unit: 'mm', value: settings.ledgeHeight,
    help: 'Height of the internal LED shelf above the back panel.',
    onInput: (v) => { settings.ledgeHeight = v; rebuild(); } }),
  diffuserThickness: sliderRow({ label: 'Diffuser thickness', min: 0.6, max: 3, step: 0.2, unit: 'mm', value: settings.diffuserThickness,
    help: 'Overall thickness of the glue-on diffuser, including the 0.4 mm colour inlay layer. Use white/translucent filament for backlighting.',
    onInput: (v) => { settings.diffuserThickness = v; rebuild(); } }),
  colorCount: sliderRow({ label: 'Image colour count', min: 1, max: 6, step: 1, value: settings.colorCount,
    help: 'Posterize the original image into this many filament colours using the built-in image preparation pipeline.',
    onInput: (v) => {
      settings.colorCount = v;
      if (sourceImage) {
        try { retrace(); } catch (e) { status.set(e instanceof Error ? e.message : String(e), 'error'); }
      } else {
        status.set('To change saved artwork colour separation, re-upload the original image.');
      }
    } }),
  holeDiameter: sliderRow({ label: 'Cable hole diameter', min: 2, max: 10, step: 0.5, unit: 'mm', value: settings.holeDiameter,
    onInput: (v) => { settings.holeDiameter = v; rebuild(); } }),
};
const wire = selectField<WireExit>({ label: 'Wire exit', value: settings.wireExit, options: [
  { value: 'none', label: 'No holes' }, { value: 'back', label: 'Back' },
  { value: 'side', label: 'Right side' }, { value: 'both', label: 'Back + right side' },
], onChange: (v) => { settings.wireExit = v; rebuild(); } });
const removeBg = toggleSwitch({
  label: 'Remove flat background', checked: settings.removeBackground,
  help: 'Uses the built-in image preparation system, including background matting, quantization and outline tracing.',
  onChange: (v) => {
    settings.removeBackground = v;
    try { retrace(); } catch (e) { status.set(e instanceof Error ? e.message : String(e), 'error'); }
  },
});
const includeColors = toggleSwitch({
  label: 'Preserve image colours', checked: settings.includeColors,
  help: 'Produce separate 0.4 mm inlaid 3MF parts for the traced colours, with a white/translucent diffuser beneath.',
  onChange: (v) => { settings.includeColors = v; rebuild(); },
});
function syncUI() {
  syncControls(settings, sliders);
  wire.setValue(settings.wireExit);
  removeBg.setValue(settings.removeBackground);
  includeColors.setValue(settings.includeColors);
}
const reset = button({
  label: 'Reset dimensions', emphasis: 'secondary', icon: ICONS.rotateLeft, block: true,
  onClick: () => {
    const { outline, artwork } = settings;
    settings = coerceSettings({ ...DEFAULT_SETTINGS, outline, artwork });
    syncUI();
    if (sourceImage) {
      try { retrace(); } catch (e) { status.set(e instanceof Error ? e.message : String(e), 'error'); }
    } else rebuild(true);
  },
});
const drop = dropZone({
  title: 'Upload artwork or a logo', text: 'or click to browse',
  note: 'PNG, JPG, WebP · internal colours are preserved',
  accept: 'image/png,image/jpeg,image/webp',
  onFiles: ([file]) => { if (file) void importFile(file); },
});
const note = el('p', { className: 'vl-hint',
  text: 'The largest outer silhouette becomes the box and glue-on cover. The built-in tracer keeps up to six simplified image colours as separate 3MF face parts. Very small colour islands are omitted. The cover is laid next to the shell for printing, not shown installed.' });
const starter = button({
  label: 'Use starter rectangle', emphasis: 'secondary', block: true,
  onClick: () => {
    settings.outline = coerceSettings(DEFAULT_SETTINGS).outline;
    settings.artwork = [];
    sourceImage = null;
    uploadedName = 'starter shape';
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
    previewWrap.classList.add('hidden');
    rebuild(true);
  },
});
const uploadSection = section({ title: 'Image artwork', body: [
  drop, previewWrap, note, removeBg, includeColors, sliders.colorCount, starter,
] });
const PROJECT_FILE: ProjectShape = {
  app: 'led-lightbox', keys: ['size', 'depth', 'outline'] satisfies (keyof LightboxSettings)[],
};
const footer = sidebarFooter({
  formats: [{ id: '3mf', label: '3MF' }],
  onExport: async (format) => {
    if (format !== '3mf') throw new Error('Unknown format');
    const result = await loop.settled();
    downloadThreeMF(result.parts, {
      title: 'Image LED Lightbox', generator: 'led-lightbox',
      application: 'Vostok Labs Standalone · LED Lightbox',
      buildId: import.meta.env.VITE_BUILD_ID,
      sourceModel: uploadedName,
      plateSize: plateSize(loadPlateChoice()),
    }, 'led-lightbox.3mf');
  },
  onSave: () => downloadFile(JSON.stringify(markProject(PROJECT_FILE, settings), null, 2),
    'led-lightbox-project.json', 'application/json'),
  onLoad: (file?: File) => file && readProjectFile(file, (data) => {
    settings = coerceSettings(data);
    sourceImage = null;
    uploadedName = 'saved artwork';
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
    previewWrap.classList.add('hidden');
    syncUI();
    rebuild(true);
    toast('Project loaded', { kind: 'ok' });
  }, PROJECT_FILE),
  onHelp: () => dialog({
    title: 'Image LED Lightbox help',
    content: 'Import a PNG/JPG/WebP. The outer silhouette makes a hollow shell; the built-in image preparation pipeline separates the interior image into simplified printable colours. Export creates a glue-on white/translucent diffuser with 0.4 mm colour inlays and a separate shell. Diffuser thickness includes the colour layer. Both lie on the print bed in the 3MF. After printing, glue the cover to the top rim. Use translucent filament and test LED temperature, light transmission, fit, and wire clearances before installing.',
    actions: [{ label: 'Got it', primary: true }],
  }),
  themeStorageKey: 'led-lightbox-theme',
});
const shell = appShell({
  topbar: el('header', { className: 'vl-topbar' }, [
    linkButton({ label: 'See all generators', href: '/', icon: ICONS.grid }),
  ]),
  left: {
    scroll: [
      generatorHeader({
        title: 'Image LED Lightbox',
        description: 'Turn a colour image into a hollow LED box, printable colour diffuser and cable exits.',
        hideCredit: true,
      }),
      collapsibleSection({ title: '1 · Box dimensions', body: [
        sliders.size, sliders.depth, sliders.wall, sliders.back,
      ] }),
      collapsibleSection({ title: '2 · LED mounting shelf', body: [
        sliders.ledgeWidth, sliders.ledgeHeight,
      ] }),
      collapsibleSection({ title: '3 · Diffuser cover', body: [
        sliders.diffuserThickness,
        el('p', { className: 'vl-hint',
          text: 'Separate glue-on diffuser with a 0.4 mm multicolour face. The full cover thickness is adjustable. Print in translucent white and use compatible colour filaments.' }),
      ] }),
      collapsibleSection({ title: '4 · Wiring', body: [wire, sliders.holeDiameter, reset] }),
    ],
    credit: panelCredit({ title: 'Image LED Lightbox' }),
  },
  stage: [
    stage,
    el('p', { className: 'vl-stage__label', text: 'Shell + printable diffuser · laid side by side' }),
    status.root,
    el('p', { className: 'vl-stage__hint', text: 'Drag to rotate · scroll to zoom' }),
  ],
  right: { scroll: [uploadSection], footer: [footer] },
});
document.getElementById('app')!.append(shell.root);
mountPlatePicker(shell.stage, viewer);
rebuild(true);
