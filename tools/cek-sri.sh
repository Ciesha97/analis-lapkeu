#!/usr/bin/env bash
# Cek setiap <script src> eksternal di index.html: unduh, hitung SHA-384, lalu bandingkan dengan atribut integrity.
# Skrip tanpa integrity dicetak beserta hash-nya supaya bisa ditambahkan.
# Pemakaian: bash tools/cek-sri.sh   (butuh curl dan openssl)
set -euo pipefail
cd "$(dirname "$0")/.."
gagal=0
while IFS= read -r tag; do
  url=$(sed -n 's/.*src="\([^"]*\)".*/\1/p' <<<"$tag")
  sri=$(sed -n 's/.*integrity="\([^"]*\)".*/\1/p' <<<"$tag")
  berkas=$(mktemp)
  kepala=$(curl -fsSL --retry 3 -D - -o "$berkas" "$url")
  hash="sha384-$(openssl dgst -sha384 -binary "$berkas" | base64 | tr -d '\n')"
  cors=$(grep -i '^access-control-allow-origin:' <<<"$kepala" | tail -1 | tr -d '\r' || true)
  rm -f "$berkas"
  if [ -z "$sri" ]; then
    echo "TANPA integrity  $url"
    echo "                 hash: $hash"
    echo "                 ${cors:-tanpa header Access-Control-Allow-Origin (integrity tidak bisa dipakai)}"
  elif [ "$sri" != "$hash" ]; then
    echo "BEDA             $url"
    echo "                 tertulis: $sri"
    echo "                 server:   $hash"
    gagal=1
  elif [ -z "$cors" ]; then
    echo "TANPA CORS       $url (skrip dengan integrity akan diblokir browser)"
    gagal=1
  else
    echo "OK               $url"
  fi
done < <(grep -o '<script src="https://[^"]*"[^>]*>' index.html)
exit $gagal
