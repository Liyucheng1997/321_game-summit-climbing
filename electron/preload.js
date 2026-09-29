/* 渲染进程桥接：游戏通过 window.steamBridge 调用桌面功能 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('steamBridge', {
  activate: (id) => ipcRenderer.send('achievement', id),
  quit: () => ipcRenderer.send('quit'),
  fullscreen: (on) => ipcRenderer.send('fullscreen', on),
});
