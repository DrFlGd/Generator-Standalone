# Image LED Lightbox — offline generator

Upload a PNG, JPG or WebP. The existing **@vostok/trace** pipeline removes an
optional flat background, simplifies/posterizes the image into 1–6 colours and
traces its outer silhouette **and colour components in the same pass**.

Manifold WASM builds a print-ready assembly:
- A hollow shell with a solid back, a raised *flat interior LED tape ledge*
  for glue-on LED strips, and optional right-side/back wire holes.
- A **separate glue-on translucent diffuser cover**, matching the outer
  silhouette, with a **variable overall thickness of 0.6–3.0 mm**.
- Optional printable colour face regions: up to 6 image colours, each as
  its own 0.4 mm-tall 3MF filament part, *inlaid* in the top of the diffuser.
  The white diffuser underneath + its white top regions occupy the remaining
  thickness; the coloured parts do not overlap the white face.

The **shell and cover are laid side by side on the build plate**, not in
an assembled/floating state. Each has its own 3MF object group for the slicer;
every colour in the cover retains its own filament assignment. The cover is
flat and **glues to the TOP RIM of the shell**; this version does not include
a snap-fit, diffuser retention lip or screw mount. Confirm bed fit at large sizes.

Saved JSON projects contain both the traced outer ring and the colour
components, so the image need not be uploaded again to rebuild/export.
To choose a *different* palette quantization in a loaded project, re-upload
the source image; slider changes to the colour count require it.

Processing runs entirely offline. Use translucent white filament for the
diffuser and choose print-compatible colour filaments if you want illumination
through the artwork. Appearance and minimum thickness are material, printer,
LED spacing and diffusion dependent: test a small print before assembly.
The 0.4 mm face inlay is a printable 2-layer design at 0.2 mm layer height,
not a true CMYK photo or a lithophane.

Known limitations: a single largest outside silhouette (not separate body
islands), automatic colour posterization (not pixel-faithful photos), tiny
components dropped, no physical fit validation or electrical certification.
The image can be detailed but very irregular narrow silhouettes may not
have enough material for the specified walls and LED ledge.

Desktop menu is private and injected by scripts/build-desktop.mjs; the
upstream website catalogue and original licensing are unaffected.
