// Dev harness: launches the app with a throwaway profile, runs a list of steps in the renderer and saves
// screenshots.  electron tools/capture.js <out-dir> <steps.json>
// each step: { "js": "<async function body; return a value to log it>", "wait": ms, "shot": "name.png" }
// "input": "<async function body returning [[type, x, y | keyCode], ...]>" sends real OS-level events, where
// type is down / up / move / dbl (a double-click press) / key / char
// "load": [paths] reads local files into window.__files (File objects) for simulated drag & drop
process.env.ANHE_HARNESS = '1';
const { app, Menu } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const [outDir, stepsFile] = process.argv.slice(-2);
app.setPath('userData', path.join(os.tmpdir(), 'anhe-harness-' + (process.env.ANHE_PROFILE || 'fresh')));
if (!process.env.ANHE_PROFILE) fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
const { serve, createWindow } = require('../main.js');

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  serve();
  const w = parseInt(process.env.ANHE_W || '1440'), h = parseInt(process.env.ANHE_H || '900');
  const win = createWindow({ width: w, height: h, x: 40, y: 40 });
  const logs = [];
  win.webContents.on('console-message', (e) => logs.push(`[${e.level}] ${e.message}`));
  await new Promise(r => win.webContents.once('did-finish-load', r));
  const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  for (const s of steps) {
    try {
      if (s.js) {
        const v = await win.webContents.executeJavaScript(`(async () => { ${s.js} })()`, true);
        if (s.save && typeof v === 'string') fs.writeFileSync(path.join(outDir, s.save), Buffer.from(v.split(',')[1], 'base64'));
        else if (v !== undefined && s.log !== false) logs.push('=> ' + JSON.stringify(v).slice(0, 800));
      }
      if (s.load) {   // local files -> window.__files as File objects, for simulated drops
        for (const f of s.load) {
          const b64 = fs.readFileSync(f).toString('base64');
          await win.webContents.executeJavaScript(`(window.__files ||= []).push(new File([Uint8Array.from(atob(${JSON.stringify(b64)}), c => c.charCodeAt(0))], ${JSON.stringify(path.basename(f))}, { type: '' })); 1`, true);
        }
      }
      if (s.input) {
        const list = await win.webContents.executeJavaScript(`(async () => { ${s.input} })()`, true);
        for (const [type, a, b] of list) {
          if (type === 'key') {
            win.webContents.sendInputEvent({ type: 'keyDown', keyCode: a });
            win.webContents.sendInputEvent({ type: 'keyUp', keyCode: a });
          } else if (type === 'char') win.webContents.sendInputEvent({ type: 'char', keyCode: a });
          else {
            const t = { down: 'mouseDown', up: 'mouseUp', move: 'mouseMove', dbl: 'mouseDown' }[type];
            win.webContents.sendInputEvent({ type: t, x: Math.round(a), y: Math.round(b), button: 'left', clickCount: type === 'dbl' ? 2 : 1 });
          }
          await new Promise(r => setTimeout(r, 40));
        }
      }
    } catch (e) { logs.push('!! ' + (s.js || s.input) + ' :: ' + e.message); }
    if (s.wait) await new Promise(r => setTimeout(r, s.wait));
    if (s.shot) {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, s.shot), img.toPNG());
    }
  }
  fs.writeFileSync(path.join(outDir, 'log.txt'), logs.join('\n'));
  app.quit();
});
