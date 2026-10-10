# Image LED lightbox generator plan

## v0.5.0: image-silhouette enclosure (completed)
- PNG/JPG/WebP through local @vostok/trace.
- Hollow one-part Manifold shell with solid back, glued LED strip ledge,
  configurable wall/back/shelf dimensions and side/back wire exits.
- Live 3D viewer, desktop-only menu entry, 3MF and saved JSON projects.

## v0.6.0: printable diffuser and internal colours
- Use *the same* built-in image preparation run for shell silhouette and
  colour-specific 2D contours (posterization from 1–6 colours).
- Create separate full-face diffuser cover the same outside silhouette,
  **glued to the shell's top wall**, with variable total thickness
  (0.6–3.0 mm, 1.2 mm default).
- Inlay every colour in the top 0.4 mm of the diffuser so white + colour
  regions share a flat top rather than overlapping or floating.
- Package shell and complete multicolour cover as separate 3MF groups
  side-by-side with bottoms at Z=0, ready for slicer layout.
- Retain the traced colour regions and diffuser options in the JSON project;
  old projects receive a plain translucent cover by default.
- Add geometry, watertightness, printable separation, alpha-image tracing,
  thickness and colour regression checks, plus Windows CI installer check.

## Later options
- Alternate cover styles: recessed friction fit, screw-down front, snap/lip
  support and a separate assembled preview (without changing print layout).
- Interactive palette picking, region/colour exclusion and per-colour thickness.
- Color-aware lighting preview, automatic LED strip length, and standoff tabs.
- Hole position chooser and additional mounting bosses.
- Multi-island outlines and explicit negative body holes from artwork.
- Filament transmission/material presets, minimum-feature diagnostics,
  automated print-bed layout and printed fit validation.

## Print and electrical assumptions
The backing lies on the bed. The open shell is Z-up; the cover is laid
**beside the shell** for printing and glued on later. The coloured artwork
is planar segmented 3MF geometry (not a texture or full photographic
reproduction). The diffuser white is intended to use translucent filament.
LED strip thickness, brightness, thermal management, current limiting,
glue material and diffuser transmission must be physically checked.
The side wire exit is automatically drilled toward +X from a valid interior
location and may be unsuitable for heavily branched silhouettes.
