// Millimetre-true hollow lightbox shell. Open at the top (front), solid back on the bed.
// LED ledge is an inward flat shelf joined to the inside wall, not a second loose part.
import { csOf, extrude, ringsOf, withScope } from '@vostok/manifold';
import { poleOf, signedArea } from '@vostok/shapes';
import type { ExportPart } from '@vostok/export';
import type { LightboxSettings } from './state';

type Ring = [number, number][];
export interface LightboxBuild { parts: ExportPart[]; width: number; height: number; warnings: string[] }

export function buildLightbox(wasm: any, settings: LightboxSettings): LightboxBuild {
  const { outline, size, depth, wall, back, ledgeWidth, ledgeHeight, wireExit, holeDiameter } = settings;
  if (outline.length < 3) throw new Error('Load an image with a solid outer silhouette.');
  const maxX = Math.max(...outline.map((p) => p[0]));
  const minX = Math.min(...outline.map((p) => p[0]));
  const maxY = Math.max(...outline.map((p) => p[1]));
  const minY = Math.min(...outline.map((p) => p[1]));
  const extX = maxX - minX, extY = maxY - minY;
  const longest = Math.max(extX, extY);
  if (!(longest > 0.001) || back + ledgeHeight >= depth - 1) throw new Error('Increase box depth or decrease the back and LED ledge heights.');
  const scale = size / longest;
  const cx = (maxX + minX) / 2, cy = (maxY + minY) / 2;
  const points: Ring = outline.map(([x,y]) => [(x-cx)*scale, (y-cy)*scale]);
  if (Math.abs(signedArea(points)) < 30) throw new Error('The traced silhouette has almost no printable area.');
  const warnings: string[] = [];
  return withScope((keep) => {
    const outer = keep(csOf(wasm, [points], 'EvenOdd'));
    const interior = keep(outer.offset(-wall, 'Round', 2, 16));
    if (interior.isEmpty()) throw new Error('This silhouette is too thin for the selected wall thickness.');
    const ledgeInside = keep(interior.offset(-ledgeWidth, 'Round', 2, 16));
    if (ledgeInside.isEmpty()) throw new Error('There is no room for the LED ledge. Enlarge the model or reduce ledge width.');
    const innerContours: Ring[] = ringsOf(ledgeInside);
    if (!innerContours.length) throw new Error('The LED ledge leaves no usable centre opening.');
    // Pole of the largest inner contour is an interior placement even for asymmetric silhouettes.
    const inner = innerContours.slice().sort((a,b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0]!;
    const spot = poleOf(inner, 0.2);
    const outerVol = keep(extrude(wasm, outer, depth));
    const cavity = keep(keep(extrude(wasm, interior, depth - back + 0.15)).translate([0,0,back]));
    const wallAndBack = keep(outerVol.subtract(cavity));
    const ledgeProfile = keep(interior.subtract(ledgeInside));
    const ledge = keep(keep(extrude(wasm, ledgeProfile, ledgeHeight + 0.05)).translate([0,0,back - 0.04]));
    let solid = keep(wallAndBack.add(ledge));
    if (wireExit === 'back' || wireExit === 'both') {
      if (spot.radius < holeDiameter / 2 + 0.3) throw new Error('Not enough space for the rear cable hole. Reduce its diameter.');
      const cutter = keep(keep(wasm.Manifold.cylinder(back + 2, holeDiameter / 2, holeDiameter / 2, 40)).translate([spot.at[0], spot.at[1], -1]));
      solid = keep(solid.subtract(cutter));
    }
    if (wireExit === 'side' || wireExit === 'both') {
      // A horizontal hole exits toward +X, beginning at a point guaranteed inside the cavity.
      const sideZ = back + Math.max(ledgeHeight + 2, (depth - back) * 0.5);
      if (sideZ + holeDiameter / 2 >= depth - 0.5) throw new Error('Increase box depth or reduce the side hole diameter.');
      const reach = (extX * scale) + holeDiameter + 6;
      const cutter = keep(keep(wasm.Manifold.cylinder(reach, holeDiameter / 2, holeDiameter / 2, 40))
        .rotate([0,90,0]).translate([spot.at[0], spot.at[1], sideZ]));
      solid = keep(solid.subtract(cutter));
      // Very irregular outlines can result in holes crossing other appendages.
      if (extX * scale > 3 * extY * scale) warnings.push('Inspect the side exit on long or highly irregular silhouettes.');
    }
    if (solid.isEmpty() || solid.status() !== 'NoError') throw new Error('The silhouette could not form a watertight lightbox.');
    const mesh = solid.getMesh();
    if (!mesh.triVerts.length) throw new Error('The generated lightbox has no printable faces.');
    const positions = mesh.numProp === 3 ? mesh.vertProperties : (() => {
      const arr = new Float32Array(mesh.vertProperties.length / mesh.numProp * 3);
      for (let i = 0, k = 0; i < mesh.vertProperties.length; i += mesh.numProp) {arr[k++] = mesh.vertProperties[i]!; arr[k++] = mesh.vertProperties[i+1]!; arr[k++] = mesh.vertProperties[i+2]!;}
      return arr;
    })();
    return { parts: [{ name: 'LED lightbox shell', positions, indices: mesh.triVerts, color: [66, 84, 110] }], width: extX*scale, height: extY*scale, warnings };
  });
}
