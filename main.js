const { app, BrowserWindow, protocol, net, ipcMain, Menu, shell, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Lab } = require('./lab');

// the renderer is served from anhe://app/ so IndexedDB, fetch and WebGL textures all share one secure origin
protocol.registerSchemesAsPrivileged([
  { scheme: 'anhe', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const ROOT = path.join(__dirname, 'app');
// optional machine-local settings beside main.js (git-ignored; see README): { "recordingsDir": "..." }
const LOCAL = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'local.json'), 'utf8')); } catch { return {}; } })();
const PAPER = '#ebe8e2', INK = '#3a352e', DARK = '#0e0d0c', DARK_INK = '#cfc8bc';
let win;
const lab = new Lab();

// an explicit taskbar identity; Explorer had cached the old icon under the default one
if (process.platform === 'win32') app.setAppUserModelId('com.anhe.film');

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

function serve() {
  protocol.handle('anhe', req => {
    const name = decodeURIComponent(new URL(req.url).pathname);
    if (name.startsWith('/lab/')) {
      const print = lab.servePath(name.slice(5));
      return print ? net.fetch(pathToFileURL(print).toString()) : new Response('forbidden', { status: 403 });
    }
    const file = path.normalize(path.join(ROOT, name));
    if (!file.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow(opts = {}) {
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 980, minHeight: 640, useContentSize: true, show: false,
    backgroundColor: PAPER, title: '暗盒',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: PAPER, symbolColor: INK, height: 40 },
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false,
    },
    ...opts,
  });
  allowSelfCapture(win.webContents.session);
  win.on('move', placePill);
  win.on('resize', placePill);
  win.on('minimize', () => pill?.hide());
  win.on('restore', () => { placePill(); pill?.showInactive(); });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => win.show());
  win.loadURL('anhe://app/index.html');
  return win;
}

ipcMain.on('titlebar', (e, dark) => {
  win?.setTitleBarOverlay({ color: dark ? DARK : PAPER, symbolColor: dark ? DARK_INK : INK });
  if (pillAt) pillAt.dark = !!dark;
  pill?.webContents.send('rec:theme', !!dark);
});

// ---- screen recording: the page asks for getDisplayMedia, we hand it its own frame (no picker), and
// the encoded chunks it sends are appended to <Videos>\暗盒录屏\暗盒 <date time>.<ext> (or local.json's
// recordingsDir, or ANHE_REC_DIR)
const REC_DIR = () => process.env.ANHE_REC_DIR || LOCAL.recordingsDir || path.join(app.getPath('videos'), '暗盒录屏');
let rec = null, lastRec = null;

function redDot() {
  const S = 16, buf = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2), a = Math.max(0, Math.min(1, 6.5 - d));
    buf.set([47 * a, 67 * a, 216 * a, 255 * a], (y * S + x) * 4);   // BGRA, premultiplied
  }
  return nativeImage.createFromBitmap(buf, { width: S, height: S });
}

// while recording, the page hides its own record button and this pill takes its place on screen: a
// separate window, so the tab capture never sees it. Clicking it stops the recording.
let pill = null, pillAt = null;
function placePill() {
  if (!pill || !win || !pillAt) return;
  const b = win.getContentBounds();
  pill.setBounds({ x: Math.round(b.x + pillAt.x), y: Math.round(b.y + pillAt.y), width: Math.round(pillAt.w), height: Math.round(pillAt.h) });
}
function openPill(at) {
  pillAt = at;
  pill = new BrowserWindow({
    parent: win, show: false, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  placePill();
  pill.loadURL(`anhe://app/rec-pill.html?t0=${Date.now()}&dark=${at.dark ? 1 : 0}`);
  pill.once('ready-to-show', () => pill?.showInactive());
  pill.on('closed', () => { pill = null; });
}
function closePill() {
  if (pill && !pill.isDestroyed()) pill.close();
  pill = null;
}

function closeRec() {
  closePill();
  if (!rec) return null;
  fs.closeSync(rec.fd);
  lastRec = rec.file;
  rec = null;
  win?.setOverlayIcon(null, '');
  win?.setTitle('暗盒');
  return lastRec;
}

ipcMain.handle('rec:start', (e, ext, at) => {
  closeRec();
  fs.mkdirSync(REC_DIR(), { recursive: true });
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
  const file = path.join(REC_DIR(), `暗盒 ${stamp}.${ext === 'mp4' ? 'mp4' : 'webm'}`);
  rec = { file, fd: fs.openSync(file, 'w') };
  win?.setOverlayIcon(redDot(), '录制中');
  win?.setTitle('● 录制中 · 暗盒');
  if (at) openPill(at);
  return file;
});
ipcMain.on('rec:stop-request', () => win?.webContents.send('rec:stop-request'));
ipcMain.on('rec:chunk', (e, buf) => { if (rec) fs.writeSync(rec.fd, Buffer.from(buf)); });
ipcMain.handle('rec:stop', () => closeRec());
ipcMain.on('rec:reveal', () => { if (lastRec) shell.showItemInFolder(lastRec); });
app.on('before-quit', closeRec);

// ---- film simulation: the page asks the darkroom (lab.js) for SpektraLab prints of its frames
ipcMain.handle('lab:print', (e, req) => lab.print(req));
ipcMain.handle('lab:src', (e, photo, which, buf) => lab.saveSrc(photo, which, buf));
ipcMain.on('lab:drop', (e, group) => lab.drop(group));
ipcMain.on('lab:forget', (e, photo) => lab.forget(photo));
app.on('before-quit', () => lab.stop());

function allowSelfCapture(ses) {
  ses.setDisplayMediaRequestHandler((req, callback) => {
    const own = req.frame && req.frame.url.startsWith('anhe://app/');
    callback(own ? { video: req.frame } : {});
  });
}

module.exports = { serve, createWindow };

if (require.main === module || !process.env.ANHE_HARNESS) {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    serve();
    createWindow();
    setTimeout(() => { try { lab.prune(); } catch {} }, 8000);
  });
  app.on('window-all-closed', () => app.quit());
}
