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
import { openPrepareImage } from '@vostok/ui-kit/prepare-image';
import { DEFAULT_SETTINGS, coerceSettings, type LightboxSettings, type WireExit, type BorderColor, type LipPlacement, type ArtworkRegion } from './state';
import type { LightboxBuild } from './geometry';

let settings: LightboxSettings = coerceSettings(DEFAULT_SETTINGS);
let sourceImage: RgbaImage | null = null;
let preparedImage: RgbaImage | null = null;
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
function keepLargest(rings: Ring[]): Ring {
  const filtered = rings.filter((r) => r.length >= 3)
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  if (!filtered.length) throw new Error('No silhouette detected. Use a clear opaque subject on a transparent or flat background.');
  const outer = filtered[0]!;
  const stride = Math.max(1, Math.ceil(outer.length / 1800));
  const chosen = outer.filter((_, i) => i % stride === 0);
  if (Math.abs(signedArea(chosen)) < 0.0001) throw new Error('The traced subject is too small.');
  return chosen;
}
/** Use the SAME @vostok/trace call for the outline and all interior colour regions. */
function retrace(): void {
  if (!preparedImage) return;
  const result = processImage({
    width: preparedImage.width, height: preparedImage.height,
    data: new Uint8ClampedArray(preparedImage.data),
  }, settings.colorCount, {
    removeBg: settings.removeBackground,
    smoothing: settings.smoothing,
    preserveDetail: true,
    designMm: settings.size,
    customColors: settings.limitedColors.length ? settings.limitedColors : undefined,
  });
  // Commit the outline and the entire palette together: they share exact coordinates.
  const outline = keepLargest(result.outline);
  const artwork: ArtworkRegion[] = result.regions.map((region) => ({
    color: [...region.quantRgb] as ArtworkRegion['color'],
    components: region.components.slice(0, 120).map((c) =>
      c.rings.slice(0, 20).map((ring) => {
        const stride = Math.max(1, Math.ceil(ring.length / 1800));
        return ring.filter((_, i) => i % stride === 0);
      })).filter((rings) => rings.length > 0),
  })).filter((r) => r.components.length > 0);
  settings.outline = outline;
  settings.artwork = artwork;
  rebuild(true);
}
function prepareImage(base: RgbaImage, file?: File) {
  const reopening = base === sourceImage;
  openPrepareImage({
    baseImage: base,
    maxColors: 6,
    initialColorCount: settings.colorCount,
    initialSmoothing: settings.smoothing,
    initialRemoveBg: settings.removeBackground,
    initialPreprocess: reopening ? settings.preprocess : undefined,
    initialLimitedColors: reopening && settings.limitedColors.length ? settings.limitedColors : undefined,
    designMm: settings.size,
    onComplete: ({ adjusted, preprocess, colorCount, smoothing, limitedColors }) => {
      // Keep the exact adjusted image, background setting and selected palette
      // displayed by the modal, so the 3MF geometry matches its "Result" view.
      sourceImage = base;
      preparedImage = adjusted;
      settings.preprocess = preprocess;
      settings.removeBackground = !preprocess.keepBackground;
      settings.smoothing = smoothing;
      settings.colorCount = colorCount;
      settings.limitedColors = limitedColors ?? [];
      if (file) {
        uploadedName = file.name;
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        imageUrl = URL.createObjectURL(file);
        preview.src = imageUrl;
        previewWrap.classList.remove('hidden');
      }
      try { retrace(); } catch (error) {
        status.set(error instanceof Error ? error.message : String(error), 'error');
      }
    },
  });
}
async function importFile(file: File) {
  try {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      throw new Error('Please choose a PNG, JPG or WebP image.');
    }
    const decoded = await loadFileToImage(file, 700);
    prepareImage(decoded, file);
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
    help: 'Overall thickness including the colour inlays. Box-lip mode requires at least the lip height plus 0.55 mm.',
    onInput: (v) => { settings.diffuserThickness = v; rebuild(); } }),
  borderWidth: sliderRow({ label: 'Artwork border width', min: 0.5, max: 12, step: 0.5, unit: 'mm', value: settings.borderWidth,
    help: 'Inset printed image colours from the diffuser edge. Black adds a separately printable border part.',
    onInput: (v) => { settings.borderWidth = v; rebuild(); } }),
  lipWidth: sliderRow({ label: 'Registration lip width', min: 0.6, max: 2.4, step: 0.2, unit: 'mm', value: settings.lipWidth,
    help: 'Radial thickness of the male tongue/ridge. Keep small for intricate silhouettes.',
    onInput: (v) => { settings.lipWidth = v; rebuild(); } }),
  lipHeight: sliderRow({ label: 'Registration lip height', min: 0.4, max: 2.4, step: 0.2, unit: 'mm', value: settings.lipHeight,
    help: 'How far the lip extends into its socket. Box-lip height must be less than diffuser thickness minus 0.55 mm.',
    onInput: (v) => { settings.lipHeight = v; rebuild(); } }),
  lipClearance: sliderRow({ label: 'Fit tolerance (per side)', min: 0, max: 0.5, step: 0.05, unit: 'mm', value: settings.lipClearance,
    help: 'Radial gap on each mating wall. Start with 0.15–0.2 mm; lower for tighter press fit, higher for easy removal.',
    onInput: (v) => { settings.lipClearance = v; rebuild(); } }),
  holeDiameter: sliderRow({ label: 'Cable hole diameter', min: 2, max: 10, step: 0.5, unit: 'mm', value: settings.holeDiameter,
    onInput: (v) => { settings.holeDiameter = v; rebuild(); } }),
  hole1Angle: sliderRow({ label: 'Hole 1 angle', min: 0, max: 359, step: 1, unit: '°', value: settings.hole1Angle,
    help: 'From the front: 0° right, 90° top, 180° left, 270° bottom.',
    onInput: (v) => { settings.hole1Angle = v; rebuild(); } }),
  hole1Depth: sliderRow({ label: 'Hole 1 from back', min: 0, max: 100, step: 1, unit: '%', value: settings.hole1Depth,
    help: '0% near the rear panel, 100% near the front opening; maintains clearance as box depth changes.',
    onInput: (v) => { settings.hole1Depth = v; rebuild(); } }),
  hole2Angle: sliderRow({ label: 'Hole 2 angle', min: 0, max: 359, step: 1, unit: '°', value: settings.hole2Angle,
    help: 'Second hole independently located around the silhouette.',
    onInput: (v) => { settings.hole2Angle = v; rebuild(); } }),
  hole2Depth: sliderRow({ label: 'Hole 2 from back', min: 0, max: 100, step: 1, unit: '%', value: settings.hole2Depth,
    help: 'Second hole independently located between rear and front.',
    onInput: (v) => { settings.hole2Depth = v; rebuild(); } }),
};
const wire = selectField<WireExit>({ label: 'Wire exit', value: settings.wireExit, options: [
  { value: 'none', label: 'No holes' }, { value: 'back', label: 'Back' },
  { value: 'side', label: 'Right side' }, { value: 'both', label: 'Back + right side' },
  { value: 'dual', label: 'Two positioned side holes' },
], onChange: (v) => { settings.wireExit = v; rebuild(); } });
const borderMode = selectField<BorderColor>({ label: 'Artwork border', value: settings.borderColor, options: [
  { value: 'none', label: 'None (original narrow white edge)' },
  { value: 'white', label: 'White / translucent border' },
  { value: 'black', label: 'Black border (separate filament)' },
], onChange: (v) => { settings.borderColor = v; rebuild(); } });
const lipMode = selectField<LipPlacement>({ label: 'Registration lip', value: settings.lipPlacement, options: [
  { value: 'none', label: 'None · glue-on cover' },
  { value: 'cover', label: 'On diffuser underside · press into box' },
  { value: 'box', label: 'On box rim · fit into diffuser groove' },
], onChange: (v) => { settings.lipPlacement = v; rebuild(); } });
const includeColors = toggleSwitch({
  label: 'Preserve image colours', checked: settings.includeColors,
  help: 'Produce separate 0.4 mm inlaid 3MF parts for the traced colours, with a white/translucent diffuser beneath.',
  onChange: (v) => { settings.includeColors = v; rebuild(); },
});
function syncUI() {
  syncControls(settings, sliders);
  wire.setValue(settings.wireExit);
  borderMode.setValue(settings.borderColor);
  lipMode.setValue(settings.lipPlacement);
  includeColors.setValue(settings.includeColors);
}
const reset = button({
  label: 'Reset dimensions', emphasis: 'secondary', icon: ICONS.rotateLeft, block: true,
  onClick: () => {
    const { outline, artwork, preprocess, limitedColors, colorCount, smoothing, removeBackground, includeColors } = settings;
    settings = coerceSettings({ ...DEFAULT_SETTINGS, outline, artwork, preprocess, limitedColors, colorCount, smoothing, removeBackground, includeColors });
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
  text: 'Uploading opens the same Prepare Image dialog used by Clicker: choose colours to keep, remove background, adjust smoothing and picture tone, and inspect the actual traced Result. After confirmation, the matching print parts appear in 3D.' });
const starter = button({
  label: 'Use starter rectangle', emphasis: 'secondary', block: true,
  onClick: () => {
    settings.outline = coerceSettings(DEFAULT_SETTINGS).outline;
    settings.artwork = [];
    settings.limitedColors = [];
    sourceImage = null;
    preparedImage = null;
    uploadedName = 'starter shape';
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
    previewWrap.classList.add('hidden');
    rebuild(true);
  },
});
const adjust = button({ label: 'Prepare / adjust image', emphasis: 'secondary', block: true,
  onClick: () => {
    if (sourceImage) prepareImage(sourceImage);
    else status.set('Upload an image to open Prepare Image.');
  },
});
const uploadSection = section({ title: 'Image artwork', body: [
  drop, previewWrap, adjust, note, includeColors, starter,
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
    preparedImage = null;
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
    content: 'Choose a white or black border to inset the artwork. Black is a separate filament part. Two radial side holes can be independently angled and positioned from back (0%) to front (100%). Upload artwork to open the Clicker-style Prepare Image dialog. Choose kept filament colours, background removal, smoothing and tone, then confirm the preview. The model includes a separate translucent diffuser with colour inlays. No lip: glue the cover. Lip on cover: a male tongue enters the hollow box. Lip on box: a male ridge engages a recess in the diffuser. Clearance is radial per side; 0.15–0.2 mm is a starting range, not a guaranteed fit. Box-lip mode requires diffuser thickness at least lip height + 0.55 mm. Print a small tolerance sample before committing a full model. The print-layout preview shows shell and cover side by side.',
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
      collapsibleSection({ title: '3 · Diffuser cover & registration', body: [
        sliders.diffuserThickness, borderMode, sliders.borderWidth,
        lipMode, sliders.lipWidth, sliders.lipHeight, sliders.lipClearance,
        el('p', { className: 'vl-hint',
          text: 'For a clean fit, choose which part carries the male lip. The cover is printed artwork face-down when using a lip; both pieces still export separately. Press fit depends on filament shrinkage and printer calibration.' }),
      ] }),
      collapsibleSection({ title: '4 · Wiring', body: [wire, sliders.holeDiameter,
        el('p', { className: 'vl-hint', text: 'In Two positioned side holes mode, set each angle around the box and independently place it between the back panel and front.' }),
        sliders.hole1Angle, sliders.hole1Depth, sliders.hole2Angle, sliders.hole2Depth, reset] }),
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
