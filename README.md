# Analis Laporan Keuangan Emiten IDX

Program berbasis browser untuk membaca laporan keuangan perusahaan terbuka di Bursa Efek Indonesia. Anda cukup memasukkan file Excel atau PDF, lalu program membuat laporan analisis lengkap.

Semua proses berjalan di browser. File Anda tidak dikirim ke server mana pun.

**[▶ Coba langsung di peramban](https://ciesha97.github.io/analis-lapkeu/)**

## Cara pakai

1. Buka [ciesha97.github.io/analis-lapkeu](https://ciesha97.github.io/analis-lapkeu/), atau buka `index.html` di browser (Chrome, Edge, Firefox, atau Safari). Koneksi internet diperlukan untuk memuat pustaka SheetJS (cdn.sheetjs.com) dan pdf.js (cdnjs).
2. Seret atau pilih file laporan keuangan.
3. Opsional: isi harga saham untuk menghitung PER dan PBV.
4. Cetak atau simpan sebagai PDF lewat tombol cetak di browser.

## Format yang didukung

| Format | Status |
|---|---|
| Excel XBRL IDX (`FinancialStatement-…xlsx`) | Diuji: AALI |
| PDF cetakan XBRL IDX (lembar `[1000000]`, `[1210000]`, dst.) | Diuji: BBCA |
| PDF laporan auditan perusahaan (dua bahasa) | Diuji; uji otomatis dengan PDF buatan dalam satuan penuh dan jutaan |
| PDF hasil scan (gambar) | Tidak bisa dibaca |

Template industri umum, infrastruktur, dan perbankan dikenali otomatis. Asuransi, sekuritas, pembiayaan, laporan kuartalan, dan laporan dalam USD belum diuji.

## Isi laporan

- Ringkasan dan narasi analisis dalam bahasa Indonesia.
- Neraca lengkap (aset = liabilitas + ekuitas) beserta cek keseimbangan.
- Rasio profitabilitas, likuiditas, solvabilitas, efisiensi (DSO/DIO/DPO/CCC), dan kualitas arus kas.
- Rasio khusus bank: NIM (proksi), LDR, CASA, BOPO/CIR, biaya kredit, dan CKPN.
- Altman Z'' dan Piotroski F-score (dinonaktifkan untuk perusahaan keuangan).
- Valuasi PER dan PBV dari harga saham yang Anda isi.

## Struktur repositori

```
index.html            Aplikasi siap pakai (hasil build)
src/app.src.html      Kode sumber aplikasi
src/sample.json       Data contoh AALI yang tampil saat aplikasi dibuka
tools/build.py        Gabungkan sumber + data contoh menjadi index.html
tools/sample.py       Buat sample.json dari Excel XBRL IDX
tools/uji.js          Cetak isi laporan untuk satu file (Playwright)
tools/uji-regresi.js  Uji regresi otomatis (Playwright)
tools/data-uji.json   Data perusahaan fiktif untuk uji regresi
tools/cek-sri.sh      Cek hash integrity pustaka CDN di index.html
contoh-laporan/       Contoh laporan hasil program (AALI, BBCA)
.github/workflows/    Uji di setiap push, terbitkan ke GitHub Pages setelah uji lolos di main
```

## Pengembangan

Ubah `src/app.src.html`, lalu jalankan:

```
python tools/build.py
```

Uji regresi (butuh Node.js dan Playwright). Uji ini membuat file Excel dan PDF dari data perusahaan fiktif di `tools/data-uji.json`, lalu memeriksa angka, narasi, cek neraca, keamanan tampilan, dan hasil cetak:

```
node tools/uji-regresi.js
```

Workflow "Uji" menjalankan uji yang sama, plus `tools/cek-sri.sh`, di setiap push. Bila versi pustaka CDN diganti, jalankan `bash tools/cek-sri.sh` untuk mendapatkan hash baru dan isi atribut `integrity` di `src/app.src.html`.

Untuk mencetak isi laporan dari satu file:

```
node tools/uji.js FinancialStatement-2025-Tahunan-AALI.xlsx 6000
```

## Menerbitkan

Workflow "Terbitkan ke GitHub Pages" berjalan setelah workflow "Uji" lolos di `main`. Sekali saja, aktifkan di Settings > Pages > Build and deployment > Source: "GitHub Actions". Untuk repositori private, GitHub Pages butuh paket GitHub Pro atau lebih tinggi, dan situsnya tetap bisa dibuka publik.

## Catatan

Hasil analisis bersifat informatif dan bukan rekomendasi investasi. Selalu cocokkan angka penting dengan laporan keuangan resmi.
