import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { buildLightbox } from '../src/geometry';
import { DEFAULT_SETTINGS, coerceSettings, type ArtworkRegion } from '../src/state';
import { processImage } from '../../../packages/trace/src/pipeline';

const wasm = await Module();
wasm.setup();
function bounds(positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, positions[i + k]!);
      max[k] = Math.max(max[k]!, positions[i + k]!);
    }
  }
  return { min, max };
}
function verifyMeshes(result: ReturnType<typeof buildLightbox>) {
  for (const part of result.parts) {
    assert.ok(part.indices.length >= 12, 'non-empty solid for ' + part.name);
    const mesh = new wasm.Mesh({ numProp: 3, vertProperties: part.positions, triVerts: part.indices });
    mesh.merge();
    const solid = wasm.Manifold.ofMesh(mesh);
    assert.equal(solid.status(), 'NoError', 'watertight ' + part.name);
    assert.ok(solid.volume() > 0, 'volume ' + part.name);
    solid.delete();
  }
}
for (const wireExit of ['none', 'back', 'side', 'both'] as const) {
  const result = buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS), wireExit });
  assert.equal(result.parts.length, 2, 'shell + separate diffuser');
  assert.equal(result.parts[0]!.group, 'Lightbox shell');
  assert.equal(result.parts[1]!.group, 'Diffuser cover');
  const shell = bounds(result.parts[0]!.positions);
  const cover = bounds(result.parts[1]!.positions);
  assert.equal(shell.min[2], 0);
  assert.ok(shell.max[2]! >= DEFAULT_SETTINGS.depth - 0.01);
  assert.equal(cover.min[2], 0, 'diffuser must be on bed, never floating on shell');
  assert.ok(Math.abs(cover.max[2]! - DEFAULT_SETTINGS.diffuserThickness) < 0.005);
  assert.ok(cover.min[0]! > shell.max[0]! || cover.min[1]! > shell.max[1]!, 'separate objects on plate');
  assert.ok(result.width > 90 && result.height > 40);
  verifyMeshes(result);
}
const artwork: ArtworkRegion[] = [
  { color: [220, 40, 60], components: [[
    [[-0.5,-0.32], [0,-0.32], [0,0.32], [-0.5,0.32]],
  ]] },
  { color: [40, 90, 220], components: [[
    [[0,-0.32], [0.5,-0.32], [0.5,0.32], [0,0.32]],
  ]] },
];
for (const thickness of [0.6, 1.2, 2.6]) {
  const result = buildLightbox(wasm, {
    ...coerceSettings(DEFAULT_SETTINGS), wireExit: 'both',
    diffuserThickness: thickness, artwork,
  });
  assert.equal(result.parts.length, 4, 'shell, white diffuser, two filament colors');
  assert.deepEqual(result.parts.slice(2).map((p) => p.color), [[220,40,60], [40,90,220]]);
  assert.ok(result.parts.slice(1).every(p => p.group === 'Diffuser cover'));
  assert.ok(result.parts.slice(1).every(p => bounds(p.positions).max[2]! <= thickness + 0.001),
    'inlaid artwork stays within configured overall diffuser thickness');
  assert.ok(result.parts.slice(2).every(p => bounds(p.positions).min[2]! >= thickness - 0.401));
  verifyMeshes(result);
}
const noColour = buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS), artwork, includeColors: false });
assert.equal(noColour.parts.length, 2);
assert.throws(() => buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS), ledgeWidth: 90 }), /ledge/i);
assert.throws(() => buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS), diffuserThickness: 0.2 }), /diffuser/i);
const restored = coerceSettings({ ...DEFAULT_SETTINGS, artwork, diffuserThickness: 2.2,
  outline: [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]] });
assert.equal(restored.outline.length, 4);
assert.equal(restored.artwork.length, 2);
assert.equal(restored.diffuserThickness, 2.2);
assert.equal(coerceSettings({ artwork: [{ color: [999,1,2], components: [] }] }).artwork.length, 0);

// One known two-color alpha logo run through the ORIGINAL @vostok/trace pipeline.
// Both the shell silhouette and the artwork regions must come from this single result.
const W = 96, H = 72;
const pixels = new Uint8ClampedArray(W * H * 4);
for (let y = 9; y < 63; y++) for (let x = 12; x < 84; x++) {
  const i = (y * W + x) * 4;
  pixels[i] = x < 48 ? 236 : 42;
  pixels[i+1] = x < 48 ? 48 : 99;
  pixels[i+2] = x < 48 ? 57 : 223;
  pixels[i+3] = 255;
}
const traced = processImage({data: pixels, width:W, height:H}, 2,
  {removeBg:true, smoothing:0.4, preserveDetail:true, designMm:120});
assert.ok(traced.outline.length > 0, 'tracer returns shell silhouette');
assert.ok(traced.regions.length >= 2, 'tracer retains both image colors');
console.log('LED lightbox: shell, 2-colour inlaid diffuser, 3 thicknesses, cable exits, print separation, image tracing and saved settings passed.');
