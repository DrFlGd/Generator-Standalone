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
    diffuserThickness, includeColors, artwork } = settings;
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
    const shellPart = makePart(shell, 'LED lightbox shell', SHELL, 'Lightbox shell');
    if (!shellPart) throw new Error('The silhouette could not form a printable lightbox.');
    const parts: ExportPart[] = [shellPart];

    // A flat diffuser sits ON TOP OF the walls, to be glued along their full rim.
    // It has the same outer outline; unlike an undersized insert it cannot fall inside.
    // The white base and complementary white top are fused into one printable body.
    const hasArtwork = includeColors && artwork.length > 0;
    const bottomHeight = hasArtwork ? diffuserThickness - FACE_LAYER : diffuserThickness;
    const backing = keep(extrude(wasm, outer, bottomHeight));
    const overlayParts: ExportPart[] = [];
    let whiteCover = backing;
    if (hasArtwork) {
      // A narrow pale border is deliberately left on the face: protects the outer
      // sidewalls from fragile coloured islands and avoids precision seams at the rim.
      const imageArea = keep(outer.offset(-0.2, 'Round', 2, 16));
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
        const whiteTop = keep(outer.subtract(combined));
        if (!whiteTop.isEmpty()) {
          const upper = keep(keep(extrude(wasm, whiteTop, FACE_LAYER))
            .translate([0, 0, bottomHeight]));
          whiteCover = keep(backing.add(upper));
        }
        for (const region of prepared) {
          const layer = keep(keep(extrude(wasm, region.cross, FACE_LAYER))
            .translate([0, 0, bottomHeight]));
          const translated = keep(layer.translate([move[0], move[1], 0]));
          const part = makePart(translated, region.name, region.color, 'Diffuser cover');
          if (part) overlayParts.push(part);
        }
      } else {
        warnings.push('The image had no printable colour regions; generated a plain white diffuser.');
        whiteCover = keep(extrude(wasm, outer, diffuserThickness));
      }
    }
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
