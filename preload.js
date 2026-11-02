const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anhe', {
  titlebar: dark => ipcRenderer.send('titlebar', !!dark),
  // screen recording: main.js owns the file, the page streams chunks into it
  rec: {
    start: (ext, at) => ipcRenderer.invoke('rec:start', ext, at),
    chunk: buf => ipcRenderer.send('rec:chunk', buf),
    stop: () => ipcRenderer.invoke('rec:stop'),
    reveal: () => ipcRenderer.send('rec:reveal'),
    // the pill window (rec-pill.html) asks to stop; the page hears it and stops its recorder
    requestStop: () => ipcRenderer.send('rec:stop-request'),
    onStopRequest: fn => ipcRenderer.on('rec:stop-request', () => fn()),
    onTheme: fn => ipcRenderer.on('rec:theme', (e, dark) => fn(dark)),
  },
  // SpektraLab prints of a frame (lab.js): the page hands over a photo's stored copy when asked for it
  lab: {
    print: req => ipcRenderer.invoke('lab:print', req),
    src: (photo, which, buf) => ipcRenderer.invoke('lab:src', photo, which, buf),
    drop: group => ipcRenderer.send('lab:drop', group),
    forget: photo => ipcRenderer.send('lab:forget', photo),
  },
});
