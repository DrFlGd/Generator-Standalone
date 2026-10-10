# Image LED Lightbox — initial offline generator

Input a PNG, JPG or WebP image with one recognizable outer silhouette. The existing
@vostok/trace pipeline extracts its largest outside contour; interior cutouts and image
colours are deliberately ignored for now.

Makes one printable Manifold solid: a solid back on Z=0, open top/front on Z=depth,
outer profile walls and a fused flat inner shelf for gluing LED tape. Optional right
side and/or back wire pass-through holes. The shelf has a width and rise in millimetres.

Export 3MF. The saved JSON project contains the traced outline, so loading the
project does not require the original image. Geometry runs in a web worker and
does not use a network connection.

Limitations: no diffuser face, snap-on front, lettering, internal image colour
regions, mounting bosses, or electronics design. Small/fragmented/concave shapes
may not have room for the selected wall and shelf widths. Preview each hole and
test-fit before printing. The back hole is placed in the widest inner region and
the side hole exits in +X from that region.

Desktop menu entry is injected in scripts/build-desktop.mjs only; the upstream
web catalogue and licensing metadata are intentionally unchanged.
