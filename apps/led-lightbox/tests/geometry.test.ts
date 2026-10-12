import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { buildLightbox } from '../src/geometry';
import { sampleMarqueeHoles, marqueeCircles } from '../src/marquee';
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
// Registration fits are printed face-down, with the mating feature exposed on top.
for (const placement of ['cover', 'box'] as const) {
  const result = buildLightbox(wasm, {
    ...coerceSettings(DEFAULT_SETTINGS), artwork, lipPlacement: placement,
    lipWidth: 1.2, lipHeight: 0.6, lipClearance: 0.2,
  });
  assert.equal(result.parts.length, 4, placement + ' mode keeps filament colour regions');
  const shell = bounds(result.parts[0]!.positions);
  const white = bounds(result.parts[1]!.positions);
  assert.equal(shell.min[2], 0);
  assert.equal(white.min[2], 0);
  if (placement === 'cover') {
    assert.ok(white.max[2]! > DEFAULT_SETTINGS.diffuserThickness + 0.5, 'cover tongue projects above diffuser in print orientation');
    assert.ok(shell.max[2]! <= DEFAULT_SETTINGS.depth + 0.01, 'box unchanged in cover-tongue mode');
  } else {
    assert.ok(shell.max[2]! > DEFAULT_SETTINGS.depth + 0.5, 'shell ridge projects above rim');
    assert.ok(white.max[2]! <= DEFAULT_SETTINGS.diffuserThickness + 0.01, 'diffuser contains matching recess without added height');
  }
  for (const part of result.parts.slice(2)) {
    assert.ok(bounds(part.positions).max[2]! <= 0.401, 'color face prints face-down with registration lip');
  }
  verifyMeshes(result);
}
const boxGroove = buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS), lipPlacement: 'box' });
const flatCover = buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS) });
function meshVolume(p: (typeof flatCover.parts)[number]) {
  const mesh = new wasm.Mesh({numProp:3, vertProperties:p.positions, triVerts:p.indices});
  const m = wasm.Manifold.ofMesh(mesh);
  const v = m.volume();
  m.delete();
  return v;
}
assert.ok(meshVolume(boxGroove.parts[1]!) < meshVolume(flatCover.parts[1]!),
  'receiving groove removes material from the diffuser');
assert.throws(() => buildLightbox(wasm, {
  ...coerceSettings(DEFAULT_SETTINGS), lipPlacement: 'box', lipHeight: 1.2, diffuserThickness: 1.2,
}), /thicker diffuser|solid roof/i);
assert.throws(() => buildLightbox(wasm, {
  ...coerceSettings(DEFAULT_SETTINGS), lipPlacement: 'cover', lipWidth: 45,
}), /lip/i);
const lipProject = coerceSettings({
  ...DEFAULT_SETTINGS, lipPlacement: 'cover', lipWidth: 1.8, lipHeight: 1,
  lipClearance: 0.15, smoothing: 0.25, limitedColors: [[242, 105, 13]],
  preprocess: { contrast: 1.4, exposure: 1.1, keepBackground: true },
});
assert.equal(lipProject.lipPlacement, 'cover');
assert.equal(lipProject.lipWidth, 1.8);
assert.equal(lipProject.lipHeight, 1);
assert.equal(lipProject.lipClearance, 0.15);
assert.equal(lipProject.smoothing, 0.25);
assert.deepEqual(lipProject.limitedColors, [[242, 105, 13]]);
assert.equal(lipProject.preprocess.contrast, 1.4);
assert.equal(lipProject.preprocess.keepBackground, true);
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

// Border width must physically inset the colour geometry; a black border is a
// separate non-overlapping printable face layer, not just a UI preview.
const ordinary = buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS), artwork });
const whiteBorder = buildLightbox(wasm, {
  ...coerceSettings(DEFAULT_SETTINGS), artwork, borderColor: 'white', borderWidth: 4,
});
const blackBorder = buildLightbox(wasm, {
  ...coerceSettings(DEFAULT_SETTINGS), artwork, borderColor: 'black', borderWidth: 4,
});
assert.equal(whiteBorder.parts.length, 4, 'white border uses the existing diffuser filament');
assert.equal(blackBorder.parts.length, 5, 'black border has its own filament part');
assert.deepEqual(blackBorder.parts[4]!.color, [24, 24, 24]);
assert.equal(blackBorder.parts[4]!.group, 'Diffuser cover');
assert.ok(bounds(whiteBorder.parts[2]!.positions).min[0]! >
  bounds(ordinary.parts[2]!.positions).min[0]! + 2,
  'border width actually moves the image in from the outside edge');
verifyMeshes(whiteBorder);
verifyMeshes(blackBorder);
for (const lipPlacement of ['none', 'cover', 'box'] as const) {
  const borderBuild = buildLightbox(wasm, {
    ...coerceSettings(DEFAULT_SETTINGS), artwork, borderColor: 'black', borderWidth: 3,
    lipPlacement, diffuserThickness: 2,
  });
  assert.equal(borderBuild.parts.length, 5);
  verifyMeshes(borderBuild);
}
const dualBase = { ...coerceSettings(DEFAULT_SETTINGS), wireExit: 'dual' as const };
const bothAtSameSpot = buildLightbox(wasm, {
  ...dualBase, hole1Angle: 0, hole2Angle: 0, hole1Depth: 0, hole2Depth: 0,
});
// A single positioned side exit only drills Hole 1. Hole 2 controls do not
// influence its geometry, while Hole 1 angle/back position do.
const singleBase = { ...coerceSettings(DEFAULT_SETTINGS), wireExit: 'single' as const };
const singleRight = buildLightbox(wasm, {
  ...singleBase, hole1Angle: 0, hole1Depth: 0, hole2Angle: 180, hole2Depth: 100,
});
const singleUnchanged = buildLightbox(wasm, {
  ...singleBase, hole1Angle: 0, hole1Depth: 0, hole2Angle: 75, hole2Depth: 10,
});
const singleTop = buildLightbox(wasm, {
  ...singleBase, hole1Angle: 90, hole1Depth: 100,
});
assert.equal(singleRight.parts.length, 2);
assert.deepEqual(Array.from(singleRight.parts[0]!.positions),
  Array.from(singleUnchanged.parts[0]!.positions),
  'unused second hole must not affect single mode');
assert.notDeepEqual(Array.from(singleRight.parts[0]!.positions),
  Array.from(singleTop.parts[0]!.positions),
  'Hole 1 position changes the actual drilled geometry');
verifyMeshes(singleRight);
verifyMeshes(singleTop);
const twoSeparate = buildLightbox(wasm, {
  ...dualBase, hole1Angle: 0, hole2Angle: 90, hole1Depth: 0, hole2Depth: 100,
});
const angled = buildLightbox(wasm, {
  ...dualBase, hole1Angle: 45, hole2Angle: 220, hole1Depth: 20, hole2Depth: 80,
});
assert.equal(twoSeparate.parts.length, 2);
assert.ok(meshVolume(twoSeparate.parts[0]!) < meshVolume(singleRight.parts[0]!),
  'two positioned exits remove more material than one positioned exit');
assert.ok(meshVolume(twoSeparate.parts[0]!) < meshVolume(bothAtSameSpot.parts[0]!),
  'independent angle/depth makes two exits instead of the same single cut');
assert.ok(meshVolume(angled.parts[0]!) < meshVolume(flatCover.parts[0]!),
  'angled exits remove shell material');
verifyMeshes(twoSeparate);
verifyMeshes(angled);
assert.throws(() => buildLightbox(wasm, {
  ...dualBase, depth: 10, back: 4, holeDiameter: 10,
}), /depth|diameter/i);
const settingsRoundTrip = coerceSettings({
  ...DEFAULT_SETTINGS, wireExit: 'dual', borderColor: 'black', borderWidth: 5,
  hole1Angle: 315, hole2Angle: 80, hole1Depth: 12, hole2Depth: 88,
});
assert.equal(settingsRoundTrip.wireExit, 'dual');
assert.equal(settingsRoundTrip.borderColor, 'black');
assert.equal(settingsRoundTrip.borderWidth, 5);
assert.deepEqual(
  [settingsRoundTrip.hole1Angle, settingsRoundTrip.hole2Angle, settingsRoundTrip.hole1Depth, settingsRoundTrip.hole2Depth],
  [315, 80, 12, 88],
);
const bounded = coerceSettings({ wireExit: 'dual', borderColor: 'invalid',
  hole1Angle: -5, hole2Angle: 1000, hole1Depth: -2, hole2Depth: 999, borderWidth: 300 });
assert.equal(bounded.borderColor, 'none');
assert.deepEqual([bounded.hole1Angle, bounded.hole2Angle, bounded.hole1Depth, bounded.hole2Depth, bounded.borderWidth],
  [0, 359, 0, 100, 12]);
assert.equal(coerceSettings({ wireExit: 'single' }).wireExit, 'single');
assert.equal(coerceSettings({ size: 600 }).size, 600);
assert.equal(coerceSettings({ size: 650 }).size, 600);

// Marquee positions are true evenly spaced, separate front-cover through-holes.
const guideSquare: [number, number][] = [[-20,-20],[20,-20],[20,20],[-20,20]];
const locations = sampleMarqueeHoles([guideSquare], 16, 2,
  [[-30,-30],[30,-30],[30,30],[-30,30]], 3);
assert.equal(locations.length, 16, 'exact total number of holes');
assert.equal(marqueeCircles(locations, 2).length, 16);
assert.deepEqual(locations.slice(0, 4),
  [[-15,-20],[-5,-20],[5,-20],[15,-20]],
  'four equally spaced lights along the first side');
assert.deepEqual(locations[4], [20,-15],
  'arc-length spacing continues correctly round a corner');
assert.throws(() => sampleMarqueeHoles([guideSquare], 240, 4,
  [[-30,-30],[30,-30],[30,30],[-30,30]], 3), /overlap|closely spaced/i);
assert.throws(() => sampleMarqueeHoles([guideSquare], 8, 4,
  [[-21,-21],[21,-21],[21,21],[-21,21]], 3), /edge/i);
const oldMarquee = coerceSettings({ ...DEFAULT_SETTINGS, marqueeLayout: 'invalid' });
assert.equal(oldMarquee.marqueeLayout, 'none', 'old projects stay unchanged');
const marqueeProject = coerceSettings({ ...DEFAULT_SETTINGS,
  marqueeLayout: 'regions', marqueeCount: 37, marqueeDiameter: 3.5, marqueeInset: 7 });
assert.deepEqual([marqueeProject.marqueeLayout, marqueeProject.marqueeCount,
  marqueeProject.marqueeDiameter, marqueeProject.marqueeInset], ['regions', 37, 3.5, 7]);
const boundMarquee = coerceSettings({
  marqueeLayout: 'outer', marqueeCount: 999, marqueeDiameter: -2, marqueeInset: 99,
});
assert.deepEqual([boundMarquee.marqueeCount, boundMarquee.marqueeDiameter,
  boundMarquee.marqueeInset], [240, 1.5, 20]);

// Positive and negative arc-length phases move every hole in 0.1 mm steps
// and correctly wrap when a full perimeter has been traversed.
const shifted = sampleMarqueeHoles([guideSquare], 16, 2,
  [[-30,-30],[30,-30],[30,30],[-30,30]], 3, 0.1);
assert.equal(shifted.length, locations.length);
assert.ok(Math.abs(shifted[0]![0] - locations[0]![0] - 0.1) < 1e-8);
assert.ok(Math.abs(shifted[0]![1] - locations[0]![1]) < 1e-8);
const negativeShift = sampleMarqueeHoles([guideSquare], 16, 2,
  [[-30,-30],[30,-30],[30,30],[-30,30]], 3, -0.1);
assert.ok(Math.abs(negativeShift[0]![0] - locations[0]![0] + 0.1) < 1e-8);
const wrappedShift = sampleMarqueeHoles([guideSquare], 16, 2,
  [[-30,-30],[30,-30],[30,30],[-30,30]], 3, 160.1);
for (let i = 0; i < shifted.length; i++) {
  assert.ok(Math.hypot(shifted[i]![0] - wrappedShift[i]![0],
    shifted[i]![1] - wrappedShift[i]![1]) < 1e-7, 'a full loop wraps the pattern');
}
const shiftSettings = coerceSettings({ ...DEFAULT_SETTINGS,
  marqueeLayout: 'outer', marqueeDiameter: 3.16, marqueeInset: 6.24, marqueeShift: -12.36 });
assert.deepEqual([shiftSettings.marqueeDiameter, shiftSettings.marqueeInset, shiftSettings.marqueeShift],
  [3.2, 6.2, -12.4], 'marquee controls save at 0.1 mm precision');
assert.equal(coerceSettings({ marqueeShift: 999 }).marqueeShift, 100);
assert.equal(coerceSettings({ marqueeShift: -999 }).marqueeShift, -100);
assert.equal(coerceSettings({ marqueeShift: 'invalid' }).marqueeShift, 0);

const marqueeOuter = buildLightbox(wasm, {
  ...coerceSettings(DEFAULT_SETTINGS), marqueeLayout: 'outer',
  marqueeCount: 32, marqueeDiameter: 2.5, marqueeInset: 5,
});
assert.equal(marqueeOuter.parts.length, 2);
assert.ok(meshVolume(marqueeOuter.parts[1]!) < meshVolume(flatCover.parts[1]!) - 100,
  'outer marquee bores physically remove material from the diffuser');
assert.ok(marqueeOuter.warnings.some(w => w.includes('32 marquee holes')));
verifyMeshes(marqueeOuter);
const shiftedMarquee = buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS),
  marqueeLayout: 'outer', marqueeCount: 24, marqueeDiameter: 3.1,
  marqueeInset: 6.2, marqueeShift: 0.1 });
const unshiftedMarquee = buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS),
  marqueeLayout: 'outer', marqueeCount: 24, marqueeDiameter: 3.1,
  marqueeInset: 6.2, marqueeShift: 0 });
assert.notDeepEqual(Array.from(shiftedMarquee.parts[1]!.positions),
  Array.from(unshiftedMarquee.parts[1]!.positions),
  '0.1 mm pattern shift changes the printable diffuser');
verifyMeshes(shiftedMarquee);
const bigBox = buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS),
  size: 600, wireExit: 'single', hole1Angle: 45, hole1Depth: 45,
  marqueeLayout: 'outer', marqueeCount: 24, marqueeDiameter: 3.1,
  marqueeInset: 6.2, marqueeShift: 0.1 });
assert.ok(Math.abs(bigBox.width - 600) < 0.001, '600 mm output preserves its true size');
assert.ok(bigBox.warnings.some(w => /print bed/i.test(w)),
  'oversized printed parts warn of bed requirements');
verifyMeshes(bigBox);
for (const lipPlacement of ['cover', 'box'] as const) {
  const marqueeLip = buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS),
    marqueeLayout: 'outer', marqueeCount: 12, marqueeDiameter: 2.5,
    marqueeInset: 7, lipPlacement, diffuserThickness: 2,
  });
  assert.equal(marqueeLip.parts.length, 2);
  verifyMeshes(marqueeLip);
}
const blackMarquee = buildLightbox(wasm, {
  ...coerceSettings(DEFAULT_SETTINGS), artwork,
  marqueeLayout: 'border', marqueeCount: 24,
  marqueeDiameter: 2.5, marqueeInset: 5,
  borderColor: 'black', borderWidth: 9,
});
assert.equal(blackMarquee.parts.length, 5);
assert.ok(meshVolume(blackMarquee.parts[4]!) <
  meshVolume(buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS), artwork,
    borderColor: 'black', borderWidth: 9 }).parts[4]!),
  'black filament border must also be drilled');
verifyMeshes(blackMarquee);
assert.throws(() => buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS),
  marqueeLayout: 'border', borderColor: 'none' }), /black artwork border/i);
assert.throws(() => buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS),
  artwork, marqueeLayout: 'border', borderColor: 'black', borderWidth: 4 }), /wider black border/i);

const colourMarquee = buildLightbox(wasm, {
  ...coerceSettings(DEFAULT_SETTINGS), artwork, marqueeLayout: 'regions',
  marqueeCount: 24, marqueeDiameter: 2.5, marqueeInset: 6,
});
assert.equal(colourMarquee.parts.length, 4, 'keeps coloured 3MF parts');
for (let i = 1; i < 4; i++) {
  assert.ok(meshVolume(colourMarquee.parts[i]!) <
    meshVolume(ordinary.parts[i]!), 'drills diffuser or coloured face layer ' + i);
}
verifyMeshes(colourMarquee);
assert.throws(() => buildLightbox(wasm, { ...coerceSettings(DEFAULT_SETTINGS),
  marqueeLayout: 'regions' }), /requires printable traced/i);

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
console.log('LED lightbox: image tracing, colour diffuser, both registration-lip placements, groove clearance, thickness, printable orientation, dual-positioned wire exits, black/white artwork borders, 600 mm parts, single/dual wiring, 0.1 mm marquee positioning and project settings passed.');
