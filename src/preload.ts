import { contextBridge, ipcRenderer } from 'electron';

// ponytail: the only IPC surface in the app, shared by both windows. Right-
// click and -webkit-app-region: drag are mutually exclusive on Windows (the OS
// eats right-clicks on a drag region before the renderer ever sees them), so
// the cat's context menu forced dropping app-region drag for a manual one.
contextBridge.exposeInMainWorld('drag', {
  start: () => ipcRenderer.send('drag-start'),
  move: (x: number, y: number) => ipcRenderer.send('drag-move', x, y),
});

// the in-page right-click menu: one channel, one action name.
contextBridge.exposeInMainWorld('menu', {
  action: (name: string) => ipcRenderer.send('menu-action', name),
});

// one bridge for both windows: the settings window uses the setters, the
// overlay the senders and listeners. Each payload is one whole object — no
// key/value protocol, no generic RPC.
contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings-get'),
  setSettings: (s: unknown) => ipcRenderer.send('settings-set', s),
  onSettings: (cb: (s: unknown) => void) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  sendMeters: (m: unknown) => ipcRenderer.send('meters', m),
  onMeters: (cb: (m: unknown) => void) => ipcRenderer.on('meters', (_e, m) => cb(m)),
  sendMics: (l: unknown[]) => ipcRenderer.send('mics', l),
  onMics: (cb: (l: unknown[]) => void) => ipcRenderer.on('mics', (_e, l) => cb(l)),
});
