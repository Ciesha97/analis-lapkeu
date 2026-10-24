"""Gabungkan src/app.src.html dengan data contoh menjadi index.html."""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = (root / 'src' / 'app.src.html').read_text(encoding='utf-8')
sample = (root / 'src' / 'sample.json').read_text(encoding='utf-8').strip()
(root / 'index.html').write_text(src.replace('/*SAMPLE*/null', sample), encoding='utf-8')
print('index.html diperbarui')
