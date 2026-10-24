// Uji otomatis: buka index.html di Chromium, masukkan file, cetak isi laporan.
// Pemakaian: node tools/uji.js <file.xlsx|file.pdf> [harga_saham]
// Opsional: LIBS=/folder berisi xlsx.full.min.js (SheetJS 0.20.3), pdf.min.js, pdf.worker.min.js (pdf.js 3.11.174)
// untuk lingkungan tanpa akses ke CDN. Versinya harus sama persis karena browser memeriksa hash integrity.
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const [file, price] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  if (process.env.LIBS) {
    await p.route('**/*.min.js', r => {
      const name = r.request().url().split('/').pop();
      // header CORS diperlukan karena skrip pdf.js dimuat dengan atribut integrity
      r.fulfill({ path: path.join(process.env.LIBS, name), contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
    });
  }
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.waitForTimeout(800);
  if (file) { await p.setInputFiles('#file', path.resolve(file)); await p.waitForTimeout(2500); }
  if (price) { await p.fill('#price', price); await p.waitForTimeout(300); }
  console.log('STATUS:', await p.textContent('#status'));
  console.log(await p.evaluate(() => document.querySelector('#report').innerText));
  await b.close();
})();
