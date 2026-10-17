// Parçala - Windows masaüstü kabuğu (Electron)
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Büyük modeller (milyonlarca üçgen) için bellek sınırını yükselt
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');

let pencere = null;
let bekleyenDosya = null;

function modelYolu(argv) {
  return (argv || []).slice(1).find(a => /\.(stl|3mf)$/i.test(a) && fs.existsSync(a)) || null;
}
function dosyaOku(yol) {
  const b = fs.readFileSync(yol);
  return { ad: path.basename(yol), buf: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const y = modelYolu(argv);
    if (pencere) {
      if (pencere.isMinimized()) pencere.restore();
      pencere.focus();
      if (y) pencere.webContents.send('dosya-geldi', dosyaOku(y));
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    bekleyenDosya = modelYolu(process.argv);
    pencere = new BrowserWindow({
      width: 1440, height: 900, minWidth: 900, minHeight: 600,
      title: 'Parçala', backgroundColor: '#121617', show: false,
      icon: path.join(__dirname, 'build', 'icon.ico'),
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
    });
    pencere.once('ready-to-show', () => { pencere.maximize(); pencere.show(); });
    pencere.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    pencere.loadFile(path.join(__dirname, 'index.html'));
  });

  ipcMain.handle('acilis-dosyasi', () => {
    if (!bekleyenDosya) return null;
    const d = dosyaOku(bekleyenDosya); bekleyenDosya = null; return d;
  });

  ipcMain.handle('kaydet', async (_e, ad, veri) => {
    const sonuc = await dialog.showSaveDialog(pencere, {
      title: 'Parçaları kaydet',
      defaultPath: path.join(app.getPath('documents'), ad),
      filters: [{ name: 'ZIP arşivi', extensions: ['zip'] }]
    });
    if (sonuc.canceled || !sonuc.filePath) return false;
    fs.writeFileSync(sonuc.filePath, Buffer.from(veri));
    shell.showItemInFolder(sonuc.filePath);
    return true;
  });

  app.on('window-all-closed', () => app.quit());
}
