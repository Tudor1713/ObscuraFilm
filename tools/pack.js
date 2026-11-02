// Builds dist/暗盒-win32-x64/暗盒.exe. Only main.js, preload.js, app/ and the icon go into the asar.
const { packager } = require('@electron/packager');
const path = require('path');
const fs = require('fs');

// copies SpektraLab's native renderer (GPL-3.0, https://github.com/JamesQiu2005/SpektraLab) and the engine
// data it needs into build/runtime/spektralab, which goes into the package as resources/spektralab. The
// install is SPEKTRALAB_DIR or a SpektraLab folder beside this project; without one the package has no
// engine and shows the LUTs only.
function prepareEngine(root) {
  const source = process.env.SPEKTRALAB_DIR || path.join(root, '..', 'spektralab');
  if (!fs.existsSync(path.join(source, 'spektralab-host.exe'))) {
    const prev = path.join(root, 'build', 'runtime', 'spektralab');
    if (fs.existsSync(path.join(prev, 'spektralab-host.exe'))) return prev;
    console.warn(`no SpektraLab at ${source}: packaging without the engine (LUT previews only). Set SPEKTRALAB_DIR to bundle it.`);
    return null;
  }
  const engine = fs.existsSync(path.join(source, 'engine')) ? path.join(source, 'engine') : path.join(source, 'host', 'engine');
  const out = path.join(root, 'build', 'runtime', 'spektralab');
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(source, 'spektralab-host.exe'), path.join(out, 'spektralab-host.exe'));
  const res = path.join(out, 'engine');
  fs.mkdirSync(res, { recursive: true });
  for (const name of ['profiles', 'io', 'vulkan', 'spektrafilm_constants.bin', ...fs.readdirSync(engine).filter(f => f.endsWith('.json'))])
    fs.cpSync(path.join(engine, name), path.join(res, name), { recursive: true });
  fs.copyFileSync(path.join(source, 'LICENSE.txt'), path.join(out, 'LICENSE.txt'));
  fs.copyFileSync(path.join(source, 'BUILD-NOTES.txt'), path.join(out, 'UPSTREAM-BUILD-NOTES.txt'));
  fs.cpSync(path.join(source, 'host', 'licenses'), path.join(out, 'licenses', 'host'), { recursive: true });
  fs.cpSync(path.join(source, 'licenses', 'rust'), path.join(out, 'licenses', 'rust'), { recursive: true });
  fs.copyFileSync(path.join(root, 'app', 'luts', 'NOTICE.md'), path.join(out, 'NOTICE.md'));
  return out;
}

process.env.ELECTRON_MIRROR ||= 'https://npmmirror.com/mirrors/electron/';

(async () => {
  const root = path.join(__dirname, '..');
  const keep = /^\/(main\.js|preload\.js|lab\.js|local\.json|package\.json|app(\/.*)?|build(\/icon\.ico)?)$/;
  const bundle = process.env.ANHE_ENGINE_BUNDLE || prepareEngine(root);
  const out = await packager({
    dir: root,
    out: process.env.ANHE_DIST_DIR || path.join(root, 'dist'),
    name: '暗盒',
    executableName: '暗盒',
    platform: 'win32',
    arch: 'x64',
    icon: path.join(root, 'build', 'icon.ico'),
    asar: true,
    extraResource: bundle ? [bundle] : [],
    overwrite: true,
    prune: true,
    ignore: p => p !== '' && !keep.test(p.split(path.sep).join('/')),
    appCopyright: '暗盒',
    win32metadata: { CompanyName: '暗盒', FileDescription: '暗盒 · 35mm 胶卷相册', ProductName: '暗盒', InternalName: 'anhe' },
  });
  // the UI is Chinese; keep two Chromium locales instead of fifty
  for (const dir of out) {
    const loc = path.join(dir, 'locales');
    for (const f of fs.readdirSync(loc)) if (!/^(zh-CN|en-US)\.pak$/.test(f)) fs.rmSync(path.join(loc, f));
    // the desktop shortcut takes its icon from this file, so a new icon is not stuck behind Explorer's cache of the exe
    fs.copyFileSync(path.join(root, 'build', 'icon.ico'), path.join(dir, '暗盒.ico'));
  }
  console.log(out.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
