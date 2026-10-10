# Image LED lightbox generator plan

## Goal
New offline desktop-menu generator for a hollow illuminated enclosure based on
an uploaded silhouette image, with a glue-friendly LED strip shelf and side
and/or rear cable exits.

## Initial deliverable (v0.5.0)
1. Reuse the existing image tracer for local PNG/JPG/WebP input (largest silhouette only).
2. Reuse Manifold WASM in a worker to extrude one hollow body with a solid back
   and an open front, plus an integrated flat ledge at the inner wall.
3. Adjustable overall size, box depth, side/back wall thickness, shelf width/rise,
   cable-hole diameter and exit location (none/back/right/both).
4. Live 3D preview, 3MF export via the native Save As bridge and JSON project
   save/load retaining the traced silhouette.
5. Desktop-only catalogue card; public upstream website remains unchanged.
6. Basic geometry regression tests and Windows build pipeline validation.

## Future iterations
- Detachable diffuser/front face with configurable snap/lip clearance.
- Optional artwork panel, multi-colour face and transparent diffuser guidance.
- LED recess/strip path length estimate and corner-radius constraints.
- Hole position chooser and additional mounting tabs/bosses.
- Multiple outlines, islands and explicit negative holes from artwork.
- Material presets, minimum-feature diagnostics and actual printed fit testing.

## Physical assumptions and limitations
The backing lies on the bed; the enclosure opens upward (Z positive). The
interior ledge is a fused horizontal ring near the back, suitable for
self-adhesive LED strips placed flat and pointing toward the open front.
Its width is not scaled with the silhouette. The +X side hole is cut by a
horizontal cylinder from an interior point and may be unsuitable for highly
branched shapes. This is a basic functional prototype, not a ready-to-install
electrical device; LED strip thickness, temperatures, wiring, current limiting
and diffuser clearance need physical testing.
