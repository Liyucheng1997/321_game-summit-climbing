/* 桌面版（Steam）外壳：Electron 主进程 */
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

let steam = null;
try {
  // 可选：安装 steamworks.js 后自动接入 Steam 成就。开发时使用 steam_appid.txt 中的 AppID。
  const steamworks = require('steamworks.js');
  const fs = require('fs');
  const idFile = path.join(__dirname, '..', 'steam_appid.txt');
  const appId = fs.existsSync(idFile) ? parseInt(fs.readFileSync(idFile, 'utf8'), 10) : undefined;
  steam = steamworks.init(appId);
  steamworks.electronEnableSteamOverlay();
} catch (e) {
  steam = null;
}

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 600,
    backgroundColor: '#05080d', title: '巅峰攀登 · Summit',
    fullscreen: !process.argv.includes('--windowed'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  ipcMain.on('quit', () => app.quit());
  ipcMain.on('fullscreen', (_e, on) => win.setFullScreen(!!on));
  ipcMain.on('achievement', (_e, id) => {
    try { if (steam && steam.achievement) steam.achievement.activate(String(id).toUpperCase()); } catch (err) { /* 忽略 */ }
  });
}

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
