// Sayfaya yalnızca bu üç işlevi açar: açılışta verilen dosya, yeni gelen dosya, zip kaydetme
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('parcalaMasaustu', {
  acilisDosyasi: () => ipcRenderer.invoke('acilis-dosyasi'),
  kaydet: (ad, veri) => ipcRenderer.invoke('kaydet', ad, veri),
  dosyaGeldi: (f) => ipcRenderer.on('dosya-geldi', (_e, d) => f(d))
});
