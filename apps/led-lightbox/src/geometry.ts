// A print-ready open lightbox plus a separate glue-on diffuser with multicolour inlays.
// Both sit on Z=0, next to each other on the build plate. The diffuser's total
// thickness INCLUDES its 0.4 mm colour face; no floating or overlapping slicer parts.
import { csOf, extrude, ringsOf, withScope } from '@vostok/manifold';
import { poleOf, signedArea } from '@vostok/shapes';
import { exportPartOf, type ExportPart, type RGB } from '@vostok/export';
import type { LightboxSettings } from './state';

type Ring = [number, number][];
export interface LightboxBuild {
  parts: ExportPart[];
  width: number;
  height: number;
  warnings: string[];
}
const FACE_LAYER = 0.4;
const PLATE_GAP = 12;
const WHITE: RGB = [244, 246, 237];
const SHELL: RGB = [66, 84, 110];
const BLACK: RGB = [24, 24, 24];

/** First intersection of a ray from an interior point with the silhouette boundary. */
function rayDistance(outline: Ring, origin: [number, number], direction: [number, number]): number {
  let nearest = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const cross = direction[0] * ey - direction[1] * ex;
    if (Math.abs(cross) < 1e-9) continue;
    const ox = a[0] - origin[0], oy = a[1] - origin[1];
    const t = (ox * ey - oy * ex) / cross;
    const u = (ox * direction[1] - oy * direction[0]) / cross;
    if (t > 1e-5 && u >= -1e-7 && u <= 1 + 1e-7) nearest = Math.min(nearest, t);
  }
  return nearest;
}
function projected(points: Ring, cx: number, cy: number, scale: number): Ring {
  return points.map(([x, y]) => [(x - cx) * scale, (y - cy) * scale]);
}
function makePart(solid: any, name: string, color: RGB, group: string): ExportPart | null {
  if (solid.isEmpty() || solid.status() !== 'NoError') return null;
  const mesh = solid.getMesh();
  return mesh.triVerts.length ? exportPartOf(mesh, { name, color, group }) : null;
}
export function buildLightbox(wasm: any, settings: LightboxSettings): LightboxBuild {
  const { outline, size, depth, wall, back, ledgeWidth, ledgeHeight, wireExit, holeDiameter,
    diffuserThickness, includeColors, artwork, lipPlacement, lipWidth, lipHeight, lipClearance,
    borderColor, borderWidth, hole1Angle, hole2Angle, hole1Depth, hole2Depth } = settings;
  if (outline.length < 3) throw new Error('Load an image with a solid outer silhouette.');
  const maxX = Math.max(...outline.map((p) => p[0]));
  const minX = Math.min(...outline.map((p) => p[0]));
  const maxY = Math.max(...outline.map((p) => p[1]));
  const minY = Math.min(...outline.map((p) => p[1]));
  const extX = maxX - minX, extY = maxY - minY;
  const longest = Math.max(extX, extY);
  if (!(longest > 0.001) || back + ledgeHeight >= depth - 1) {
    throw new Error('Increase box depth or decrease the back and LED ledge heights.');
  }
  if (!(diffuserThickness >= FACE_LAYER + 0.19)) throw new Error('Diffuser must be at least 0.6 mm thick.');
  if (lipPlacement === 'box' && diffuserThickness - lipHeight - 0.05 < 0.5) {
    throw new Error('Lip on box requires a thicker diffuser (at least lip height + 0.55 mm) to leave a solid roof over its receiving groove.');
  }
  if (lipPlacement === 'cover' && depth - back - ledgeHeight < lipHeight + 0.7) {
    throw new Error('Lip on cover needs more clearance above the LED shelf: increase box depth or reduce lip height.');
  }
  const scale = size / longest;
  const cx = (maxX + minX) / 2, cy = (maxY + minY) / 2;
  const width = extX * scale, height = extY * scale;
  const points = projected(outline, cx, cy, scale);
  if (Math.abs(signedArea(points)) < 30) throw new Error('The traced silhouette has almost no printable area.');

  // Pack along the shorter bounding dimension. Two 120 mm squares with 12 mm
  // separation fit a nominal 256 mm bed (users must check their own plate).
  const move: [number, number] = width <= height ? [width + PLATE_GAP, 0] : [0, height + PLATE_GAP];
  const warnings: string[] = [];
  if (Math.min(width, height) * 2 + PLATE_GAP > 250) {
    warnings.push('The shell and cover may not both fit your build plate; arrange the 3MF objects separately.');
  }
  return withScope((keep) => {
    const outer = keep(csOf(wasm, [points], 'EvenOdd'));
    const interior = keep(outer.offset(-wall, 'Round', 2, 16));
    if (interior.isEmpty()) throw new Error('This silhouette is too thin for the selected wall thickness.');
    const ledgeInside = keep(interior.offset(-ledgeWidth, 'Round', 2, 16));
    if (ledgeInside.isEmpty()) throw new Error('There is no room for the LED ledge. Enlarge the model or reduce ledge width.');
    const innerContours: Ring[] = ringsOf(ledgeInside);
    if (!innerContours.length) throw new Error('The LED ledge leaves no usable centre opening.');
    const inner = innerContours.slice().sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0]!;
    const spot = poleOf(inner, 0.2);
    const outerVol = keep(extrude(wasm, outer, depth));
    const cavity = keep(keep(extrude(wasm, interior, depth - back + 0.15)).translate([0, 0, back]));
    const wallAndBack = keep(outerVol.subtract(cavity));
    const ledgeProfile = keep(interior.subtract(ledgeInside));
    const ledge = keep(keep(extrude(wasm, ledgeProfile, ledgeHeight + 0.05)).translate([0, 0, back - 0.04]));
    let shell = keep(wallAndBack.add(ledge));
    if (wireExit === 'back' || wireExit === 'both') {
      if (spot.radius < holeDiameter / 2 + 0.3) throw new Error('Not enough space for the rear cable hole. Reduce its diameter.');
      const cutter = keep(keep(wasm.Manifold.cylinder(back + 2, holeDiameter / 2, holeDiameter / 2, 40))
        .translate([spot.at[0], spot.at[1], -1]));
      shell = keep(shell.subtract(cutter));
    }
    if (wireExit === 'side' || wireExit === 'both') {
      const sideZ = back + Math.max(ledgeHeight + 2, (depth - back) * 0.5);
      if (sideZ + holeDiameter / 2 >= depth - 0.5) throw new Error('Increase box depth or reduce the side hole diameter.');
      const reach = width + holeDiameter + 6;
      const cutter = keep(keep(wasm.Manifold.cylinder(reach, holeDiameter / 2, holeDiameter / 2, 40))
        .rotate([0, 90, 0]).translate([spot.at[0], spot.at[1], sideZ]));
      shell = keep(shell.subtract(cutter));
      if (width > 3 * height) warnings.push('Inspect the side exit on long or irregular silhouettes.');
    }
    if (wireExit === 'dual') {
      // Each hole travels from the hollow interior radially through the FIRST
      // outline wall it meets. Unlike a full-width bore this cannot accidentally
      // drill the far side of a concave or narrow silhouette.
      const freeHeight = depth - back - holeDiameter - 1.2;
      if (freeHeight < 0) throw new Error('Increase box depth or reduce cable hole diameter for two side exits.');
      for (const [angle, fromBack] of [[hole1Angle, hole1Depth], [hole2Angle, hole2Depth]]) {
        const radians = angle * Math.PI / 180;
        const direction: [number, number] = [Math.cos(radians), Math.sin(radians)];
        const hit = rayDistance(points, spot.at, direction);
        if (!Number.isFinite(hit) || hit < wall + 0.2) {
          throw new Error('Could not place a wire exit at this angle. Try a different angle or a larger silhouette.');
        }
        const start = Math.max(0, hit - wall - ledgeWidth - holeDiameter / 2 - 1);
        const reach = hit + holeDiameter / 2 + 2 - start;
        const z = back + holeDiameter / 2 + 0.6 + freeHeight * fromBack / 100;
        const drill = keep(keep(wasm.Manifold.cylinder(reach, holeDiameter / 2, holeDiameter / 2, 40))
          .rotate([0, 90, 0]).rotate([0, 0, angle])
          .translate([spot.at[0] + direction[0] * start, spot.at[1] + direction[1] * start, z]));
        shell = keep(shell.subtract(drill));
      }
      if (width > 3 * height || height > 3 * width) {
        warnings.push('Inspect radial side exits on highly elongated silhouettes.');
      }
    }
    // In box-lip mode, an integral male ridge stands above the outer wall's rim.
    // Its mating female groove is carved into the underside of the diffuser.
    const boxRidgeOuter = lipPlacement === 'box'
      ? keep(outer.offset(-wall * 0.45, 'Round', 2, 16)) : null;
    if (boxRidgeOuter) {
      const ridgeInside = keep(boxRidgeOuter.offset(-lipWidth, 'Round', 2, 16));
      if (ridgeInside.isEmpty()) throw new Error('Lip is too wide for this silhouette; enlarge the box or reduce lip width.');
      const ridgeBand = keep(boxRidgeOuter.subtract(ridgeInside));
      const male = keep(keep(extrude(wasm, ridgeBand, lipHeight + 0.04)).translate([0, 0, depth - 0.02]));
      shell = keep(shell.add(male));
    }
    const shellPart = makePart(shell, 'LED lightbox shell', SHELL, 'Lightbox shell');
    if (!shellPart) throw new Error('The silhouette could not form a printable lightbox.');
    const parts: ExportPart[] = [shellPart];

    // A flat diffuser sits ON TOP OF the walls, to be glued along their full rim.
    // It has the same outer outline; unlike an undersized insert it cannot fall inside.
    // The white base and complementary white top are fused into one printable body.
    const hasArtwork = includeColors && artwork.length > 0;
    // A registration lip/groove needs the underside facing UP during printing, so
    // the artwork prints face-down on the bed. Without a lip, preserve v0.6's
    // original face-up layout. Both layouts keep all regions in contact with the bed.
    const faceDown = lipPlacement !== 'none';
    const faceBottom = faceDown ? 0 : diffuserThickness - FACE_LAYER;
    const bottomHeight = hasArtwork ? diffuserThickness - FACE_LAYER : diffuserThickness;
    const backing = keep(keep(extrude(wasm, outer, bottomHeight))
      .translate([0, 0, hasArtwork && faceDown ? FACE_LAYER : 0]));
    const overlayParts: ExportPart[] = [];
    let whiteCover = backing;
    if (hasArtwork) {
      // Insetting the artwork leaves a configurable solid face band. A black band
      // becomes its own 0.4 mm filament object, never overlapping the white face.
      const inset = borderColor === 'none' ? 0.2 : borderWidth;
      const imageArea = keep(outer.offset(-inset, 'Round', 2, 16));
      if (imageArea.isEmpty()) throw new Error('Image border is too wide for this silhouette. Reduce border width.');
      const blackBand = borderColor === 'black' ? keep(outer.subtract(imageArea)) : null;
      let combined: any = null;
      const prepared: { cross: any; name: string; color: RGB }[] = [];
      for (let i = 0; i < artwork.length; i++) {
        const region = artwork[i]!;
        const transformed: Ring[] = [];
        let pieceCount = 0;
        for (const component of region.components) {
          if (++pieceCount > 120) break;
          if (!component.length) continue;
          const first = projected(component[0]!, cx, cy, scale);
          if (Math.abs(signedArea(first)) < 0.25) continue;
          for (const ring of component) transformed.push(projected(ring, cx, cy, scale));
        }
        if (!transformed.length) continue;
        const raw = keep(csOf(wasm, transformed, 'EvenOdd'));
        const clipped = keep(raw.intersect(imageArea));
        if (clipped.isEmpty()) continue;
        combined = combined ? keep(combined.add(clipped)) : clipped;
        prepared.push({ cross: clipped, name: 'Artwork colour ' + (i + 1), color: region.color });
      }
      if (prepared.length && combined) {
        const whiteTop = keep(blackBand ? keep(outer.subtract(combined)).subtract(blackBand) : outer.subtract(combined));
        if (!whiteTop.isEmpty()) {
          const upper = keep(keep(extrude(wasm, whiteTop, FACE_LAYER))
            .translate([0, 0, faceBottom]));
          whiteCover = keep(backing.add(upper));
        }
        for (const region of prepared) {
          const layer = keep(keep(extrude(wasm, region.cross, FACE_LAYER))
            .translate([0, 0, faceBottom]));
          const translated = keep(layer.translate([move[0], move[1], 0]));
          const part = makePart(translated, region.name, region.color, 'Diffuser cover');
          if (part) overlayParts.push(part);
        }
        if (blackBand && !blackBand.isEmpty()) {
          const face = keep(keep(extrude(wasm, blackBand, FACE_LAYER))
            .translate([0, 0, faceBottom]).translate([move[0], move[1], 0]));
          const borderPart = makePart(face, 'Black artwork border', BLACK, 'Diffuser cover');
          if (borderPart) overlayParts.push(borderPart);
        }
      } else {
        warnings.push('The image had no printable colour regions; generated a plain white diffuser.');
        whiteCover = keep(extrude(wasm, outer, diffuserThickness));
      }
    }
    if (lipPlacement === 'cover') {
      // The diffuser's male tongue nests *inside* the shell wall. A radial
      // clearance on each side avoids mating surfaces being coincident.
      const tongueOuter = keep(interior.offset(-lipClearance, 'Round', 2, 16));
      const tongueInner = keep(tongueOuter.offset(-lipWidth, 'Round', 2, 16));
      if (tongueInner.isEmpty()) throw new Error('The cover lip has no inner opening. Reduce its width or increase the design size.');
      const tongueBand = keep(tongueOuter.subtract(tongueInner));
      const tongue = keep(keep(extrude(wasm, tongueBand, lipHeight + 0.02))
        .translate([0, 0, diffuserThickness - 0.01]));
      whiteCover = keep(whiteCover.add(tongue));
    } else if (lipPlacement === 'box') {
      // Oversize BOTH edges of the ridge's receiving groove by the tolerance.
      // The groove opens upward in the print orientation; the colour face is
      // printed against the bed and stays intact (>=0.5 mm roof in assembly).
      const grooveOuter = keep(outer.offset(-wall * 0.45 + lipClearance, 'Round', 2, 16));
      const grooveInner = keep(outer.offset(-wall * 0.45 - lipWidth - lipClearance, 'Round', 2, 16));
      if (grooveInner.isEmpty()) throw new Error('The diffuser groove does not fit this silhouette. Reduce lip width or tolerance.');
      const grooveBand = keep(grooveOuter.subtract(grooveInner));
      const grooveCut = keep(keep(extrude(wasm, grooveBand, lipHeight + 0.12))
        .translate([0, 0, diffuserThickness - lipHeight - 0.08]));
      whiteCover = keep(whiteCover.subtract(grooveCut));
      if (whiteCover.isEmpty()) throw new Error('Groove removed the diffuser. Increase diffuser thickness or reduce lip width.');
    }
    if (lipPlacement !== 'none') warnings.push('Registration profile: test fit with a short print; clearance is radial, per side.');
    const positioned = keep(whiteCover.translate([move[0], move[1], 0]));
    const coverPart = makePart(positioned, 'Translucent diffuser', WHITE, 'Diffuser cover');
    if (!coverPart) throw new Error('Could not generate the diffuser cover.');
    parts.push(coverPart, ...overlayParts);
    if (overlayParts.length) {
      warnings.push('Colour appearance depends on translucent filament and illumination; print a small light test first.');
    }
    return { parts, width, height, warnings };
  });
}
