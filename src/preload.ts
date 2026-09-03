import { contextBridge, ipcRenderer } from 'electron';

// ponytail: the only IPC surface in the app. Right-click and -webkit-app-
// region: drag are mutually exclusive on Windows (the OS eats right-clicks
// on a drag region before the renderer ever sees them), so the cat's context
// menu forced dropping app-region drag for a manual one — this is the
// minimal bridge that needs.
contextBridge.exposeInMainWorld('drag', {
  start: () => ipcRenderer.send('drag-start'),
  move: (x: number, y: number) => ipcRenderer.send('drag-move', x, y),
});

// the in-page right-click menu: one channel, one action name.
contextBridge.exposeInMainWorld('menu', {
  action: (name: string) => ipcRenderer.send('menu-action', name),
});
