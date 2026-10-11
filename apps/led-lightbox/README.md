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


### Prepare Image and registration lips (v0.7.0)
Uploading PNG/JPG/WebP opens the Clicker Generator's **same original**
Prepare Image modal: background removal, per-colour keep switches, smoothing,
exposure/contrast/saturation and other tone adjustments, side-by-side
Original/Result previews, zoom and pan. Cancel leaves the existing lightbox
unchanged. Confirm retraces with precisely the selected colours and adjusted
image. Press **Prepare / adjust image** to reopen it while the original
upload is still in memory. Saved projects keep traced output and settings
without embedding the large source bitmap.

Registration lip options:
- **None:** flat glue-on diffuser as before.
- **On diffuser:** a tongue on the underside of the diffuser mates with
  the hollow inside of the shell. Use a radial gap to tune friction.
- **On box:** a ridge around the shell rim fits a recessed annular
  mating groove on the underside of the diffuser. This requires a diffuser
  thickness greater than the lip height by at least 0.55 mm.

All three share adjustable lip width, lip height and **clearance per side**.
0.15–0.2 mm is a reasonable first test, but real press fit depends strongly
on printer accuracy, shrinkage, perimeter count and filament. Colour parts
are printed face-down for both lipped modes. At close fits, print a small
fit test before printing a full-size design.


### Optional picture borders and positioned cable exits
Choose **None**, **White / translucent**, or **Black** artwork border. The
border-width control (0.5–12 mm) insets the posterized colour regions while
preserving the outside silhouette and separate diffuser geometry. White is part
of the translucent diffuser; black adds a separately printable 0.4 mm colour
face to the 3MF (assign black filament). If no traced colour artwork is included,
there is no picture to border.

The existing rear and right-side wire exits still behave as before. Select
**Two positioned side holes** for two independent radial exit bores. Each has
an angle of 0–359° viewed from the front (0° right, 90° top, 180° left,
270° bottom) and a back-to-front position of 0–100%. The position is measured
within the usable box wall height with clearance for the hole radius: 0% is
near the inside of the back plate, 100% is near the open front. The radial cut
only crosses the first shell wall in its direction, rather than drilling clear
through the opposite side. The holes share the cable diameter control.

Saved projects retain border/hole controls. Older projects load with border
disabled and their existing wiring mode unchanged. Complex silhouettes, narrow
necks and tight hole spacing may need a test print before wiring.

### Perforated marquee-light diffuser

Select a **Marquee pattern** in the new Marquee lights section:
- **None:** leaves all prior saved lightboxes and diffuser faces unchanged.
- **Outer silhouette:** an evenly spaced row follows an inward offset of the
  lightbox outline, even without uploaded colour artwork.
- **Black artwork border:** places a row in the printable black filament band.
  Select a sufficiently wide **Black** artwork border first. The hole inset
  is the distance from the **outer silhouette** to each hole centre.
- **Inside each colour-section edge:** rows follow every retained, printable
  colour contour, inset **into each colour section**, similar to illuminated
  colour boundaries on a marquee-style sign. Adjacent colours may have separate
  parallel rows; narrow colour regions can be too small for the chosen holes.

Control the **total count** (1–240 holes), **hole diameter** (1.5–10 mm) and
**inset** (0–20 mm). Holes are equally spaced by arc length around each contour;
when multiple contours exist, the requested count is distributed by contour
perimeter. Counts are exact when geometry succeeds. Impossible layouts (holes
too close to the outside wall, intersecting neighbours, missing colour profiles,
or holes that cannot fit in a black band) report a clear error rather than
producing a misleading 3MF.

These are genuine **through-holes in the separate diffuser cover**, including
its white backing and coloured/black 0.4 mm inlay regions. The shell and rear
panel are not drilled by this feature; its independent cable holes remain
unchanged. The face must be fitted with appropriate LED modules and secured
and wired separately. Check LED body diameter and flange tolerance before
printing. Hole spacing, structural strength, thermal safety and electrical
installation are not automatically certified; begin with a small test print.

The marquee options are saved in JSON projects. Projects created before this
feature reopen with the layout disabled so existing 3MF geometry is unchanged.
