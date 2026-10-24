// Uji regresi: buka index.html di Chromium, jalankan file buatan dari data contoh, dan periksa hasilnya.
// Pemakaian: node tools/uji-regresi.js   (keluar dengan kode 1 bila ada uji yang gagal)
// Opsional: LIBS=/folder berisi xlsx.full.min.js (SheetJS 0.20.3), pdf.min.js, pdf.worker.min.js (pdf.js 3.11.174)
// untuk lingkungan tanpa akses ke CDN. Versinya harus sama persis karena browser memeriksa hash integrity.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');
// Data uji tetap (perusahaan fiktif) agar angka acuan di bawah tidak berubah walau data contoh aplikasi diganti
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'data-uji.json'), 'utf8'));
let gagal = 0;
const cek = (nama, ok, rinci) => {
  if (!ok) gagal++;
  console.log(`${ok ? 'OK   ' : 'GAGAL'} ${nama}${ok ? '' : `\n      ${rinci}`}`);
};

async function bukaHalaman(ctx) {
  const p = await ctx.newPage();
  const galat = [];
  p.on('pageerror', e => galat.push(e.message));
  if (process.env.LIBS) {
    await p.route('**/*.min.js', r => r.fulfill({
      path: path.join(process.env.LIBS, r.request().url().split('/').pop()),
      contentType: 'application/javascript',
      headers: { 'Access-Control-Allow-Origin': '*' },
    }));
  }
  await p.goto(APP);
  await p.waitForFunction(() => window.__analis && typeof XLSX !== 'undefined' && typeof pdfjsLib !== 'undefined', null, { timeout: 30000 });
  return { p, galat };
}

// Buku kerja format IDX dari data uji, dengan perubahan: { info, ops: [{ re, set | remove | before }] }
async function muatExcel(p, nama, ubah = {}) {
  return p.evaluate(async ({ nama, ubah, DATA }) => {
    const info = { ...DATA.info, ...(ubah.info || {}) };
    let facts = DATA.facts.map(f => ({ ...f }));
    for (const op of ubah.ops || []) {
      const re = new RegExp(op.re);
      if (op.set) facts = facts.map(f => re.test(f.en) ? { ...f, ...op.set } : f);
      if (op.remove) facts = facts.filter(f => !re.test(f.en));
      if (op.before) facts.splice(facts.findIndex(f => re.test(f.en)), 0, op.before);
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['General information'], [], ...Object.entries(info).map(([k, v]) => [k, v, k])]), '1000000');
    const per = {};
    for (const f of facts) (per[f.s] = per[f.s] || []).push(f);
    for (const [s, list] of Object.entries(per)) {
      const k = list[0].k;
      const judul = { bs: 'Statement of financial position', is: 'Statement of profit or loss', cf: 'Statement of cash flows' }[k];
      const kepala = k === 'bs' ? ['', 'CurrentYearInstant', 'PriorEndYearInstant', ''] : ['', 'CurrentYearDuration', 'PriorYearDuration', ''];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[judul], [], kepala, ...list.map(f => [f.id, f.c, f.p, f.en])]), s);
    }
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    await window.__analis.handleFile(new File([buf], nama));
  }, { nama, ubah, DATA });
}

const baca = p => p.evaluate(() => {
  const daftar = judul => [...document.querySelectorAll('.lists > div')].filter(d => d.querySelector('h3')?.textContent === judul).flatMap(d => [...d.querySelectorAll('li')].map(li => li.textContent));
  return {
    status: document.querySelector('#status').textContent,
    teks: document.querySelector('#report').innerText,
    kekuatan: daftar('Kekuatan'),
    perhatian: daftar('Perlu diperhatikan'),
    neraca: [...document.querySelectorAll('.score')].find(s => /keseimbangan/i.test(s.textContent))?.querySelector('.v')?.textContent || null,
  };
});
const nilai = (p, k) => p.evaluate(k => { const S = CURRENT.S[k]; return S ? { c: S.c, p: S.p } : null; }, k);
const dekat = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-9);

// PDF uji dibuat Chromium dari HTML: laporan dua bahasa dengan kolom catatan, mirip laporan auditan
async function buatPdf(ctx, berkas, html) {
  const p = await ctx.newPage();
  await p.setContent(html);
  await p.pdf({ path: berkas, format: 'A4' });
  await p.close();
}
const halamanLapkeu = (judul, satuan, baris) => `<section style="page-break-after:always;font:11px Arial">
  <p>PT CONTOH MAKMUR Tbk</p><p>${judul}</p><p>31 Desember 2025 dan 2024</p><p>(Disajikan dalam ${satuan}, kecuali dinyatakan lain)</p>
  <p>31 Desember 2025 dan 2024</p>
  <table style="width:100%;border-collapse:collapse">${baris.map(([id, cat, c, pr, en]) =>
    `<tr><td style="width:40%;padding:3px 0">${id}</td><td style="width:8%">${cat}</td><td style="width:14%;text-align:right">${c}</td><td style="width:14%;text-align:right">${pr}</td><td style="width:24%;padding-left:12px">${en}</td></tr>`).join('')}</table></section>`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  const { p, galat } = await bukaHalaman(ctx);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-lapkeu-'));

  // 1. Halaman contoh
  let h = await baca(p);
  cek('contoh AALI tampil tanpa galat', /Astra Agro Lestari Tbk/.test(h.teks) && !galat.length, galat.join('; '));
  cek('mode standar dan bahasa Indonesia', await p.evaluate(() => document.compatMode === 'CSS1Compat' && document.documentElement.lang === 'id'), 'compatMode/lang salah');
  cek('neraca contoh seimbang', h.neraca === 'Seimbang', h.neraca);

  // 2. Excel buatan dari data uji menghasilkan angka yang sama
  const acuan = await p.evaluate(DATA => window.__analis.extractExcel(DATA).data, DATA);
  await muatExcel(p, 'pulang-pergi.xlsx');
  const hasil = await p.evaluate(() => LAST_EX.data);
  const beda = Object.keys(acuan).filter(k => ['c', 'p'].some(per => (acuan[k][per] ?? null) !== (hasil[k]?.[per] ?? null)));
  cek('Excel pulang-pergi sama dengan data uji', !beda.length && Object.keys(hasil).length === Object.keys(acuan).length, 'beda: ' + beda.join(', '));
  const utang = await nilai(p, 'debt'), capex = await nilai(p, 'capex');
  // utang bank jangka pendek + jatuh tempo + jangka panjang + liabilitas sewa
  cek('utang berbunga data uji', dekat(utang.c, (0 + 50e3 + 150e3 + 20e3) * 1e6) && dekat(utang.p, (100e3 + 50e3 + 200e3 + 25e3) * 1e6), JSON.stringify(utang));
  cek('belanja modal data uji', dekat(capex.c, 230e9), JSON.stringify(capex));

  // 3. XSS lewat isian tanggal
  await muatExcel(p, 'xss.xlsx', { info: { 'Current period end date': '<img src=x onerror="window.__xss=1">', 'Prior year end date': '"><svg onload="window.__xss=2">' } });
  await p.waitForTimeout(200);
  h = await baca(p);
  const xss = await p.evaluate(() => ({ jalan: window.__xss, elemen: document.querySelectorAll('#report img, #report [onload], #report [onerror]').length, teks: document.querySelector('.meta').textContent }));
  cek('isian tanggal berisi HTML tidak dijalankan', xss.jalan === undefined && !xss.elemen && xss.teks.includes('<img src=x'), JSON.stringify(xss));
  cek('tanggal tidak sah tidak dianggap periode 1 bulan', xss.teks.includes('Periode12 bulan'), JSON.stringify(xss));
  await muatExcel(p, 'kuartal3.xlsx', { info: { 'Current period end date': '2025-09-30', 'Period of financial statements submissions': 'Kuartal III / Third Quarter' } });
  h = await baca(p);
  cek('laporan 9 bulan dikenali dan disetahunkan', /9 bulan \(rasio disetahunkan\) s\.d\. 30 September 2025/.test(h.teks) && await p.evaluate(() => Math.abs(CURRENT.ann - 12 / 9) < 1e-9), h.teks.slice(0, 300));

  // 4. Ekuitas negatif dan rugi
  await muatExcel(p, 'ekuitas-negatif.xlsx', { ops: [
    { re: '^Total equity', set: { c: -200e9 } }, { re: '^Total liabilities$', set: { c: 2078e9 } },
    { re: '^Total profit \\(loss\\)$|attributable to parent', set: { c: -150e9 } }, { re: 'per share', set: { c: -18.8 } },
  ] });
  h = await baca(p);
  cek('ekuitas negatif masuk "Perlu diperhatikan"', h.perhatian.some(x => /Ekuitas negatif/.test(x)), h.perhatian.join(' | '));
  cek('DER/ROE/utang ÷ ekuitas tidak jadi kekuatan', !h.kekuatan.some(x => /DER|ROE|÷ ekuitas/.test(x)), h.kekuatan.join(' | '));
  cek('ROE tidak dihitung pada ekuitas negatif', await p.evaluate(() => CURRENT.rc.roe === null), 'ROE masih ada');
  cek('narasi menyebut rugi bersih', /rugi bersih/.test(h.teks), h.teks.slice(0, 400));
  await p.fill('#price', '300');
  h = await baca(p);
  cek('PER dan PBV tidak dihitung saat rugi/ekuitas negatif', /PER tidak bermakna/.test(h.teks) && /PBV tidak bermakna/.test(h.teks), h.teks.split('Valuasi')[1]?.slice(0, 400));
  await p.fill('#price', '');

  // 5. Cek keseimbangan neraca tidak boleh lolos dengan sendirinya
  await muatExcel(p, 'tanpa-total-liabilitas.xlsx', { ops: [{ re: '^Total liabilities$', remove: true }, { re: '^Total equity', set: { c: 1568e9 * 1.1 } }] });
  h = await baca(p);
  cek('ekuitas digelembungkan 10% terdeteksi tidak seimbang', h.neraca === 'Tidak seimbang', h.neraca);
  await muatExcel(p, 'tanpa-liabilitas.xlsx', { ops: [{ re: '^Total (current |non-current )?liabilities$', remove: true }] });
  h = await baca(p);
  cek('tanpa total liabilitas: "Tidak bisa dicek"', h.neraca === 'Tidak bisa dicek', h.neraca);

  // 6. Berbalik dari rugi ke laba
  await muatExcel(p, 'berbalik.xlsx', { ops: [{ re: '^Total profit \\(loss\\)$|attributable to parent', set: { p: -50e9 } }] });
  h = await baca(p);
  cek('narasi "berbalik dari rugi" dan tanpa persen palsu', /berbalik dari rugi bersih/.test(h.teks) && /berbalik tanda/.test(h.teks) && h.kekuatan.some(x => /Berbalik dari rugi/.test(x)), h.teks.slice(0, 300));

  // 7. Utang hanya dari sisi liabilitas, belanja modal mencakup tanaman produktif
  await muatExcel(p, 'sukuk-tanaman.xlsx', { ops: [
    { re: '^Total non-current assets$', before: { k: 'bs', s: '3210000', id: 'Investasi pada sukuk', en: 'Investments in sukuk', c: 50e9, p: 40e9 } },
    { re: '^Total net cash flows received from \\(used in\\) investing', before: { k: 'cf', s: '3510000', id: 'Pembayaran untuk perolehan tanaman produktif', en: 'Payments for acquisition of bearer plants', c: 100e9, p: 0 } },
  ] });
  cek('investasi sukuk di sisi aset tidak dihitung sebagai utang', dekat((await nilai(p, 'debt')).c, utang.c), JSON.stringify(await nilai(p, 'debt')));
  cek('belanja modal mencakup tanaman produktif', dekat((await nilai(p, 'capex')).c, 330e9), JSON.stringify(await nilai(p, 'capex')));

  // 8. File yang bukan laporan keuangan
  await p.evaluate(async () => {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 1]]), 'Sheet1');
    await window.__analis.handleFile(new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'acak.xlsx'));
  });
  h = await baca(p);
  cek('Excel acak ditolak dan laporan lama disebutkan', /^Gagal membaca acak\.xlsx/.test(h.status) && /Laporan di bawah masih dari/.test(h.status), h.status);

  // 9. Pemecah baris PDF dan isian harga
  const baris = await p.evaluate(() => [
    'Beban pajak penghasilan 25 (845) (912)', 'Laba per saham dasar 31 466 450', 'Laba per saham dasar 31 46,60 45,05',
    'Kas dan setara kas 4 1.234.567 1.100.000', 'Beban pajak 25 (845) (1.912)', 'Liabilitas imbalan kerja 20 - 1.234',
    'Catatan 5', 'PSAK 71',
  ].map(l => { const r = splitLine(l, 2); return [r.label, r.vals]; }));
  const harap = [
    ['beban pajak penghasilan', [-845, -912]], ['laba per saham dasar', [466, 450]], ['laba per saham dasar', [46.6, 45.05]],
    ['kas dan setara kas', [1234567, 1100000]], ['beban pajak', [-845, -1912]], ['liabilitas imbalan kerja', [0, 1234]],
    ['catatan', []], ['psak', []],
  ];
  harap.forEach(([lab, v], i) => cek(`pecah baris: ${lab} ${JSON.stringify(v)}`, baris[i][0] === lab && JSON.stringify(baris[i][1]) === JSON.stringify(v), JSON.stringify(baris[i])));
  const kolom = await p.evaluate(() => [
    colCount(['Kas 845 1.234', 'Piutang 5 900 1.100', 'Persediaan 1.200 950', 'Beban 21 (800) (1.500)', 'Jumlah aset lancar 2.945 3.284']),
    colCount(['Kas 4 1.234.567 1.100.000', 'Jumlah aset 20.000.000 18.000.000 17.000.000', 'Jumlah liabilitas 8.000.000 7.000.000 6.500.000']),
    colCount(['Tidak ada angka di sini']),
  ]);
  cek('jumlah kolom nilai per halaman', JSON.stringify(kolom) === '[2,3,2]', JSON.stringify(kolom));
  const harga = await p.evaluate(() => ['450', '1.250', '12,5', '12.5', 'Rp 1.250,75', '0', 'abc'].map(parsePrice));
  cek('isian harga', JSON.stringify(harga) === JSON.stringify([450, 1250, 12.5, 12.5, 1250.75, null, null]), JSON.stringify(harga));

  // 10. PDF laporan auditan dalam jutaan (angka < 1.000 dan EPS bulat)
  const pdfJuta = path.join(tmp, 'auditan-jutaan.pdf');
  await buatPdf(ctx, pdfJuta, halamanLapkeu('LAPORAN POSISI KEUANGAN', 'jutaan Rupiah', [
    ['ASET LANCAR', '', '', '', 'CURRENT ASSETS'], ['Kas dan setara kas', '4', '845', '700', 'Cash and cash equivalents'],
    ['Investasi pada obligasi', '5', '500', '400', 'Investment in bonds'], ['Jumlah aset lancar', '', '5.345', '4.100', 'Total current assets'],
    ['Jumlah aset', '', '20.000', '18.000', 'Total assets'], ['Utang bank jangka pendek', '12', '2.000', '1.500', 'Short-term bank loans'],
    ['Jumlah liabilitas jangka pendek', '', '3.000', '2.500', 'Total current liabilities'], ['Jumlah liabilitas', '', '8.000', '7.000', 'Total liabilities'],
    ['Jumlah ekuitas', '', '12.000', '11.000', 'Total equity'], ['Jumlah liabilitas dan ekuitas', '', '20.000', '18.000', 'Total liabilities and equity'],
  ]) + halamanLapkeu('LAPORAN LABA RUGI DAN PENGHASILAN KOMPREHENSIF LAIN', 'jutaan Rupiah', [
    ['Pendapatan', '20', '12.345', '11.000', 'Revenue'], ['Beban pokok pendapatan', '21', '(8.000)', '(7.500)', 'Cost of revenue'],
    ['Laba bruto', '', '4.345', '3.500', 'Gross profit'], ['Laba sebelum pajak penghasilan', '', '1.200', '1.100', 'Profit before income tax'],
    ['Beban pajak penghasilan', '25', '(264)', '(242)', 'Income tax expense'], ['Laba tahun berjalan', '', '936', '858', 'Profit for the year'],
    ['Laba per saham dasar', '31', '93', '86', 'Basic earnings per share'],
  ]));
  await p.setInputFiles('#file', pdfJuta);
  await p.waitForFunction(() => /^(Selesai|Gagal)/.test(document.querySelector('#status').textContent), null, { timeout: 60000 });
  h = await baca(p);
  const pj = await p.evaluate(() => Object.fromEntries(['ni', 'tax', 'eps', 'cash', 'debt', 'ta'].map(k => [k, CURRENT.S[k]?.c ?? null])));
  cek('PDF jutaan: angka di bawah 1.000 terbaca', pj.ni === 936e6 && pj.tax === 264e6 && pj.cash === 845e6, h.status + ' ' + JSON.stringify(pj));
  cek('PDF jutaan: EPS bulat terbaca', pj.eps === 93, JSON.stringify(pj));
  cek('PDF jutaan: obligasi di sisi aset bukan utang', pj.debt === 2000e6, JSON.stringify(pj));

  // 11. PDF satuan penuh dengan nomor catatan
  const pdfPenuh = path.join(tmp, 'auditan-penuh.pdf');
  await buatPdf(ctx, pdfPenuh, halamanLapkeu('LAPORAN POSISI KEUANGAN', 'Rupiah penuh', [
    ['Kas dan setara kas', '4', '180.000.000.000', '95.000.000.000', 'Cash and cash equivalents'],
    ['Jumlah aset', '', '1.878.000.000.000', '1.615.000.000.000', 'Total assets'],
    ['Jumlah liabilitas', '', '310.000.000.000', '452.000.000.000', 'Total liabilities'],
    ['Jumlah ekuitas', '', '1.568.000.000.000', '1.163.000.000.000', 'Total equity'],
  ]));
  await p.setInputFiles('#file', pdfPenuh);
  await p.waitForFunction(() => /penuh\.pdf/.test(document.querySelector('#status').textContent) && /^(Selesai|Gagal)/.test(document.querySelector('#status').textContent), null, { timeout: 60000 });
  h = await baca(p);
  cek('PDF satuan penuh: kas dan neraca terbaca', await p.evaluate(() => CURRENT.S.cash?.c === 180e9 && CURRENT.S.ta?.c === 1878e9), h.status);
  cek('PDF satuan penuh: neraca seimbang', h.neraca === 'Seimbang', h.neraca);

  // 12. PDF tanpa teks
  const pdfGambar = path.join(tmp, 'scan.pdf');
  await buatPdf(ctx, pdfGambar, '<div style="width:400px;height:600px;background:linear-gradient(#888,#222)"></div>');
  await p.setInputFiles('#file', pdfGambar);
  await p.waitForFunction(() => /scan\.pdf/.test(document.querySelector('#status').textContent) && /^(Selesai|Gagal)/.test(document.querySelector('#status').textContent), null, { timeout: 60000 });
  h = await baca(p);
  cek('PDF hasil scan ditolak', /tidak berisi teks/.test(h.status), h.status);

  // 13. Cetak laporan contoh: tabel "Dari mana angka ini" ikut tercetak dan tidak ada teks yang saling menimpa
  await p.goto(APP);
  await p.waitForFunction(() => window.__analis && typeof pdfjsLib !== 'undefined');
  const cetak = await p.evaluate(async b64 => {
    const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    const tumpuk = [];
    let teks = '';
    for (let n = 1; n <= doc.numPages; n++) {
      const items = (await (await doc.getPage(n)).getTextContent()).items.filter(i => i.str.trim())
        .map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) }));
      teks += items.map(i => i.s).join(' ') + ' ';
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 2 && oy > 0.5 * Math.min(a.h, b.h)) tumpuk.push(`hal. ${n}: "${a.s}" × "${b.s}"`);
      }
    }
    return { tumpuk, sumber: /sumber di laporan/i.test(teks) };
  }, (await p.pdf({ format: 'A4' })).toString('base64'));
  cek('cetak: tabel "Dari mana angka ini" ikut tercetak', cetak.sumber, 'tabel sumber tidak ada di PDF');
  cek('cetak: tidak ada teks yang saling menimpa', !cetak.tumpuk.length, cetak.tumpuk.slice(0, 3).join('; '));
  cek('tidak ada galat JavaScript', !galat.length, galat.join('; '));

  // 14. Tampilan ponsel
  const hp = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  const { p: ph } = await bukaHalaman(hp);
  const lebar = await ph.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
  cek('ponsel 390px: lebar mengikuti layar tanpa geser samping', lebar[0] === 390 && lebar[1] <= 390, JSON.stringify(lebar));

  await b.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(gagal ? `\n${gagal} uji gagal` : '\nSemua uji lolos');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
