#!/usr/bin/env bash
# Convertisseur IPF → SCP en WebAssembly (module séparé des cœurs d'émulation, chargé à l'import d'un .ipf)
#
#   wasm-ipf/build.sh → wasm-ipf/out/ipf.js (+ .wasm)
#
# La bibliothèque CAPS (SPS Decoder Library 5.1) est dans vendor/capsimg, telle que publiée (licence non commerciale :
# vendor/capsimg/LICENCE.txt). Seul config.h, normalement produit par son script configure, est fourni ici.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
CAPS="$HERE/../vendor/capsimg"
OUT="$HERE/out"; mkdir -p "$OUT/obj"
INC="-I$HERE -I$CAPS/LibIPF -I$CAPS/Codec -I$CAPS/Core -I$CAPS/Device -I$CAPS/CAPSImg"
SRCS="Codec/CTRawCodec Codec/CTRawCodecDecompressor Codec/DiskEncoding Core/BaseFile Core/BitBuffer Core/CRC Core/DiskFile
  Core/MemoryFile CAPSImg/CapsAPI CAPSImg/CapsFDCEmulator CAPSImg/CapsFile CAPSImg/CapsFormatMFM CAPSImg/CapsImage
  CAPSImg/CapsImageStd CAPSImg/CapsLoader CAPSImg/DiskImage CAPSImg/DiskImageFactory CAPSImg/stdafx CAPSImg/StreamCueImage
  CAPSImg/StreamImage"
OBJS=()
for f in $SRCS; do
  o="$OUT/obj/$(basename "$f").o"; OBJS+=("$o")
  [ "$o" -nt "$CAPS/$f.cpp" ] || em++ -O2 -std=gnu++11 -w $INC -c "$CAPS/$f.cpp" -o "$o"
done
em++ -O2 -std=gnu++11 $INC -c "$HERE/ipf2scp.cpp" -o "$OUT/obj/ipf2scp.o"
em++ -O2 "${OBJS[@]}" "$OUT/obj/ipf2scp.o" -o "$OUT/ipf.js" \
  -sMODULARIZE=1 -sEXPORT_NAME=createIpf -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=32MB \
  -sEXPORTED_FUNCTIONS='["_ipf_to_scp","_ipf_error","_ipf_size","_ipf_tracks","_ipf_revs","_ipf_flakey","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["HEAPU8","UTF8ToString"]'
echo "OK : $OUT/ipf.js ($(gzip -9 -c "$OUT/ipf.wasm" | wc -c) octets compressés)"
