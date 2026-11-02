# Film simulation LUTs

Each `<stock>.png` here is a 33 × 33 × 33 colour lookup table stored as a 1089 × 33 strip
(x = r + b·33, y = g, sRGB in, sRGB out). It records how one film stock, developed and printed on its
paired paper (or scanned, for slide film), renders an sRGB picture.

They were made by rendering a colour chart through the **SpektraLab** engine
(https://github.com/JamesQiu2005/SpektraLab, commit 2ca735a, GNU GPL v3), which models film with the
**spektrafilm** spectral profiles (CC BY-SA 4.0) and SpektraLab's own black-and-white profiles. Grain,
halation and glare were off (they are not colour transforms); the exposure of each stock was fixed to the
one at which SpektraLab's own auto exposure prints an 18 % grey card. `bake-report.json` lists the stock,
paper and exposure of every table.

To rebuild them, in `tools/spektralab/`: `python chart.py`, then
`<SpektraLab>/agents/node.exe bake.mjs <dir>/baked` (set `SPEKTRALAB_DIR` if SpektraLab lives elsewhere),
then `python make_luts.py ../../app/luts <any photo> sheet.png`.

Kodak, Fujifilm, Ilford, CineStill and the stock names are their owners' trademarks; the names say which
published film data a table was built from.

## Spatial effects in 暗盒

Photographs on the strip, in the lightbox, and in the film picker are also rendered directly by the
bundled SpektraLab host at the source revision above. These prints enable auto exposure, 135-format
grain, halation, scattering, glare and coupler effects. They are cached locally. The LUT is shown
while a print is pending or the native renderer is unavailable.

Playing videos use the LUT plus real-time grain and halation approximations in `app/js/grade.js`.
Grain amplitude was measured on the host's neutral fields. The two scatter radii were fitted from
Gold 200 and CineStill 800T; other stocks follow their profile's antihalation backing class. These
video effects are not equivalent to the host's full spectral, per-image auto-exposure pipeline.
Concentration blends the developed effect with the original image. At zero, the developed image
is the ungraded original. Selecting 原色 disables the film effects.

The Windows package includes the native host, required engine data and third-party notices under
`resources/spektralab/`. The source repository and exact revision are identified above and in
`UPSTREAM-BUILD-NOTES.txt`; the GPL-3.0 license is included alongside the host.
