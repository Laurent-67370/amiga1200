/* Conversion d'une image de disquette IPF (Software Preservation Society) en flux SCP (SuperCard Pro).
 *
 * La bibliothèque CAPS décode chaque piste en cellules MFM, avec leur minutage (densité variable) et, pour les
 * pistes « instables » (bits faibles des protections), un tirage différent à chaque lecture. On en fait des
 * inversions de flux au format SCP, sur plusieurs tours de disque, que WinUAE et PUAE lisent nativement.
 * Ce module reste séparé des cœurs d'émulation (licence de la bibliothèque CAPS : voir vendor/capsimg/LICENCE.txt). */
#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <vector>
#include "stdafx.h"
#include "CapsLibAll.h"

static char last_error[160];
static uint32_t last_size, last_tracks, last_revs, last_flakey;

static void put32(std::vector<uint8_t> &v, size_t at, uint32_t x) {
  v[at] = x & 255; v[at + 1] = (x >> 8) & 255; v[at + 2] = (x >> 16) & 255; v[at + 3] = x >> 24;
}

/* Inversions de flux d'une suite de cellules MFM, en unités de 25 ns (horloge SCP) */
struct FluxWriter {
  std::vector<uint8_t> &out;
  double abs_ns = 0;       /* temps écoulé depuis l'index du premier tour */
  int64_t last_ticks = 0;  /* instant de la dernière inversion écrite */
  explicit FluxWriter(std::vector<uint8_t> &o) : out(o) {}
  uint32_t count = 0;      /* intervalles écrits dans le tour en cours (mots de 16 bits) */
  void word(uint32_t w) { out.push_back(w >> 8); out.push_back(w & 255); count++; }
  void flux() {
    int64_t now = llround(abs_ns / 25.0);
    int64_t d = now - last_ticks; last_ticks = now;
    if (d < 1) d = 1;
    while (d >= 65536) { word(0); d -= 65536; } /* 0 = débordement de 65 536 unités */
    if (d == 0) d = 1;
    word((uint32_t)d);
  }
  void cells(const uint8_t *bits, uint32_t nbits, const uint32_t *timebuf, uint32_t timelen) {
    for (uint32_t i = 0; i < nbits; i++) {
      double cell = 2000.0; /* 2 µs : disquette double densité */
      if (timebuf && (i >> 3) < timelen && timebuf[i >> 3]) cell = 2000.0 * timebuf[i >> 3] / 1000.0;
      abs_ns += cell;
      if (bits[i >> 3] & (0x80 >> (i & 7))) flux();
    }
  }
};

extern "C" {

EMSCRIPTEN_KEEPALIVE const char *ipf_error(void) { return last_error; }
EMSCRIPTEN_KEEPALIVE uint32_t ipf_size(void) { return last_size; }
EMSCRIPTEN_KEEPALIVE uint32_t ipf_tracks(void) { return last_tracks; }
EMSCRIPTEN_KEEPALIVE uint32_t ipf_revs(void) { return last_revs; }
EMSCRIPTEN_KEEPALIVE uint32_t ipf_flakey(void) { return last_flakey; }

/* Convertit l'image (buf, len) ; renvoie le fichier SCP (à libérer avec free), sa taille dans ipf_size(), ou 0 */
EMSCRIPTEN_KEEPALIVE uint8_t *ipf_to_scp(uint8_t *buf, uint32_t len) {
  static bool init = false;
  last_error[0] = 0; last_size = 0;
  if (!init) { CAPSInit(); init = true; }
  SDWORD type = CAPSGetImageTypeMemory(buf, len);
  if (type != citIPF) { strcpy(last_error, type == citCTRaw ? "image CT RAW non prise en charge" : "ce fichier n'est pas une image IPF"); return 0; }
  SDWORD id = CAPSAddImage();
  if (id < 0) { strcpy(last_error, "bibliothèque CAPS indisponible"); return 0; }
  if (CAPSLockImageMemory(id, buf, len, DI_LOCK_MEMREF) != imgeOk) { strcpy(last_error, "image IPF illisible ou endommagée"); CAPSRemImage(id); return 0; }
  CapsImageInfo ci; memset(&ci, 0, sizeof ci);
  CAPSGetImageInfo(&ci, id);
  const UDWORD flags = DI_LOCK_DENVAR | DI_LOCK_DENNOISE | DI_LOCK_NOISE | DI_LOCK_UPDATEFD | DI_LOCK_TYPE | DI_LOCK_OVLBIT | DI_LOCK_TRKBIT;
  CAPSLoadImage(id, flags);
  uint32_t ntracks = (ci.maxcylinder + 1) * 2;
  if (ntracks > 168) ntracks = 168;

  /* Pistes instables (bits faibles) : trois tours, chacun avec un tirage différent, sinon un seul */
  bool flakey = false;
  for (uint32_t t = 0; t < ntracks && !flakey; t++) {
    CapsTrackInfoT2 ti; memset(&ti, 0, sizeof ti); ti.type = 2;
    if (t / 2 >= ci.mincylinder && CAPSLockTrack((PCAPSTRACKINFO)&ti, id, t / 2, t & 1, flags) == imgeOk && (ti.type & CTIT_FLAG_FLAKEY)) flakey = true;
  }
  const uint32_t revs = flakey ? 3 : 1;

  std::vector<uint8_t> out(0x10 + 168 * 4, 0);
  memcpy(&out[0], "SCP", 3);
  out[3] = 0x19;            /* version 1.9 */
  out[4] = 0x04;            /* Commodore Amiga */
  out[5] = revs;            /* tours enregistrés */
  out[6] = 0;               /* première piste */
  out[7] = ntracks - 1;     /* dernière piste */
  out[8] = 0x01;            /* tours calés sur l'index */
  out[9] = 0;               /* intervalles de 16 bits */
  out[10] = 0;              /* deux faces */
  out[11] = 0;              /* résolution : 25 ns */

  for (uint32_t t = 0; t < ntracks; t++) {
    const size_t hdr = out.size();
    put32(out, 0x10 + t * 4, (uint32_t)hdr);
    out.resize(hdr + 4 + revs * 12, 0);
    memcpy(&out[hdr], "TRK", 3); out[hdr + 3] = (uint8_t)t;
    FluxWriter fw(out);
    for (uint32_t r = 0; r < revs; r++) {
      const size_t data = out.size();
      const double start_ns = fw.abs_ns;
      fw.count = 0;
      CapsTrackInfoT2 ti; memset(&ti, 0, sizeof ti); ti.type = 2; ti.wseed = 0x9e3779b9u * (t * 7 + r + 1);
      bool ok = t / 2 >= ci.mincylinder && CAPSLockTrack((PCAPSTRACKINFO)&ti, id, t / 2, t & 1, flags | DI_LOCK_SETWSEED) == imgeOk && ti.tracklen > 0;
      if (ok) fw.cells(ti.trackbuf, ti.tracklen, ti.timelen ? ti.timebuf : 0, ti.timelen);
      else { /* piste absente : surface non formatée, une inversion toutes les 4 µs pendant un tour (200 ms) */
        for (int i = 0; i < 50000; i++) { fw.abs_ns += 4000.0; fw.flux(); }
      }
      /* Fin du tour : le temps jusqu'à l'index compte dans le premier intervalle du tour suivant */
      const int64_t end = llround(fw.abs_ns / 25.0);
      const size_t e = hdr + 4 + r * 12;
      put32(out, e, (uint32_t)(end - (r ? llround(start_ns / 25.0) : 0)));
      put32(out, e + 4, fw.count);
      put32(out, e + 8, (uint32_t)(data - hdr));
    }
    CAPSUnlockTrack(id, t / 2, t & 1);
  }
  CAPSUnlockAllTracks(id);
  CAPSUnlockImage(id);
  CAPSRemImage(id);
  uint32_t sum = 0;
  for (size_t i = 0x10; i < out.size(); i++) sum += out[i];
  put32(out, 12, sum);
  uint8_t *res = (uint8_t *)malloc(out.size());
  if (!res) { strcpy(last_error, "mémoire insuffisante"); return 0; }
  memcpy(res, out.data(), out.size());
  last_size = (uint32_t)out.size(); last_tracks = ntracks; last_revs = revs; last_flakey = flakey;
  return res;
}

}
