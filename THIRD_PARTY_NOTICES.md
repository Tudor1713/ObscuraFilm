# Third-party notices

暗盒 (ObscuraFilm) is released under the GNU General Public License v3 (see `LICENSE`). It includes or
uses the following third-party work, each under its own license.

| Component | Where | License |
|---|---|---|
| [three.js](https://threejs.org) r186 (`three.module.js`, `three.core.js`, `RoomEnvironment.js`, `RoundedBoxGeometry.js`) | `app/vendor/` | MIT — `app/vendor/three-LICENSE.txt` |
| [libheif](https://github.com/strukturag/libheif) compiled to WebAssembly ([libheif-js](https://github.com/catdad-experiments/libheif-js)) | `app/vendor/libheif-bundle.mjs` | LGPL-3.0 — `app/vendor/libheif-LICENSE.txt` |
| [Archivo](https://github.com/Omnibus-Type/Archivo) (via Fontsource) | `app/fonts/archivo-*.woff2` | SIL OFL 1.1 — `app/fonts/LICENSE-Archivo.txt` |
| [IBM Plex Mono](https://github.com/IBM/plex) (via Fontsource) | `app/fonts/ibm-plex-mono-*.woff2` | SIL OFL 1.1 — `app/fonts/LICENSE-IBM-Plex-Mono.txt` |
| [Instrument Serif](https://github.com/Instrument/instrument-serif) (via Fontsource) | `app/fonts/instrument-serif-*.woff2` | SIL OFL 1.1 — `app/fonts/LICENSE-Instrument-Serif.txt` |
| Film simulation LUTs, rendered with [SpektraLab](https://github.com/JamesQiu2005/SpektraLab) from [spektrafilm](https://github.com/andreavolpato/spektrafilm) profiles by Andrea Volpato | `app/luts/` | CC BY-SA 4.0 — `app/luts/NOTICE.md` |
| Sample photographs from [Unsplash](https://unsplash.com) via [Lorem Picsum](https://picsum.photos) | `app/demo/` | Unsplash License — `app/demo/CREDITS.md` |

Not in this repository, but bundled into packaged builds by `tools/pack.js` when available:

| Component | Where in the package | License |
|---|---|---|
| SpektraLab native host (`spektralab-host.exe`) and engine data, revision 2ca735a | `resources/spektralab/` | GPL-3.0, with the upstream license and third-party notices copied alongside |

The app's sounds and textures (wood, plaster, foliage shadow, film grain) are synthesised in code. The
application icon is an original drawing by the author.

Kodak, Fujifilm, Ilford, CineStill, Lomography, Agfa, Lucky (乐凯) and the film names and packaging
designs shown are trademarks of their respective owners. They are used only to identify the film
stocks being depicted or simulated; this project is not affiliated with or endorsed by them.
