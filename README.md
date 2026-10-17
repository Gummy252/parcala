# Parçala

AMS olmadan çok renkli 3D baskı için: STL/3MF modelleri renk renk ayrı basılacak parçalara böler,
parçalara tıkaç/yuva, dil/yarık ve pim gibi bağlantılar ekler. Modelin dış şekli ve ölçüsü değişmez.

## Kurulum

1. **Releases** bölümünden en son `Parcala-Kurulum-x.y.z.exe` dosyasını indir.
2. Çift tıkla ve kur. Windows "bilinmeyen yayıncı" uyarısı verirse: **Ek bilgi → Yine de çalıştır**.
3. Masaüstündeki **Parçala** simgesiyle aç. `.stl` / `.3mf` dosyalarına sağ tık → **Birlikte aç → Parçala** da çalışır.

## Kullanım

1. **Model aç** ya da dosyayı pencereye sürükle.
2. **+ Düz kesim** (burun, taban gibi düz çizgiden ayrılan yerler) veya **+ Tıkaç** (cam, logo, kanat) ekle.
   Tıkaç için renkli bölgenin ortasına tıkla; boyutu kaydırıcılarla ayarla. Model, parçaların renkleriyle canlı boyanır.
3. **Parçala** → parçalar renkleriyle görünür.
4. **Parçaları indir** → her parça ayrı STL (adında rengi yazar), pimler ve birleşik kontrol 3MF'i tek zip'te.
   Bambu Studio'da her parçayı seçip **F** (yüzeye yatır) ile baskı yönüne çevir.

## Geliştirme

- Uygulama kaynağı: `kaynak/ui.html` (arayüz) ve `kaynak/motor.js` (kesme motoru).
- `python kaynak/derle.py` → `index.html` üretir.
- `main` dalına her gönderimde GitHub Actions Windows kurulum dosyasını yeniden üretir ve Releases'e koyar.
  Yeni sürüm için `package.json` içindeki `version` değerini artır.
