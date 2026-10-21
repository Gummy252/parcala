// Parçala motoru (tarayıcı / Web Worker / Node). Tek fonksiyon: dışarıya bağımlılığı yok.
function parcalaMotoru() {
  'use strict';

  // ================================================================ yardımcılar
  class Buyuyen {               // büyüyen tipli dizi
    constructor(Tip, kap) { this.T = Tip; this.a = new Tip(Math.max(16, kap | 0)); this.n = 0; }
    yer(k) { if (this.n + k > this.a.length) { let m = this.a.length * 2; while (m < this.n + k) m *= 2; const b = new this.T(m); b.set(this.a.subarray(0, this.n)); this.a = b; } }
    it(x) { this.yer(1); this.a[this.n++] = x; }
    it3(x, y, z) { this.yer(3); const a = this.a, n = this.n; a[n] = x; a[n + 1] = y; a[n + 2] = z; this.n = n + 3; }
    son() { return this.a.slice(0, this.n); }
  }
  function rastgele(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  // ================================================================ ZIP
  async function zipAc(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Geçersiz 3MF (zip değil)');
    let n = dv.getUint16(e + 10, true), cd = dv.getUint32(e + 16, true);
    if (cd === 0xffffffff) {          // zip64
      const l = e - 20; const z64 = Number(dv.getBigUint64(l + 8, true));
      n = Number(dv.getBigUint64(z64 + 32, true)); cd = Number(dv.getBigUint64(z64 + 48, true));
    }
    const girdiler = new Map(); const td = new TextDecoder();
    let p = cd;
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const yontem = dv.getUint16(p + 10, true);
      let csz = dv.getUint32(p + 20, true), usz = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      let lho = dv.getUint32(p + 42, true);
      const ad = td.decode(u8.subarray(p + 46, p + 46 + nl));
      let x = p + 46 + nl; const xe = x + xl;
      while (x + 4 <= xe) {
        const id = dv.getUint16(x, true), sz = dv.getUint16(x + 2, true); let q = x + 4;
        if (id === 1) {
          if (usz === 0xffffffff) { usz = Number(dv.getBigUint64(q, true)); q += 8; }
          if (csz === 0xffffffff) { csz = Number(dv.getBigUint64(q, true)); q += 8; }
          if (lho === 0xffffffff) { lho = Number(dv.getBigUint64(q, true)); q += 8; }
        }
        x += 4 + sz;
      }
      girdiler.set(ad.replace(/^\//, ''), { yontem, csz, usz, lho });
      p = xe + cl;
    }
    async function oku(ad) {
      const g = girdiler.get(ad.replace(/^\//, ''));
      if (!g) return null;
      const lh = g.lho; const nl = dv.getUint16(lh + 26, true), xl = dv.getUint16(lh + 28, true);
      const bas = lh + 30 + nl + xl; const veri = u8.subarray(bas, bas + g.csz);
      if (g.yontem === 0) return veri;
      if (g.yontem !== 8) throw new Error('Desteklenmeyen sıkıştırma: ' + g.yontem);
      const ds = new DecompressionStream('deflate-raw');
      const out = new Response(new Blob([veri]).stream().pipeThrough(ds));
      return new Uint8Array(await out.arrayBuffer());
    }
    return { girdiler, oku };
  }

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  async function sikistir(u8) {
    if (typeof CompressionStream === 'undefined') return null;
    const cs = new CompressionStream('deflate-raw');
    return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(cs)).arrayBuffer());
  }
  async function zipYaz(dosyalar) {  // [{ad, veri:Uint8Array}] -> Blob (deflate ile sıkıştırılmış)
    const te = new TextEncoder(); const parcalar = []; const merkez = []; let ofs = 0;
    for (const d of dosyalar) {
      const ad = te.encode(d.ad); const crc = crc32(d.veri);
      let veri = d.veri, yontem = 0; const s = d.veri.length > 256 ? await sikistir(d.veri) : null;
      if (s && s.length < d.veri.length) { veri = s; yontem = 8; }
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, yontem, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, veri.length, true); lh.setUint32(22, d.veri.length, true); lh.setUint16(26, ad.length, true);
      parcalar.push(new Uint8Array(lh.buffer), ad, veri);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, yontem, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, veri.length, true); ch.setUint32(24, d.veri.length, true); ch.setUint16(28, ad.length, true);
      ch.setUint32(42, ofs, true);
      merkez.push(new Uint8Array(ch.buffer), ad);
      ofs += 30 + ad.length + veri.length;
    }
    const cdBoy = merkez.reduce((s, x) => s + x.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, dosyalar.length, true); e.setUint16(10, dosyalar.length, true);
    e.setUint32(12, cdBoy, true); e.setUint32(16, ofs, true);
    return new Blob([...parcalar, ...merkez, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }

  // ================================================================ köşe birleştirme
  function kaynakla(P, tol) {        // P: Float64Array (üçgen çorbası, 9 sayı/üçgen) -> {V, F}
    tol = tol || 1e-5;
    const n = P.length / 3; const boy = 1 << Math.max(16, Math.ceil(Math.log2(n * 2)));
    const tab = new Int32Array(boy).fill(-1);
    const qx = new Int32Array(n), qy = new Int32Array(n), qz = new Int32Array(n);
    const V = new Buyuyen(Float64Array, n * 3 / 2); const idx = new Uint32Array(n); let nv = 0;
    const kx = []; // köşe -> nicem
    const QX = new Buyuyen(Int32Array, n / 2), QY = new Buyuyen(Int32Array, n / 2), QZ = new Buyuyen(Int32Array, n / 2);
    for (let i = 0; i < n; i++) {
      const x = Math.round(P[3 * i] / tol), y = Math.round(P[3 * i + 1] / tol), z = Math.round(P[3 * i + 2] / tol);
      let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & (boy - 1);
      for (;;) {
        const t = tab[h];
        if (t < 0) { tab[h] = nv; QX.it(x); QY.it(y); QZ.it(z); V.it3(P[3 * i], P[3 * i + 1], P[3 * i + 2]); idx[i] = nv++; break; }
        if (QX.a[t] === x && QY.a[t] === y && QZ.a[t] === z) { idx[i] = t; break; }
        h = (h + 1) & (boy - 1);
      }
    }
    const F = new Buyuyen(Uint32Array, n);
    const tut = new Buyuyen(Int32Array, n / 3);
    for (let t = 0; t < n; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; if (a !== b && b !== c && c !== a) { F.it3(a, b, c); tut.it(t / 3); } }
    return { V: V.son(), F: F.son(), tut: tut.son() };
  }

  // ================================================================ STL
  function stlOku(buf) {
    const dv = new DataView(buf);
    if (buf.byteLength >= 84) {
      const n = dv.getUint32(80, true);
      if (84 + n * 50 === buf.byteLength) {
        const P = new Float64Array(n * 9);
        for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; for (let k = 0; k < 9; k++) P[i * 9 + k] = dv.getFloat32(o + 4 * k, true); }
        return kaynakla(P);
      }
    }
    const s = new TextDecoder().decode(new Uint8Array(buf)); const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    const P = new Buyuyen(Float64Array, 1 << 16); let m;
    while ((m = re.exec(s))) P.it3(+m[1], +m[2], +m[3]);
    return kaynakla(P.son());
  }
  function stlYaz(V, F) {
    const m = F.length / 3; const buf = new ArrayBuffer(84 + m * 50); const dv = new DataView(buf);
    const u8 = new Uint8Array(buf); const bas = new TextEncoder().encode('parcala'); u8.set(bas, 0);
    dv.setUint32(80, m, true);
    for (let t = 0; t < m; t++) {
      const a = F[3 * t] * 3, b = F[3 * t + 1] * 3, c = F[3 * t + 2] * 3;
      const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2];
      const vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
      const o = 84 + t * 50;
      dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
      let q = o + 12; for (const i of [a, b, c]) { dv.setFloat32(q, V[i], true); dv.setFloat32(q + 4, V[i + 1], true); dv.setFloat32(q + 8, V[i + 2], true); q += 12; }
    }
    return new Uint8Array(buf);
  }

  // ================================================================ 3MF
  function attrs(s) { const o = {}; const re = /([\w:]+)="([^"]*)"/g; let m; while ((m = re.exec(s))) o[m[1]] = m[2]; return o; }
  function matris(s) {               // 3MF satır-vektör matrisini 4x4 sütun düzenine çevirir
    if (!s) return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    const a = s.trim().split(/\s+/).map(Number);
    return [a[0], a[3], a[6], a[9], a[1], a[4], a[7], a[10], a[2], a[5], a[8], a[11]]; // satır satır 3x4
  }
  function carp(A, B) {              // 3x4 x 3x4 (ikisi de afine)
    const R = new Array(12);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) R[i * 4 + j] = A[i * 4] * B[j] + A[i * 4 + 1] * B[4 + j] + A[i * 4 + 2] * B[8 + j];
      R[i * 4 + 3] = A[i * 4] * B[3] + A[i * 4 + 1] * B[7] + A[i * 4 + 2] * B[11] + A[i * 4 + 3];
    }
    return R;
  }
  // Bambu/Prusa boya kodu (TriangleSelector): onaltılık dizi sondan başa, her yarım bayt: alt 2 bit bölünme,
  // üst 2 bit durum (yaprak) ya da özel kenar (bölünmüş); durum 3 ise sonraki yarım bayt + 3. Alanca baskın rengi döndürür.
  function boyaCoz(h) {
    const n = h.length; let i = 0; const ag = new Map();
    const yb = () => (i < n ? parseInt(h[n - 1 - i++], 16) : 0);
    function dugum(w, derin) {
      if (i >= n || derin > 12) return;
      const x = yb(); const bol = x & 3, ust = x >> 2;
      if (bol === 0) { const st = ust === 3 ? yb() + 3 : ust; ag.set(st, (ag.get(st) || 0) + w); }
      else { const c = bol + 1; for (let k = 0; k < c; k++) dugum(w / c, derin + 1); }
    }
    dugum(1, 0);
    let en = 0, ew = -1; for (const [st, w] of ag) if (w > ew) { ew = w; en = st; }
    return en;
  }
  function modelCoz(metin) {
    const nesneler = new Map(); let i = 0;
    for (;;) {
      const b = metin.indexOf('<object', i); if (b < 0) break;
      const he = metin.indexOf('>', b); const bas = metin.slice(b, he + 1);
      const e = bas.endsWith('/>') ? he + 1 : metin.indexOf('</object>', he);
      const govde = metin.slice(he + 1, e); const at = attrs(bas);
      const n = { ad: at.name || '', mesh: null, bilesen: [] };
      const vi = govde.indexOf('<vertices'); const ti = govde.indexOf('<triangles');
      if (vi >= 0 && ti >= 0) {
        const vs = govde.slice(vi, govde.indexOf('</vertices>', vi)); const ts = govde.slice(ti, govde.indexOf('</triangles>', ti));
        const V = new Buyuyen(Float64Array, 1 << 16); const rv = /<vertex\s[^>]*?x="([^"]*)"[^>]*?y="([^"]*)"[^>]*?z="([^"]*)"/g; let m;
        while ((m = rv.exec(vs))) V.it3(+m[1], +m[2], +m[3]);
        const F = new Buyuyen(Uint32Array, 1 << 16);
        const boyaliMi = ts.indexOf('paint_color="') >= 0;
        let renk = null, boya = 0;
        if (!boyaliMi) { const rt = /<triangle\s[^>]*?v1="(\d+)"[^>]*?v2="(\d+)"[^>]*?v3="(\d+)"/g; while ((m = rt.exec(ts))) F.it3(+m[1], +m[2], +m[3]); }
        else {
          const R = new Buyuyen(Uint8Array, 1 << 16); const onb = new Map();
          const rt = /<triangle\s([^>]*?)\/?>/g;
          while ((m = rt.exec(ts))) {
            const a = m[1]; const v1 = /v1="(\d+)"/.exec(a), v2 = /v2="(\d+)"/.exec(a), v3 = /v3="(\d+)"/.exec(a);
            F.it3(+v1[1], +v2[1], +v3[1]);
            const p = a.indexOf('paint_color="'); let st = 0;
            if (p >= 0) { const e = a.indexOf('"', p + 13); const h = a.slice(p + 13, e); if (h) { st = onb.get(h); if (st === undefined) { st = boyaCoz(h); onb.set(h, st); } boya++; } }
            R.it(st);
          }
          renk = R.son();
        }
        n.mesh = { V: V.son(), F: F.son(), boya, renk };
      }
      const rc = /<component\b([^>]*)\/>/g; let m;
      while ((m = rc.exec(govde))) { const c = attrs(m[1]); n.bilesen.push({ yol: c['p:path'], id: c.objectid, M: matris(c.transform) }); }
      nesneler.set(at.id, n); i = e;
    }
    const build = []; const rb = /<item\b([^>]*)\/>/g; let m;
    while ((m = rb.exec(metin))) { const a = attrs(m[1]); build.push({ id: a.objectid, M: matris(a.transform) }); }
    return { nesneler, build };
  }
  async function ucmfOku(buf, ilerle, secim) {
    const z = await zipAc(buf); const td = new TextDecoder(); const onbellek = new Map();
    async function model(yol) {
      if (onbellek.has(yol)) return onbellek.get(yol);
      ilerle && ilerle('3MF açılıyor: ' + yol);
      const v = await z.oku(yol); if (!v) throw new Error('3MF içinde bulunamadı: ' + yol);
      const r = modelCoz(td.decode(v)); onbellek.set(yol, r); return r;
    }
    const ana = '3D/3dmodel.model';
    const { build } = await model(ana);
    // Bambu ayarları: parça adları ve extruder
    let ayar = new Map();
    const ms = await z.oku('Metadata/model_settings.config');
    if (ms) {
      const s = td.decode(ms); const ro = /<object id="(\d+)">([\s\S]*?)<\/object>/g; let m;
      while ((m = ro.exec(s))) {
        const g = m[2]; const parcalar = []; const rp = /<part id="(\d+)"[^>]*>([\s\S]*?)<\/part>/g; let p;
        const ex = /key="extruder" value="(\d+)"/.exec(g);
        while ((p = rp.exec(g))) { const ad = /key="name" value="([^"]*)"/.exec(p[2]); const e = /key="extruder" value="(\d+)"/.exec(p[2]); const tur = /subtype="([^"]*)"/.exec(p[0]); parcalar.push({ ad: ad ? ad[1] : '', ext: e ? +e[1] : (ex ? +ex[1] : 1), tur: tur ? tur[1] : 'normal_part' }); }
        const oad = /key="name" value="([^"]*)"/.exec(g); const yuz = /face_count="(\d+)"/.exec(g);
        ayar.set(m[1], { ext: ex ? +ex[1] : 1, parcalar, ad: oad ? oad[1] : '', yuz: yuz ? +yuz[1] : 0 });
      }
    }
    // dosyadaki nesneler (plakadaki her öğe); seçim yapılmadıysa sadece liste döner
    const liste = build.map((b, i) => { const a = ayar.get(b.id); return { i, id: b.id, ad: (a && a.ad) || ('Nesne ' + (i + 1)), yuz: a ? a.yuz : 0, renk: a ? a.ext : 1 }; });
    if (secim === 'liste') return { liste };
    const secilen = secim == null || secim === 'hepsi' ? build : build.filter((b, i) => secim.includes(i));
    const parcalar = [];
    async function gez(yol, id, M, ust, sira) {
      const { nesneler } = await model(yol); const n = nesneler.get(id); if (!n) return;
      const a = ayar.get(ust); const tur = a && a.parcalar[sira] ? a.parcalar[sira].tur : 'normal_part';
      if (n.mesh && tur === 'normal_part') parcalar.push({ ad: n.ad, V: donustur(n.mesh.V, M), F: n.mesh.F, boya: n.mesh.boya, renk: n.mesh.renk, nesne: ust, sira });
      let k = 0; for (const c of n.bilesen) { const kk = k++; const ta = a && a.parcalar[kk] ? a.parcalar[kk].tur : 'normal_part'; if (ust === id && ta !== 'normal_part') continue; await gez(c.yol ? c.yol.replace(/^\//, '') : yol, c.id, carp(M, c.M), ust, kk); }
    }
    for (const b of secilen) await gez(ana, b.id, b.M, b.id, 0);
    for (const p of parcalar) {
      const a = ayar.get(p.nesne); p.ext = 1;
      if (a) { p.ext = a.ext; if (a.parcalar[p.sira]) { p.ad = a.parcalar[p.sira].ad || p.ad; p.ext = a.parcalar[p.sira].ext; } }
    }
    // filament renkleri
    let filament = null;
    const ps = await z.oku('Metadata/project_settings.config');
    if (ps) { const m2 = /"filament_colour"\s*:\s*\[([^\]]*)\]/.exec(td.decode(ps)); if (m2) filament = [...m2[1].matchAll(/"(#[0-9A-Fa-f]{6,8})"/g)].map(x => x[1].slice(0, 7)); }
    parcalar.filament = filament;
    return parcalar;
  }
  function donustur(V, M) {
    const R = new Float64Array(V.length);
    for (let i = 0; i < V.length; i += 3) {
      const x = V[i], y = V[i + 1], z = V[i + 2];
      R[i] = M[0] * x + M[1] * y + M[2] * z + M[3]; R[i + 1] = M[4] * x + M[5] * y + M[6] * z + M[7]; R[i + 2] = M[8] * x + M[9] * y + M[10] * z + M[11];
    }
    return R;
  }
  async function ucmfYaz(nesneler) { // [{ad, V, F}] -> Blob (zip)
    const te = new TextEncoder(); const par = [];
    par.push('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<resources>\n');
    nesneler.forEach((o, i) => {
      par.push(`<object id="${i + 1}" name="${o.ad.replace(/[<>&"]/g, '')}" type="model"><mesh><vertices>\n`);
      let s = []; for (let k = 0; k < o.V.length; k += 3) { s.push(`<vertex x="${o.V[k].toFixed(5)}" y="${o.V[k + 1].toFixed(5)}" z="${o.V[k + 2].toFixed(5)}"/>`); if (s.length > 20000) { par.push(s.join('\n')); s = []; } }
      par.push(s.join('\n')); par.push('\n</vertices><triangles>\n'); s = [];
      for (let k = 0; k < o.F.length; k += 3) { s.push(`<triangle v1="${o.F[k]}" v2="${o.F[k + 1]}" v3="${o.F[k + 2]}"/>`); if (s.length > 20000) { par.push(s.join('\n')); s = []; } }
      par.push(s.join('\n')); par.push('\n</triangles></mesh></object>\n');
    });
    par.push('</resources>\n<build>\n'); nesneler.forEach((o, i) => par.push(`<item objectid="${i + 1}"/>\n`)); par.push('</build>\n</model>\n');
    const model = te.encode(par.join(''));
    const ct = te.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>');
    const rels = te.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>');
    return await zipYaz([{ ad: '[Content_Types].xml', veri: ct }, { ad: '_rels/.rels', veri: rels }, { ad: '3D/3dmodel.model', veri: model }]);
  }

  // ================================================================ ölçü / kontrol
  function sinirlar(V) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < V.length; i += 3) for (let k = 0; k < 3; k++) { const x = V[i + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; }
    return { lo, hi };
  }
  function hacim(V, F) {
    let s = 0;
    for (let t = 0; t < F.length; t += 3) {
      const a = F[t] * 3, b = F[t + 1] * 3, c = F[t + 2] * 3;
      s += V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c]);
    }
    return s / 6;
  }
  function kapaliMi(V, F) {
    const N = V.length / 3 + 1; const m = F.length;
    const k = new Float64Array(m), r = new Float64Array(m);
    for (let t = 0; t < m; t += 3) for (let i = 0; i < 3; i++) { const a = F[t + i], b = F[t + (i + 1) % 3]; k[t + i] = a * N + b; r[t + i] = b * N + a; }
    k.sort(); let tekrar = 0; for (let i = 1; i < m; i++) if (k[i] === k[i - 1]) tekrar++;
    let acik = 0;
    for (let i = 0; i < m; i++) { let lo = 0, hi = m - 1; const x = r[i]; while (lo < hi) { const md = (lo + hi) >> 1; if (k[md] < x) lo = md + 1; else hi = md; } if (k[lo] !== x) acik++; }
    return { kapali: tekrar === 0 && acik === 0, tekrar, acik };
  }

  // ================================================================ yerel eksen
  function eksen(O, ew, yukari) {
    let w = norm(ew);
    let up = yukari || (Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]);
    let d = dot(up, w); let v = [up[0] - w[0] * d, up[1] - w[1] * d, up[2] - w[2] * d];
    if (Math.hypot(...v) < 1e-6) { up = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]; d = dot(up, w); v = [up[0] - w[0] * d, up[1] - w[1] * d, up[2] - w[2] * d]; }
    v = norm(v); const u = cross(v, w);
    return { O: O.slice(), u, v, w };
  }
  function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  // ================================================================ DELAUNAY (Lawson artımlı)
  function delaunay(X, Y) {
    const n = X.length;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { if (X[i] < x0) x0 = X[i]; if (X[i] > x1) x1 = X[i]; if (Y[i] < y0) y0 = Y[i]; if (Y[i] > y1) y1 = Y[i]; }
    const D = Math.max(x1 - x0, y1 - y0) || 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const px = new Float64Array(n + 3), py = new Float64Array(n + 3);
    px.set(X); py.set(Y);
    px[n] = cx - 40 * D; py[n] = cy - 30 * D; px[n + 1] = cx + 40 * D; py[n + 1] = cy - 30 * D; px[n + 2] = cx; py[n + 2] = cy + 40 * D;
    const cap = 2 * (n + 3) + 8;
    const tv = new Int32Array(cap * 3), tn = new Int32Array(cap * 3).fill(-1);
    let nt = 1; tv[0] = n; tv[1] = n + 1; tv[2] = n + 2;
    const eps = 1e-12 * D * D;
    const orient = (a, b, c) => (px[b] - px[a]) * (py[c] - py[a]) - (py[b] - py[a]) * (px[c] - px[a]);
    function incircle(a, b, c, d) {
      const adx = px[a] - px[d], ady = py[a] - py[d], bdx = px[b] - px[d], bdy = py[b] - py[d], cdx = px[c] - px[d], cdy = py[c] - py[d];
      const al = adx * adx + ady * ady, bl = bdx * bdx + bdy * bdy, cl = cdx * cdx + cdy * cdy;
      return adx * (bdy * cl - bl * cdy) - ady * (bdx * cl - bl * cdx) + al * (bdx * cdy - bdy * cdx);
    }
    function komsuDegis(t, eski, yeni) { if (t < 0) return; for (let k = 0; k < 3; k++) if (tn[3 * t + k] === eski) { tn[3 * t + k] = yeni; return; } }
    function kenarBul(u, a, b) { for (let k = 0; k < 3; k++) if (tv[3 * u + k] === a && tv[3 * u + (k + 1) % 3] === b) return k; return -1; }
    const yigin = [];
    function mesrulastir(p) {
      while (yigin.length) {
        const t = yigin.pop();
        // t'de p hangi indekste? karşı kenar (p'den sonraki iki köşe)
        let ip = -1; for (let k = 0; k < 3; k++) if (tv[3 * t + k] === p) ip = k;
        if (ip < 0) continue;
        const ia = (ip + 1) % 3, ib = (ip + 2) % 3;
        const a = tv[3 * t + ia], b = tv[3 * t + ib];
        const u = tn[3 * t + ia]; // a->b kenarındaki komşu
        if (u < 0) continue;
        const j = kenarBul(u, b, a); if (j < 0) continue;
        const d = tv[3 * u + (j + 2) % 3];
        if (incircle(a, b, p, d) <= 0) continue;
        if (orient(p, a, d) <= 0 || orient(p, d, b) <= 0) continue; // dışbükey değil
        const Nbp = tn[3 * t + ib], Npa = tn[3 * t + ip];
        const Nad = tn[3 * u + (j + 1) % 3], Ndb = tn[3 * u + (j + 2) % 3];
        // t=(a,d,p)  u=(d,b,p)
        tv[3 * t] = a; tv[3 * t + 1] = d; tv[3 * t + 2] = p; tn[3 * t] = Nad; tn[3 * t + 1] = u; tn[3 * t + 2] = Npa;
        tv[3 * u] = d; tv[3 * u + 1] = b; tv[3 * u + 2] = p; tn[3 * u] = Ndb; tn[3 * u + 1] = Nbp; tn[3 * u + 2] = t;
        komsuDegis(Nad, u, t); komsuDegis(Nbp, t, u);
        yigin.push(t, u);
      }
    }
    let son = 0;
    function bul(p) {
      let t = son, adim = 0;
      for (;;) {
        if (++adim > 4 * nt + 100) { // yedek: kaba arama
          for (let s = 0; s < nt; s++) { const a = tv[3 * s], b = tv[3 * s + 1], c = tv[3 * s + 2]; if (orient(a, b, p) >= -eps && orient(b, c, p) >= -eps && orient(c, a, p) >= -eps) return s; }
          return -1;
        }
        let gec = -1;
        for (let k = 0; k < 3; k++) { const a = tv[3 * t + k], b = tv[3 * t + (k + 1) % 3]; if (orient(a, b, p) < -eps) { gec = k; break; } }
        if (gec < 0) return t;
        const u = tn[3 * t + gec]; if (u < 0) return -1; t = u;
      }
    }
    for (let p = 0; p < n; p++) {
      const t = bul(p); if (t < 0) continue;
      const a = tv[3 * t], b = tv[3 * t + 1], c = tv[3 * t + 2];
      const o = [orient(a, b, p), orient(b, c, p), orient(c, a, p)];
      // aynı nokta mı?
      let ayni = false; for (const q of [a, b, c]) if (px[q] === px[p] && py[q] === py[p]) ayni = true;
      if (ayni) continue;
      let kenar = -1; for (let k = 0; k < 3; k++) if (Math.abs(o[k]) <= eps) kenar = k;
      if (kenar < 0) {
        const Nab = tn[3 * t], Nbc = tn[3 * t + 1], Nca = tn[3 * t + 2];
        const t1 = nt++, t2 = nt++;
        tv.set([a, b, p], 3 * t); tn.set([Nab, t1, t2], 3 * t);
        tv.set([b, c, p], 3 * t1); tn.set([Nbc, t2, t], 3 * t1);
        tv.set([c, a, p], 3 * t2); tn.set([Nca, t, t1], 3 * t2);
        komsuDegis(Nbc, t, t1); komsuDegis(Nca, t, t2);
        yigin.push(t, t1, t2); mesrulastir(p); son = t;
      } else {
        // p, t'nin kenar 'kenar' üzerinde
        const A = tv[3 * t + kenar], B = tv[3 * t + (kenar + 1) % 3], Cc = tv[3 * t + (kenar + 2) % 3];
        const Nbc = tn[3 * t + (kenar + 1) % 3], Nca = tn[3 * t + (kenar + 2) % 3];
        const u = tn[3 * t + kenar];
        if (u < 0) continue;
        const j = kenarBul(u, B, A); if (j < 0) continue;
        const Dd = tv[3 * u + (j + 2) % 3];
        const Nad = tn[3 * u + (j + 1) % 3], Ndb = tn[3 * u + (j + 2) % 3];
        const T2 = nt++, T4 = nt++;
        tv.set([B, Cc, p], 3 * t); tn.set([Nbc, T2, T4], 3 * t);
        tv.set([Cc, A, p], 3 * T2); tn.set([Nca, u, t], 3 * T2);
        tv.set([A, Dd, p], 3 * u); tn.set([Nad, T4, T2], 3 * u);
        tv.set([Dd, B, p], 3 * T4); tn.set([Ndb, t, u], 3 * T4);
        komsuDegis(Nca, t, T2); komsuDegis(Ndb, u, T4);
        yigin.push(t, T2, u, T4); mesrulastir(p); son = t;
      }
    }
    const out = new Buyuyen(Int32Array, nt * 3);
    for (let t = 0; t < nt; t++) { const a = tv[3 * t], b = tv[3 * t + 1], c = tv[3 * t + 2]; if (a < n && b < n && c < n) out.it3(a, b, c); }
    return out.son();
  }

  // ================================================================ KESİM
  class KesimHatasi extends Error {}

  function kes(V, F, E, g, ust, izgara, ozel, ozelBosluk, param) {
    param = param || ((u, v) => [u, v]);
    const nV = V.length / 3, nF = F.length / 3;
    const O = E.O, eu = E.u, ev = E.v, ew = E.w;
    const yerel = (x, y, z) => { const dx = x - O[0], dy = y - O[1], dz = z - O[2]; return [dx * eu[0] + dy * eu[1] + dz * eu[2], dx * ev[0] + dy * ev[1] + dz * ev[2], dx * ew[0] + dy * ew[1] + dz * ew[2]]; };
    const tut = new Uint8Array(nV);
    let hepsi = true, hic = true;
    for (let i = 0; i < nV; i++) {
      const [u, v, w] = yerel(V[3 * i], V[3 * i + 1], V[3 * i + 2]);
      const f = w - g(u, v); const k = ust ? f > 0 : !(f > 0); tut[i] = k ? 1 : 0;
    }
    let tam = 0, karisik = 0;
    for (let t = 0; t < nF; t++) { const s = tut[F[3 * t]] + tut[F[3 * t + 1]] + tut[F[3 * t + 2]]; if (s === 3) tam++; else if (s > 0) karisik++; if (s !== 3) hepsi = false; if (s !== 0) hic = false; }
    if (hepsi) return { V, F };
    if (hic) return null;
    const yeniV = new Buyuyen(Float64Array, karisik * 3 + 1024);
    for (let i = 0; i < V.length; i++) yeniV.it(V[i]);
    const kenarHarita = new Map();
    function kesisim(a, b) {
      const key = a < b ? a * nV + b : b * nV + a;
      let id = kenarHarita.get(key); if (id !== undefined) return id;
      const ax = V[3 * a], ay = V[3 * a + 1], az = V[3 * a + 2], bx = V[3 * b], by = V[3 * b + 1], bz = V[3 * b + 2];
      // a'nın işareti
      const [ua, va, wa] = yerel(ax, ay, az); const sa = (wa - g(ua, va)) > 0;
      let lo = 0, hi = 1;
      for (let it = 0; it < 30; it++) {
        const m = (lo + hi) / 2; const [u, v, w] = yerel(ax + (bx - ax) * m, ay + (by - ay) * m, az + (bz - az) * m);
        if (((w - g(u, v)) > 0) === sa) lo = m; else hi = m;
      }
      const t = Math.min(0.97, Math.max(0.03, (lo + hi) / 2));
      id = yeniV.n / 3; yeniV.it3(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
      kenarHarita.set(key, id); return id;
    }
    const Fk = new Buyuyen(Uint32Array, tam * 3 + karisik * 6 + 1024);
    const sinir = new Map();                 // a -> b (tutulan üçgenlerdeki yönlü kesim kenarı)
    for (let t = 0; t < nF; t++) {
      const f0 = F[3 * t], f1 = F[3 * t + 1], f2 = F[3 * t + 2];
      const s0 = tut[f0], s1 = tut[f1], s2 = tut[f2]; const s = s0 + s1 + s2;
      if (s === 3) { Fk.it3(f0, f1, f2); continue; }
      if (s === 0) continue;
      const yalnizTutulan = s === 1;
      let r0, r1, r2;
      if (yalnizTutulan) { if (s0) { r0 = f0; r1 = f1; r2 = f2; } else if (s1) { r0 = f1; r1 = f2; r2 = f0; } else { r0 = f2; r1 = f0; r2 = f1; } }
      else { if (!s0) { r0 = f0; r1 = f1; r2 = f2; } else if (!s1) { r0 = f1; r1 = f2; r2 = f0; } else { r0 = f2; r1 = f0; r2 = f1; } }
      const p = kesisim(r0, r1), q = kesisim(r0, r2);
      if (yalnizTutulan) { Fk.it3(r0, p, q); sinir.set(p, q); }
      else { Fk.it3(p, r1, r2); Fk.it3(p, r2, q); sinir.set(q, p); }
    }
    const taban = nV;
    let Vall = yeniV;
    // ---- döngüler
    function donguKur() {
      const ds = []; const gor = new Set();
      for (const a0 of sinir.keys()) {
        if (gor.has(a0)) continue; const d = [a0]; gor.add(a0); let a = sinir.get(a0); let guard = 0;
        while (a !== a0) { if (a === undefined || ++guard > sinir.size + 5) throw new KesimHatasi('kesim çizgisi kapanmıyor (model açık olabilir)'); d.push(a); gor.add(a); a = sinir.get(a); }
        ds.push(d);
      }
      return ds;
    }
    let donguler = donguKur();
    // uv koordinatları (indeks: köşe - taban)
    let BU = [], BV = [];
    let BX = [], BY = [];
    for (let i = taban; i < Vall.n / 3; i++) { const [u, v] = yerel(Vall.a[3 * i], Vall.a[3 * i + 1], Vall.a[3 * i + 2]); BU.push(u); BV.push(v); const [x, y] = param(u, v); BX.push(x); BY.push(y); }

    // ---- bölge testi (tüm döngü kenarları, y-kovaları, tek-çift kuralı)
    let bolge;
    function bolgeKur() {
      const ex = [], ey = [], fx = [], fy = [];
      for (const d of donguler) for (let k = 0; k < d.length; k++) { const a = d[k] - taban, b = d[(k + 1) % d.length] - taban; ex.push(BX[a]); ey.push(BY[a]); fx.push(BX[b]); fy.push(BY[b]); }
      let y0 = Infinity, y1 = -Infinity; for (const y of ey) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const nb = Math.max(1, Math.min(4096, Math.ceil(Math.sqrt(ex.length) * 2))); const h = (y1 - y0) / nb || 1;
      const kova = Array.from({ length: nb }, () => []);
      for (let i = 0; i < ex.length; i++) { const a = Math.max(0, Math.floor((Math.min(ey[i], fy[i]) - y0) / h)), b = Math.min(nb - 1, Math.floor((Math.max(ey[i], fy[i]) - y0) / h)); for (let k = a; k <= b; k++) kova[k].push(i); }
      bolge = (x, y) => {
        if (y < y0 || y > y1) return false; const k = Math.min(nb - 1, Math.floor((y - y0) / h)); let c = false;
        for (const i of kova[k]) { const ya = ey[i], yb = fy[i]; if ((ya > y) !== (yb > y)) { const xx = ex[i] + (y - ya) / (yb - ya) * (fx[i] - ex[i]); if (xx > x) c = !c; } }
        return c;
      };
    }
    bolgeKur();

    // ---- ara noktalar
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < BU.length; i++) { if (BU[i] < u0) u0 = BU[i]; if (BU[i] > u1) u1 = BU[i]; if (BV[i] < v0) v0 = BV[i]; if (BV[i] > v1) v1 = BV[i]; }
    if ((u1 - u0) * (v1 - v0) / (izgara * izgara) > 6e6) throw new KesimHatasi('kesim yüzeyi çok büyük');
    // sınır noktaları ızgarası (mesafe testi için)
    const hc = 0.6 * izgara; const sozluk = new Map();
    const hucre = (x, y) => Math.floor(x / hc) * 73856093 ^ Math.floor(y / hc) * 19349663;
    for (const d of donguler) for (let k = 0; k < d.length; k++) {
      const a = d[k] - taban, b = d[(k + 1) % d.length] - taban; const L = Math.hypot(BX[b] - BX[a], BY[b] - BY[a]); const m = Math.max(1, Math.ceil(L / (izgara / 4)));
      for (let s = 0; s < m; s++) { const x = BX[a] + (BX[b] - BX[a]) * s / m, y = BY[a] + (BY[b] - BY[a]) * s / m; const hk = hucre(x, y); let l = sozluk.get(hk); if (!l) sozluk.set(hk, l = []); l.push(x, y); }
    }
    const sinirYakin = (x, y) => {
      const cx = Math.floor(x / hc), cy = Math.floor(y / hc);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = sozluk.get((cx + i) * 73856093 ^ (cy + j) * 19349663); if (!l) continue; for (let k = 0; k < l.length; k += 2) if (Math.hypot(l[k] - x, l[k + 1] - y) < hc) return true; }
      return false;
    };
    const GU = [], GV = [], GX = [], GY = []; const rnd = rastgele(12345);
    const ozelYakin = (x, y) => { if (!ozel || !ozelBosluk) return false; for (let k = 0; k < ozel.length; k += 2) if (Math.hypot(ozel[k] - x, ozel[k + 1] - y) < ozelBosluk) return true; return false; };
    for (let y = v0 - izgara; y < v1 + izgara; y += izgara) for (let x = u0 - izgara; x < u1 + izgara; x += izgara) {
      const px = x + (rnd() - 0.5) * izgara * 0.05, py = y + (rnd() - 0.5) * izgara * 0.05;
      if (ozelYakin(px, py)) continue; const [qx, qy] = param(px, py);
      if (!bolge(qx, qy) || sinirYakin(qx, qy)) continue; GU.push(px); GV.push(py); GX.push(qx); GY.push(qy);
    }
    if (ozel) for (let k = 0; k < ozel.length; k += 2) { const x = ozel[k], y = ozel[k + 1]; const [qx, qy] = param(x, y); if (bolge(qx, qy) && !sinirYakin(qx, qy)) { GU.push(x); GV.push(y); GX.push(qx); GY.push(qy); } }
    // çerçeve noktaları (dış bükey zarf bunlar olsun)
    const CU = [], CV = []; const pad = 3 * izgara + 0.5;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < BX.length; i++) { if (BX[i] < x0) x0 = BX[i]; if (BX[i] > x1) x1 = BX[i]; if (BY[i] < y0) y0 = BY[i]; if (BY[i] > y1) y1 = BY[i]; }
    const cu0 = x0 - pad, cu1 = x1 + pad, cv0 = y0 - pad, cv1 = y1 + pad; const adim = Math.max(izgara * 2, (cu1 - cu0 + cv1 - cv0) / 400);
    for (let x = cu0; x < cu1; x += adim) { CU.push(x, x); CV.push(cv0, cv1); }
    for (let y = cv0; y < cv1; y += adim) { CU.push(cu0, cu1); CV.push(y, y); }
    CU.push(cu1); CV.push(cv1);

    // ---- üçgenle + kenar kurtarma
    let T, nB, oncekiEksik = 0;
    for (let tur = 0; ; tur++) {
      nB = BU.length;
      const X = Float64Array.from([...BX, ...GX, ...CU]), Y = Float64Array.from([...BY, ...GY, ...CV]);
      const Tall = delaunay(X, Y);
      const nReal = nB + GU.length;
      const tl = new Buyuyen(Int32Array, Tall.length);
      for (let t = 0; t < Tall.length; t += 3) {
        const a = Tall[t], b = Tall[t + 1], c = Tall[t + 2];
        if (a >= nReal || b >= nReal || c >= nReal) continue;
        if (bolge((X[a] + X[b] + X[c]) / 3, (Y[a] + Y[b] + Y[c]) / 3)) tl.it3(a, b, c);
      }
      T = tl.son();
      const ks = new Set();
      for (let t = 0; t < T.length; t += 3) for (let k = 0; k < 3; k++) { const a = T[t + k], b = T[t + (k + 1) % 3]; ks.add(a < b ? a * 1e7 + b : b * 1e7 + a); }
      const eksik = [];
      for (const [a, b] of sinir) { const ia = a - taban, ib = b - taban; if (!ks.has(ia < ib ? ia * 1e7 + ib : ib * 1e7 + ia)) eksik.push([a, b]); }
      if (typeof process !== 'undefined' && process.env.PDEBUG) console.log('   tur', tur, 'nB', nB, 'eksik', eksik.length);
      if (!eksik.length) break;
      if (tur >= 14) throw new KesimHatasi('kapak oluşturulamadı');
      // eksikler hızla artıyorsa (yüzey kendi üstüne katlanıyor) boşuna uğraşma
      if (tur >= 4 && eksik.length > 3 * (oncekiEksik || 1) && eksik.length > 40) throw new KesimHatasi('kapak oluşturulamadı');
      oncekiEksik = Math.min(oncekiEksik || Infinity, eksik.length);
      // eksik kenarları ortadan böl
      const yuzBul = new Map();   // yönlü kenar -> yüz indeksi (sadece gerekenler)
      const isteniyor = new Set(eksik.map(([a, b]) => a * 1e7 + b));
      for (let t = 0; t < Fk.n; t += 3) for (let k = 0; k < 3; k++) { const a = Fk.a[t + k], b = Fk.a[t + (k + 1) % 3]; const key = a * 1e7 + b; if (isteniyor.has(key)) yuzBul.set(key, t); }
      for (const [a, b] of eksik) {
        const t = yuzBul.get(a * 1e7 + b); if (t === undefined) throw new KesimHatasi('kenar onarımı başarısız');
        const mi = Vall.n / 3;
        Vall.it3((Vall.a[3 * a] + Vall.a[3 * b]) / 2, (Vall.a[3 * a + 1] + Vall.a[3 * b + 1]) / 2, (Vall.a[3 * a + 2] + Vall.a[3 * b + 2]) / 2);
        const [mu, mv] = yerel(Vall.a[3 * mi], Vall.a[3 * mi + 1], Vall.a[3 * mi + 2]); BU.push(mu); BV.push(mv); const [mx, my] = param(mu, mv); BX.push(mx); BY.push(my);
        let k = 0; while (Fk.a[t + k] !== a) k++; const x = Fk.a[t + (k + 2) % 3];
        Fk.a[t] = a; Fk.a[t + 1] = mi; Fk.a[t + 2] = x; Fk.it3(mi, b, x);
        sinir.set(a, mi); sinir.set(mi, b);
      }
      donguler = donguKur(); bolgeKur();
    }
    // ---- kapak ekle
    const gTaban = Vall.n / 3;
    for (let i = 0; i < GU.length; i++) {
      const u = GU[i], v = GV[i], w = g(u, v);
      Vall.it3(O[0] + u * eu[0] + v * ev[0] + w * ew[0], O[1] + u * eu[1] + v * ev[1] + w * ew[1], O[2] + u * eu[2] + v * ev[2] + w * ew[2]);
    }
    const harita = i => i < nB ? taban + i : gTaban + (i - nB);
    const PU = [...BX, ...GX], PV = [...BY, ...GY];
    for (let t = 0; t < T.length; t += 3) {
      const a = T[t], b = T[t + 1], c = T[t + 2];
      const cr = (PU[b] - PU[a]) * (PV[c] - PV[a]) - (PV[b] - PV[a]) * (PU[c] - PU[a]);
      if ((cr > 0) === ust) Fk.it3(harita(a), harita(c), harita(b)); else Fk.it3(harita(a), harita(b), harita(c));
    }
    // ---- sıkıştır
    const Fo = Fk.son(); const VA = Vall.a; const nAll = Vall.n / 3;
    const yeni = new Int32Array(nAll).fill(-1); let m = 0;
    for (let i = 0; i < Fo.length; i++) { const x = Fo[i]; if (yeni[x] < 0) yeni[x] = m++; Fo[i] = yeni[x]; }
    const Vo = new Float64Array(m * 3);
    for (let i = 0; i < nAll; i++) { const j = yeni[i]; if (j >= 0) { Vo[3 * j] = VA[3 * i]; Vo[3 * j + 1] = VA[3 * i + 1]; Vo[3 * j + 2] = VA[3 * i + 2]; } }
    return { V: Vo, F: Fo };
  }

  function guvenliKes(V, F, E, g, ust, izgara, ozel, ozelBosluk, param) {
    let son;
    for (const d of [0, 0.004, -0.004, 0.011, -0.011, 0.023, -0.023]) {
      try { return kes(V, F, E, (u, v) => g(u, v) + d, ust, izgara, ozel, ozelBosluk, param); }
      catch (e) { if (!(e instanceof KesimHatasi)) throw e; son = e; }
    }
    throw new Error('Kesim yapılamadı: ' + son.message);
  }

  // ================================================================ kesim tipleri
  const GECIS = 0.03;
  const adimF = (u, v, cx, cy, r, d) => 1 - Math.min(1, Math.max(0, (Math.hypot(u - cx, v - cy) - (r - d)) / (2 * d)));
  function halka(cx, cy, r, d, h, out) {
    for (const rr of [r - d, r + d]) { const n = Math.max(16, Math.ceil(2 * Math.PI * rr / h)); for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; out.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } }
    return out;
  }

  function tabanSekli(t) {                 // {sekil, en, boy, yaricap, aci, kaydirU, kaydirV}
    const du = t.kaydirU || 0, dv = t.kaydirV || 0, ca = Math.cos((t.aci || 0) * Math.PI / 180), sa = Math.sin((t.aci || 0) * Math.PI / 180);
    const yerel = (u, v) => { const x = u - du, y = v - dv; return [x * ca + y * sa, -x * sa + y * ca]; };
    if (t.sekil === 'daire') { const r = t.yaricap || t.en / 2; return { sd: (u, v) => { const [x, y] = yerel(u, v); return Math.hypot(x, y) - r; }, kapsam: r + Math.hypot(du, dv) }; }
    let poly;
    if (t.sekil === 'cokgen' && t.noktalar && t.noktalar.length >= 3) poly = t.noktalar.map(p => [p[0], p[1]]);
    else if (t.sekil === 'elips') { const a = t.en / 2, b = t.boy / 2; poly = []; for (let i = 0; i < 180; i++) { const q = 2 * Math.PI * i / 180; poly.push([a * Math.cos(q), b * Math.sin(q)]); } }
    else { const a = t.en / 2, b = t.boy / 2; poly = [[-a, -b], [a, -b], [a, b], [-a, b]]; }
    const R = Math.max(...poly.map(p => Math.hypot(p[0], p[1])));
    let mx = 0, my = 0; for (const p of poly) { mx += p[0] / poly.length; my += p[1] / poly.length; }
    return {
      merkez: t.sekil === 'cokgen' ? [du + mx * ca - my * sa, dv + mx * sa + my * ca] : null,
      kapsam: R + Math.hypot(du, dv),
      sd: (u, v) => {
        const [x, y] = yerel(u, v); const kaba = Math.hypot(x, y) - R; if (kaba > 4) return kaba;
        let d = Infinity, ic = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const ax = poly[j][0], ay = poly[j][1], bx = poly[i][0], by = poly[i][1];
          if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) ic = !ic;
          const ex = bx - ax, ey = by - ay; const tt = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
          const dd = Math.hypot(x - ax - tt * ex, y - ay - tt * ey); if (dd < d) d = dd;
        }
        return ic ? -d : d;
      }
    };
  }

  // büyük üçgenleri kesim bölgesinin yakınında böler (geometri değişmez, sadece kenarlar kısalır)
  function incelt(V, F, C, R, maxL) {
    let Vb = new Buyuyen(Float64Array, V.length + 1024); for (let i = 0; i < V.length; i++) Vb.it(V[i]);
    let Fc = F;
    for (let tur = 0; tur < 40; tur++) {
      const VA = Vb.a; const harita = new Map(); const nV = Vb.n / 3;
      const kenar = (a, b) => {
        const ax = VA[3 * a], ay = VA[3 * a + 1], az = VA[3 * a + 2], bx = VA[3 * b], by = VA[3 * b + 1], bz = VA[3 * b + 2];
        const L = Math.hypot(bx - ax, by - ay, bz - az); if (L <= maxL) return -1;
        const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
        if (Math.hypot(mx - C[0], my - C[1], mz - C[2]) - L / 2 > R) return -1;
        const key = a < b ? a * nV + b : b * nV + a; let id = harita.get(key);
        if (id === undefined) { id = Vb.n / 3; Vb.it3(mx, my, mz); harita.set(key, id); }
        return id;
      };
      const Fn = new Buyuyen(Uint32Array, Fc.length + 1024); let bolundu = 0;
      for (let t = 0; t < Fc.length; t += 3) {
        const a = Fc[t], b = Fc[t + 1], c = Fc[t + 2];
        const ab = kenar(a, b), bc = kenar(b, c), ca = kenar(c, a);
        const k = (ab >= 0) + (bc >= 0) + (ca >= 0);
        if (!k) { Fn.it3(a, b, c); continue; }
        bolundu++;
        if (k === 3) { Fn.it3(a, ab, ca); Fn.it3(ab, b, bc); Fn.it3(ca, bc, c); Fn.it3(ab, bc, ca); }
        else if (k === 1) {
          if (ab >= 0) { Fn.it3(a, ab, c); Fn.it3(ab, b, c); }
          else if (bc >= 0) { Fn.it3(b, bc, a); Fn.it3(bc, c, a); }
          else { Fn.it3(c, ca, b); Fn.it3(ca, a, b); }
        } else {
          // iki kenar: bölünmeyen kenarı bul ve 3 üçgen yap
          let p, q, r, pq, qr;
          if (ab < 0) { p = b; q = c; r = a; pq = bc; qr = ca; }        // bölünmeyen a-b: kenarlar b-c (pq) ve c-a (qr)
          else if (bc < 0) { p = c; q = a; r = b; pq = ca; qr = ab; }   // bölünmeyen b-c
          else { p = a; q = b; r = c; pq = ab; qr = bc; }               // bölünmeyen c-a
          // üçgen (p,q,r), p-q ve q-r bölündü, r-p bölünmedi
          Fn.it3(pq, q, qr); Fn.it3(p, pq, qr); Fn.it3(p, qr, r);
        }
      }
      Fc = Fn.son();
      if (!bolundu) break;
    }
    return { V: Vb.son(), F: Fc };
  }

  // tıkaç: k = {nokta:[x,y,z] (yüzeyde tıklanan nokta), yon:[x,y,z], derinlik, taban:{...}, duvar, icPay, anahtar:{u,v,cap,derinlik}|null}
  function tikacKes(V, F, k, ayar) {
    const w = norm(k.yon); const O = [k.nokta[0] - w[0] * k.derinlik, k.nokta[1] - w[1] * k.derinlik, k.nokta[2] - w[2] * k.derinlik];
    const E = eksen(O, w, k.yukari);
    const tb = tabanSekli(k.taban); const K = k.duvar || 10, m = k.icPay ?? 0.15; const yan = ayar.boslukYan, der = ayar.boslukDerinlik; const an = k.anahtar;
    const gA = (u, v) => { let g = K * Math.max(0, tb.sd(u, v) + m); if (an) g += an.derinlik * adimF(u, v, an.u, an.v, an.cap / 2, GECIS); return g; };
    const gB = (u, v) => { let g = -der + K * Math.max(0, tb.sd(u, v) + m - yan); if (an) g += (an.derinlik - 0.2) * adimF(u, v, an.u, an.v, an.cap / 2 - yan, GECIS); return g; };
    const h = k.izgara || Math.min(0.3, Math.max(0.1, tb.kapsam / 60));
    ({ V, F } = incelt(V, F, k.nokta, tb.kapsam + k.derinlik + 3, Math.max(0.25, Math.min(1.0, tb.kapsam / 12))));
    const oA = an ? halka(an.u, an.v, an.cap / 2, GECIS, 0.08, []) : null, oB = an ? halka(an.u, an.v, an.cap / 2 - yan, GECIS, 0.08, []) : null;
    // duvarları açan parametre: duvar yüksekliği kadar dışarı it (dik duvarlarda uv izdüşümü katlanmasın)
    const acici = kay => (u, v) => {
      const s = tb.sd(u, v) + kay; if (s <= 0) return [u, v];
      const e = 1e-4; let gx = tb.sd(u + e, v) - tb.sd(u - e, v), gy = tb.sd(u, v + e) - tb.sd(u, v - e); const l = Math.hypot(gx, gy) || 1;
      const d = K * s; return [u + d * gx / l, v + d * gy / l];
    };
    // serbest çokgende merkezden dışarı (ışınsal) açma katlanmaz; olmazsa eğim yönünde açmayı dene
    const radyal = kay => (u, v) => {
      const s = tb.sd(u, v) + kay; if (s <= 0) return [u, v];
      const dx = u - tb.merkez[0], dy = v - tb.merkez[1]; const l = Math.hypot(dx, dy) || 1; const d = K * s; return [u + d * dx / l, v + d * dy / l];
    };
    const iki = (g, ust, o, kay) => {
      if (!tb.merkez) return guvenliKes(V, F, E, g, ust, h, o, an ? 0.06 : 0, acici(kay));
      try { return guvenliKes(V, F, E, g, ust, h, o, an ? 0.06 : 0, radyal(kay)); }
      catch (e) { return guvenliKes(V, F, E, g, ust, h, o, an ? 0.06 : 0, acici(kay)); }
    };
    const parca = iki(gA, true, oA, m);
    const kalan = iki(gB, false, oB, m - yan);
    return { parca, kalan };
  }

  // düz: k = {nokta, normal, pim:{tip:'dubel'|'ust_erkek'|'alt_erkek'|'yok', cap, boy, konum?}}
  // k.alan (isteğe bağlı): {sekil, en, boy, aci, kaydirU, kaydirV, kayma}
  //   Düzlem yalnızca bu alanın içinde kesimin konumunda; alanın dışında 'kayma' mm kadar
  //   yeni parça tarafına kayık ikinci bir düzlem olarak devam eder (basamaklı kesim).
  //   Böylece kesim yüksekliğine yakın kanat vb. çıkıntılar kesilmez.
  function duzKes(V, F, k, ayar) {
    const E = eksen(k.nokta, k.normal);
    const yeniUst = k.yeniUst !== false;
    const al = k.alan || null; const tb = al ? tabanSekli(al) : null;
    // al.kayma işaretli: + ise alan dışındaki düzlem normal yönünde (yukarı), - ise ters yönde kayar
    const K = k.duvar || 20, yan = ayar.boslukYan, d = al ? Math.abs(al.kayma || 0) : 0, isaret = al && al.kayma < 0 ? -1 : 1;
    if (al) {
      const C = [E.O[0] + E.u[0] * (al.kaydirU || 0) + E.v[0] * (al.kaydirV || 0), E.O[1] + E.u[1] * (al.kaydirU || 0) + E.v[1] * (al.kaydirV || 0), E.O[2] + E.u[2] * (al.kaydirU || 0) + E.v[2] * (al.kaydirV || 0)];
      ({ V, F } = incelt(V, F, C, tb.kapsam + d + 3, Math.max(0.25, Math.min(1.0, tb.kapsam / 12))));
    }
    const bos = ayar.boslukPim; const tu = [], ta = []; const ou = [], oa = []; let pim = null;
    const p = k.pim;
    if (p && p.tip !== 'yok') {
      let cu = 0, cv = 0;
      if (al && !p.konum) { cu = al.kaydirU || 0; cv = al.kaydirV || 0; }
      else {
        const merk = p.konum || kesitMerkezi(V, F, E);
        if (merk) { const q = [merk[0] - E.O[0], merk[1] - E.O[1], merk[2] - E.O[2]]; cu = dot(q, E.u); cv = dot(q, E.v); }
      }
      const r = p.cap / 2, L = p.boy;
      if (p.tip === 'ust_erkek') { tu.push([cu, cv, r, -L]); ta.push([cu, cv, r + bos, -(L + 2 * bos)]); halka(cu, cv, r, GECIS, 0.08, ou); halka(cu, cv, r + bos, GECIS, 0.08, oa); }
      else if (p.tip === 'alt_erkek') { ta.push([cu, cv, r, L]); tu.push([cu, cv, r + bos, L + 2 * bos]); halka(cu, cv, r, GECIS, 0.08, oa); halka(cu, cv, r + bos, GECIS, 0.08, ou); }
      else { const rd = r + bos; tu.push([cu, cv, rd, L / 2 + bos]); ta.push([cu, cv, rd, -(L / 2 + bos)]); halka(cu, cv, rd, GECIS, 0.08, ou); halka(cu, cv, rd, GECIS, 0.08, oa); pim = { r, L }; }
    }
    // alan dışı basamak: yeni parça tarafına doğru en fazla d kadar
    const basamak = kay => (u, v) => al ? Math.min(d, K * Math.max(0, tb.sd(u, v) - kay)) : 0;
    const bU = basamak(isaret > 0 ? 0 : yan), bA = basamak(isaret > 0 ? yan : 0);
    const gYap = (ter, b) => (u, v) => { let s = isaret * b(u, v); for (const [cu, cv, r, dz] of ter) s += dz * adimF(u, v, cu, cv, r, GECIS); return s; };
    const acici = kay => !al ? null : (u, v) => {
      const s = tb.sd(u, v) - kay; if (s <= 0) return [u, v];
      const e = 1e-4; const gx = tb.sd(u + e, v) - tb.sd(u - e, v), gy = tb.sd(u, v + e) - tb.sd(u, v - e); const l = Math.hypot(gx, gy) || 1;
      const m = Math.min(d, K * s); return [u + m * gx / l, v + m * gy / l];
    };
    const h = k.izgara || ayar.izgara;
    const ustP = guvenliKes(V, F, E, gYap(tu, bU), true, h, ou.length ? ou : null, ou.length ? 0.06 : 0, acici(isaret > 0 ? 0 : yan));
    const altP = guvenliKes(V, F, E, gYap(ta, bA), false, h, oa.length ? oa : null, oa.length ? 0.06 : 0, acici(isaret > 0 ? yan : 0));
    return { ust: ustP, alt: altP, pim };
  }

  // düzlemle kesitin (çevre ağırlıklı) merkezi
  function kesitMerkezi(V, F, E) {
    let sx = 0, sy = 0, sz = 0, sl = 0;
    const f = new Float64Array(V.length / 3);
    for (let i = 0; i < f.length; i++) f[i] = (V[3 * i] - E.O[0]) * E.w[0] + (V[3 * i + 1] - E.O[1]) * E.w[1] + (V[3 * i + 2] - E.O[2]) * E.w[2];
    for (let t = 0; t < F.length; t += 3) {
      const ids = [F[t], F[t + 1], F[t + 2]]; const pts = [];
      for (let k = 0; k < 3; k++) { const a = ids[k], b = ids[(k + 1) % 3]; if ((f[a] > 0) !== (f[b] > 0)) { const s = f[a] / (f[a] - f[b]); pts.push([V[3 * a] + (V[3 * b] - V[3 * a]) * s, V[3 * a + 1] + (V[3 * b + 1] - V[3 * a + 1]) * s, V[3 * a + 2] + (V[3 * b + 2] - V[3 * a + 2]) * s]); } }
      if (pts.length === 2) { const L = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]); sx += (pts[0][0] + pts[1][0]) / 2 * L; sy += (pts[0][1] + pts[1][1]) / 2 * L; sz += (pts[0][2] + pts[1][2]) / 2 * L; sl += L; }
    }
    return sl > 0 ? [sx / sl, sy / sl, sz / sl] : null;
  }

  // basit çokgen kulak kesme (ear clipping): P = [[x,y],...] GİRİŞ YÖNÜYLE AYNEN kullanılır
  // (CCW/CW tersine çevrilmez — çağıran taraf doğru yönü garanti eder). Dönen: [[yerelI,yerelJ,yerelK],...]
  function kulakKes2D(P) {
    const n = P.length; if (n < 3) return [];
    const idx = []; for (let i = 0; i < n; i++) idx.push(i);
    // gerçek (elle boyanmış/çizilmiş) sınırlar, temiz sentetik çokgenlerden farklı olarak çok sayıda neredeyse
    // çakışık/doğrusal nokta içerebilir (yoğun üçgenleme, hafif düzlemsel-olmayan izdüşüm gürültüsü). Sabit, çok
    // küçük bir eşik (1e-9) bu gürültüyle kolayca yanlış "içbükey" kararına yol açıp kulak bulmayı tamamen
    // durdurabiliyordu (gözlemlenen hata: kapakta gerçek delik + bir köşeden saçılan ince "güneş ışını" üçgenler).
    // Bunun yerine çokgenin kendi ölçeğine göre göreli bir eşik kullanıyoruz.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of P) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const olcek = Math.max(x1 - x0, y1 - y0, 1e-6); const eps = 1e-7 * olcek * olcek;
    const alan2 = (a, b, c) => (P[b][0] - P[a][0]) * (P[c][1] - P[a][1]) - (P[b][1] - P[a][1]) * (P[c][0] - P[a][0]);
    const icinde = (a, b, c, p) => { const d1 = alan2(a, b, p), d2 = alan2(b, c, p), d3 = alan2(c, a, p); return d1 >= -eps && d2 >= -eps && d3 >= -eps; };
    const ucgenler = []; let guard = 0;
    while (idx.length > 3 && guard++ < idx.length * idx.length + 64) {
      let kesildi = false;
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i - 1 + idx.length) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
        if (alan2(ia, ib, ic) <= eps) continue; // dışbükey değil: kulak olamaz
        let kulak = true;
        for (const p of idx) { if (p === ia || p === ib || p === ic) continue; if (icinde(ia, ib, ic, p)) { kulak = false; break; } }
        if (kulak) { ucgenler.push([ia, ib, ic]); idx.splice(i, 1); kesildi = true; break; }
      }
      if (!kesildi) break; // bozuk/çok ince dilimli sınır: kulak bulunamadı, aşağıda yelpazeyle GARANTİ kapat
    }
    // ne olursa olsun kapağı TAMAMEN kapat: kulak-kesme bazı noktalarda tıkanırsa (ince/uzun şekil, gürültülü
    // sınır), kalanı tek bir köşeden yelpaze ile üçgenle. Görsel olarak ideal olmayabilir ama asla delik bırakmaz.
    for (let i = 1; i + 1 < idx.length; i++) ucgenler.push([idx[0], idx[i], idx[i + 1]]);
    return ucgenler;
  }

  // sınır ayırma: elle (iki zıt renkle) boyanmış/seçilmiş "S" üçgen kümesini modelin geri kalanından
  // bağlantısız, düz bir kapakla ayırır (pim/yuva YOK). Tıkaç gibi tek bir yerel "fiş" şekli basmaz;
  // doğrudan seçilen üçgenlere göre modeli ikiye böler ve her iki parçanın sınırını kendi düzleminde kulak-kesme ile kapatır.
  // Büyük, düz-olmayan dikişler (ör. tüm gövdeyi ayırma) için bu, tıkaç/pim aracından daha güvenlidir.
  function sinirAyir(V, F, S) {
    const nV = V.length / 3, nF = F.length / 3;
    const inA = new Uint8Array(nF); for (const t of S) inA[t] = 1;
    // yönlü kenar -> onu taşıyan üçgen (watertight 2-manifold varsayımıyla benzersiz)
    const kenarSahibi = new Map();
    for (let t = 0; t < nF; t++) {
      const a = F[3 * t], b = F[3 * t + 1], c = F[3 * t + 2];
      kenarSahibi.set(a * nV + b, t); kenarSahibi.set(b * nV + c, t); kenarSahibi.set(c * nV + a, t);
    }
    const komsu = (a, b) => { const id = kenarSahibi.get(b * nV + a); return id === undefined ? -1 : id; };

    function parcaCikar(sec) {
      const yeniIdx = new Int32Array(nV).fill(-1); const Vn = []; let nvn = 0; const Fn = [];
      const yerelV = i => { if (yeniIdx[i] < 0) { yeniIdx[i] = nvn++; Vn.push(V[3 * i], V[3 * i + 1], V[3 * i + 2]); } return yeniIdx[i]; };
      for (let t = 0; t < nF; t++) if (sec(t)) { const a = F[3 * t], b = F[3 * t + 1], c = F[3 * t + 2]; Fn.push(yerelV(a), yerelV(b), yerelV(c)); }
      // sınır kenarları (bu parçaya özel): komşusu bu parçada olmayan kenarlar, yönü korunur.
      // Gerçek (fırçayla boyanmış, yoğun/detaylı yüzeyde) sınırlar her zaman BASİT bir döngü olmayabilir:
      // bir köşeden birden fazla sınır kenarı çıkabilir (dallanma/kendine değme). Eski kod bunu "bozuk" sayıp
      // o zincirin TAMAMINI atıyordu — binlerce kenarın kapaksız kalmasına (büyük delik) yol açan buydu.
      // Artık her sınır kenarı ayrı bir "kullanılabilir" giriş olarak tutuluyor ve döngüler bunlardan,
      // HİÇBİR KENAR ATLANMADAN kuruluyor (dallanma noktasında hangi kenarın seçildiği önemsiz, önemli olan
      // hiçbir kenarın kapaksız kalmaması).
      const kenarA = [], kenarB = []; const cikisListesi = new Map();
      for (let t = 0; t < nF; t++) if (sec(t)) {
        const vs = [F[3 * t], F[3 * t + 1], F[3 * t + 2]];
        for (let k = 0; k < 3; k++) {
          const a = vs[k], b = vs[(k + 1) % 3]; const kt = komsu(a, b); if (kt < 0 || !sec(kt)) {
            const la = yerelV(a), lb = yerelV(b); const idx = kenarA.length; kenarA.push(la); kenarB.push(lb);
            let l = cikisListesi.get(la); if (!l) cikisListesi.set(la, l = []); l.push(idx);
          }
        }
      }
      // dallanma noktasında (bir köşeden birden fazla kullanılabilir çıkış kenarı varsa) rastgele değil,
      // GELEN yönle en "düz devam eden" (dönüş açısı en küçük) kenarı seçiyoruz: bu, dokunan/iç içe geçen
      // sınır halkalarını kendi aralarında ayırmanın doğal yolu ve kapakta küçük çakışma/örtüşmeleri önler.
      const kullanildi = new Uint8Array(kenarA.length);
      const donguler = [];
      for (let e0 = 0; e0 < kenarA.length; e0++) {
        if (kullanildi[e0]) continue;
        kullanildi[e0] = 1; const bas = kenarA[e0]; const d = [bas]; let v = kenarB[e0]; let guard = 0;
        let geliyor = [Vn[3 * v] - Vn[3 * bas], Vn[3 * v + 1] - Vn[3 * bas + 1], Vn[3 * v + 2] - Vn[3 * bas + 2]];
        while (v !== bas && guard++ < kenarA.length + 5) {
          d.push(v);
          const l = cikisListesi.get(v); let idx = -1;
          if (l) {
            const musaitler = l.filter(c => !kullanildi[c]);
            if (musaitler.length === 1) idx = musaitler[0];
            else if (musaitler.length > 1) {
              const gl = Math.hypot(...geliyor) || 1; let enIyi = -Infinity;
              for (const c of musaitler) {
                const w = kenarB[c]; const yon = [Vn[3 * w] - Vn[3 * v], Vn[3 * w + 1] - Vn[3 * v + 1], Vn[3 * w + 2] - Vn[3 * v + 2]];
                const yl = Math.hypot(...yon) || 1; const dk = (geliyor[0] * yon[0] + geliyor[1] * yon[1] + geliyor[2] * yon[2]) / (gl * yl);
                if (dk > enIyi) { enIyi = dk; idx = c; }
              }
            }
          }
          if (idx < 0) break;                    // bu köşeden kullanılabilir kenar kalmadı: zinciri burada bitir
          kullanildi[idx] = 1;
          geliyor = [Vn[3 * kenarB[idx]] - Vn[3 * v], Vn[3 * kenarB[idx] + 1] - Vn[3 * v + 1], Vn[3 * kenarB[idx] + 2] - Vn[3 * v + 2]];
          v = kenarB[idx];
        }
        if (v === bas && d.length >= 3) donguler.push(d);
        // kapanmadıysa (teorik olarak olmamalı, 2-manifold seçim sınırı hep kapalı döngülerden oluşur) bu
        // parçayı atlıyoruz; ama artık dallanma TEK BAŞINA bu dallanmaya hiç yol açmıyor, önceki kod gibi
        // binlerce kenarı peşinen kaybetmiyoruz.
      }
      // her döngüyü kendi düzleminde (Newell normali) kulak-kesme ile kapat
      for (const d of donguler) {
        const pts = d.map(i => [Vn[3 * i], Vn[3 * i + 1], Vn[3 * i + 2]]);
        let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], q = pts[(i + 1) % pts.length];
          nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
          cx += p[0]; cy += p[1]; cz += p[2];
        }
        cx /= pts.length; cy /= pts.length; cz /= pts.length;
        let L = Math.hypot(nx, ny, nz); if (L < 1e-9) continue; nx /= L; ny /= L; nz /= L;
        let up = Math.abs(nz) < 0.9 ? [0, 0, 1] : [0, 1, 0];
        const dd = up[0] * nx + up[1] * ny + up[2] * nz; let v = [up[0] - nx * dd, up[1] - ny * dd, up[2] - nz * dd];
        const vl = Math.hypot(...v) || 1; v = [v[0] / vl, v[1] / vl, v[2] / vl];
        const u = [v[1] * nz - v[2] * ny, v[2] * nx - v[0] * nz, v[0] * ny - v[1] * nx]; // u = v×n (u×v=n olacak şekilde sağ-el)
        const P2 = pts.map(p => { const qx = p[0] - cx, qy = p[1] - cy, qz = p[2] - cz; return [qx * u[0] + qy * u[1] + qz * u[2], qx * v[0] + qy * v[1] + qz * v[2]]; });
        // kulakKes2D(P2) üçgenleri (ia,ib,ic) sırasıyla döner; bu sıra d-dizisinin KENDİ yönüyle aynıdır,
        // ama kapak, sınırın komşu (A içindeki) üçgenleriyle ters yönlü kenar paylaşmalı (standart manifold kuralı):
        // bu yüzden çıktıyı (i,k,j) olarak ters çeviriyoruz.
        for (const [i, j, k] of kulakKes2D(P2)) Fn.push(d[i], d[k], d[j]);
      }
      return { V: Float64Array.from(Vn), F: Uint32Array.from(Fn) };
    }
    const parca = parcaCikar(t => !!inA[t]);
    const kalan = parcaCikar(t => !inA[t]);
    return { parca, kalan };
  }

  function pimMesh(r, L, pah) {
    pah = Math.min(pah || 0.4, r * 0.4, L * 0.2); const n = 96;
    const prof = [[r - pah, 0], [r, pah], [r, L - pah], [r - pah, L]];
    const V = [0, 0, 0]; const hal = [];
    for (const [rr, z] of prof) { hal.push(V.length / 3); for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; V.push(rr * Math.cos(a), rr * Math.sin(a), z); } }
    V.push(0, 0, L); const ust = V.length / 3 - 1; const F = [];
    for (let i = 0; i < n; i++) F.push(0, hal[0] + (i + 1) % n, hal[0] + i);
    for (let k = 0; k < hal.length - 1; k++) { const A = hal[k], B = hal[k + 1]; for (let i = 0; i < n; i++) { const j = (i + 1) % n; F.push(A + i, A + j, B + j, A + i, B + j, B + i); } }
    for (let i = 0; i < n; i++) F.push(ust, hal[3] + i, hal[3] + (i + 1) % n);
    return { V: Float64Array.from(V), F: Uint32Array.from(F) };
  }

  // ================================================================ dosya yükleme (tam akış)
  async function yukle(ad, buf, ilerle, secim) {
    const uz = ad.toLowerCase().split('.').pop();
    let V, F, parcalar, renk = null, filament = null;
    if (uz === 'stl') { ilerle && ilerle('STL okunuyor'); ({ V, F } = stlOku(buf)); parcalar = [{ ad, ext: 1, boya: 0, nT: F.length / 3 }]; }
    else if (uz === '3mf') {
      if (secim == null) {
        const { liste } = await ucmfOku(buf, null, 'liste');
        if (liste.length > 1) return { secimGerek: true, liste };
      }
      const ps = await ucmfOku(buf, ilerle, secim);
      if (!ps.length) throw new Error('3MF içinde model bulunamadı');
      ilerle && ilerle('Parçalar birleştiriliyor');
      let nv = 0, nf = 0; for (const p of ps) { nv += p.V.length; nf += p.F.length; }
      const P = new Float64Array(nf * 3); let o = 0;
      for (const p of ps) for (let i = 0; i < p.F.length; i++) { const v = p.F[i] * 3; P[o++] = p.V[v]; P[o++] = p.V[v + 1]; P[o++] = p.V[v + 2]; }
      const k = kaynakla(P); V = k.V; F = k.F;
      // yüz başına renk (extruder no): boya varsa boyadan, yoksa parçanın extruder'ı
      const ham = new Uint8Array(nf / 3); let o2 = 0;
      for (const p of ps) { const nt = p.F.length / 3; for (let t = 0; t < nt; t++) ham[o2++] = (p.renk && p.renk[t]) ? p.renk[t] : p.ext; }
      const farkli = new Set(ham); 
      if (farkli.size > 1) { renk = new Uint8Array(k.tut.length); for (let t = 0; t < k.tut.length; t++) renk[t] = ham[k.tut[t]]; }
      filament = ps.filament;
      parcalar = ps.map(p => ({ ad: p.ad, ext: p.ext, boya: p.boya, nT: p.F.length / 3 }));
    } else throw new Error('Sadece .stl ve .3mf dosyaları açılabilir');
    // model koordinatı: XY ortalı, en alt Z=0
    const { lo, hi } = sinirlar(V); const tx = -(lo[0] + hi[0]) / 2, ty = -(lo[1] + hi[1]) / 2, tz = -lo[2];
    for (let i = 0; i < V.length; i += 3) { V[i] += tx; V[i + 1] += ty; V[i + 2] += tz; }
    return { V, F, parcalar, renk, filament };
  }

  return { yukle, kes, guvenliKes, eksen, tikacKes, duzKes, sinirAyir, kesitMerkezi, pimMesh, hacim, kapaliMi, sinirlar, stlYaz, ucmfYaz, zipYaz, delaunay, kaynakla, stlOku, tabanSekli };
}
if (typeof module !== 'undefined') module.exports = parcalaMotoru;
