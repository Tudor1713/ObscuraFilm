# SpektraLab native renderer — source and license

This folder is a redistributed copy of the native film renderer from **SpektraLab**, a spectral film and
enlarger simulator by James Qiu, licensed under the **GNU General Public License v3** (`LICENSE.txt` here).
暗盒 runs it as a separate process (`lab.js` in the repository root) to print photographs with film
grain, halation, coupler effects and paper; `tools/pack.js` ships this folder inside the packaged app as
`resources/spektralab/`.

| | |
|---|---|
| Upstream repository | https://github.com/JamesQiu2005/SpektraLab |
| Exact source revision | [`2ca735ad60a998e925bf346f57d80012bdb5c6bf`](https://github.com/JamesQiu2005/SpektraLab/tree/2ca735ad60a998e925bf346f57d80012bdb5c6bf) (merged in [pull request #37](https://github.com/JamesQiu2005/SpektraLab/pull/37)) |
| Source archive | https://github.com/JamesQiu2005/SpektraLab/archive/2ca735ad60a998e925bf346f57d80012bdb5c6bf.zip |
| Build | SpektraLab 1.3.4 Windows x64 beta.2 — see `UPSTREAM-BUILD-NOTES.txt` and the upstream Windows build instructions |

The Corresponding Source of `spektralab-host.exe` is that revision of the upstream repository, unmodified.
If it ever stops being available there, open an issue on this repository and a copy of the exact source
will be provided.

## What is here

- `spektralab-host.exe` — the native host (C++ / Vulkan); it needs a GPU driver with Vulkan support.
- `engine/` — the subset of the upstream `host/engine` resources the host needs for 暗盒's renders: film
  and paper `profiles/` (spektrafilm profiles by Andrea Volpato, CC BY-SA 4.0, and SpektraLab's own;
  see the notices in `licenses/host/profiles`), `spektrafilm_constants.bin`, the print-filter and paper
  tables, the sRGB ICC profile in `io/`, and the compiled Vulkan shaders in `vulkan/`. Lens-correction
  data and the digital-intermediate cubes are left out because 暗盒 does not use them.
- `licenses/` — the third-party notices shipped with the upstream build (LibRaw, codecs, fonts, stb, volk,
  Vulkan-Headers, Rust crates, …).
- `NOTICE.md` — how 暗盒 uses the engine and how its film LUTs were made from it.

## Updating

Put a newer SpektraLab Windows build beside this project as `../spektralab` (or set `SPEKTRALAB_DIR`) and
run `npm run pack`: `tools/pack.js` refreshes this folder from it. Update the revision above to match.
