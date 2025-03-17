const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectVideo: () => ipcRenderer.invoke('select-video'),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  optimizeVideo: (options) => ipcRenderer.invoke('optimize-video', options),
  stopOptimization: () => ipcRenderer.invoke('stop-optimization'),
  checkFfmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  onProgress: (callback) => ipcRenderer.on('optimization-progress', (_event, value) => callback(value))
});