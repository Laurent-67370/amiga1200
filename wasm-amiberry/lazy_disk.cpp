/* Disques durs lus sur place : le cœur ouvre « /lazy/<n>/<nom> » comme un fichier ordinaire (fopen détourné à
 * l'édition des liens, -Wl,--wrap=fopen), mais les octets viennent du fichier choisi sur l'appareil, sans copie
 * dans le navigateur ni dans la mémoire de l'Amiga.
 *
 * Les blocs sont demandés à un fil de la page (lazydisk-worker.js) par une petite zone de mémoire partagée :
 * le fil du cœur y dépose la demande, réveille le lecteur et attend sa réponse (FileReaderSync, lecture
 * synchrone d'un morceau du fichier). Une réserve garde les derniers morceaux lus (64 Mo). Les écritures de
 * l'Amiga restent en mémoire (copie à l'écriture, par pages de 4 Ko) : le fichier d'origine n'est jamais modifié,
 * et elles disparaissent à l'extinction. */
#define _GNU_SOURCE 1
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <unordered_map>
#include <emscripten/emscripten.h>
#include <emscripten/threading.h>

extern "C" FILE *__real_fopen(const char *, const char *);

#define LZ_BUF   (1 << 20)          /* zone d'échange : une lecture au plus */
#define LZ_CHUNK (128 * 1024)       /* morceau lu d'un coup dans le fichier */
#define LZ_SLOTS 512                /* réserve : 512 × 128 Ko = 64 Mo */
#define LZ_PAGE  4096               /* écritures gardées par pages */
#define LZ_DISKS 16

/* Demande en cours, lue par le fil de la page : état (0 libre, 1 demandée, 2 servie), opération (0 lecture,
   1 taille), disque, longueur, position (deux mots de 32 bits), résultat */
static volatile int32_t lz_req[8];
static uint8_t lz_buf[LZ_BUF];
static pthread_mutex_t lz_mtx = PTHREAD_MUTEX_INITIALIZER;

extern "C" EMSCRIPTEN_KEEPALIVE uint32_t amb_lazy_req(void) { return (uint32_t)(uintptr_t)lz_req; }
extern "C" EMSCRIPTEN_KEEPALIVE uint32_t amb_lazy_buf(void) { return (uint32_t)(uintptr_t)lz_buf; }

/* Pose une demande et attend la réponse (lz_mtx tenu). Sans réponse au bout de 30 s, échec. */
static int64_t lz_call(int op, int disk, uint64_t off, int len) {
  lz_req[1] = op; lz_req[2] = disk; lz_req[3] = len;
  lz_req[4] = (int32_t)(uint32_t)off; lz_req[5] = (int32_t)(uint32_t)(off >> 32); lz_req[6] = -1;
  __atomic_store_n(&lz_req[0], 1, __ATOMIC_SEQ_CST);
  emscripten_futex_wake((void *)&lz_req[0], 1);
  for (int waited = 0; __atomic_load_n(&lz_req[0], __ATOMIC_SEQ_CST) != 2; waited++) {
    if (waited >= 300) { __atomic_store_n(&lz_req[0], 0, __ATOMIC_SEQ_CST); return -1; }
    emscripten_futex_wait((void *)&lz_req[0], 1, 100.0);
  }
  int64_t res = lz_req[6];
  if (op == 1 && res >= 0) res = (int64_t)(((uint64_t)(uint32_t)lz_req[5] << 32) | (uint32_t)lz_req[4]);
  __atomic_store_n(&lz_req[0], 0, __ATOMIC_SEQ_CST);
  return res;
}

struct lz_slot { int disk; int64_t chunk; int len; uint8_t *data; };
static lz_slot lz_cache[LZ_SLOTS];
static int64_t lz_size[LZ_DISKS];
static std::unordered_map<uint64_t, uint8_t *> lz_pages[LZ_DISKS];

/* Morceau du disque, depuis la réserve ou lu dans le fichier (lz_mtx tenu) ; nullptr si illisible */
static lz_slot *lz_chunk(int disk, int64_t chunk) {
  lz_slot *s = &lz_cache[(uint64_t)(chunk * 31 + disk * 7919) % LZ_SLOTS];
  if (s->data && s->disk == disk && s->chunk == chunk) return s;
  int64_t off = chunk * LZ_CHUNK, len = lz_size[disk] - off;
  if (len <= 0) return nullptr;
  if (len > LZ_CHUNK) len = LZ_CHUNK;
  if (!s->data && !(s->data = (uint8_t *)malloc(LZ_CHUNK))) return nullptr;
  s->disk = -1;
  if (lz_call(0, disk, off, (int)len) != len) return nullptr;
  memcpy(s->data, lz_buf, len);
  s->disk = disk; s->chunk = chunk; s->len = (int)len;
  return s;
}

/* Copie n octets du disque à partir de off, écritures de l'Amiga comprises (lz_mtx tenu) */
static int lz_read(int disk, int64_t off, uint8_t *dst, int n) {
  int done = 0;
  while (done < n) {
    int64_t p = off + done;
    int64_t page = p / LZ_PAGE; int in = (int)(p % LZ_PAGE), k = LZ_PAGE - in;
    if (k > n - done) k = n - done;
    auto it = lz_pages[disk].find(page);
    if (it != lz_pages[disk].end()) memcpy(dst + done, it->second + in, k);
    else {
      lz_slot *s = lz_chunk(disk, p / LZ_CHUNK); if (!s) break;
      int ci = (int)(p % LZ_CHUNK);
      if (ci + k > s->len) { k = s->len - ci; if (k <= 0) break; }
      memcpy(dst + done, s->data + ci, k);
    }
    done += k;
  }
  return done;
}

static int lz_write(int disk, int64_t off, const uint8_t *src, int n) {
  int done = 0;
  while (done < n) {
    int64_t p = off + done;
    int64_t page = p / LZ_PAGE; int in = (int)(p % LZ_PAGE), k = LZ_PAGE - in;
    if (k > n - done) k = n - done;
    auto it = lz_pages[disk].find(page);
    uint8_t *pg = it != lz_pages[disk].end() ? it->second : nullptr;
    if (!pg) {
      /* Première écriture dans cette page : copie de son contenu d'origine */
      if (!(pg = (uint8_t *)malloc(LZ_PAGE))) break;
      memset(pg, 0, LZ_PAGE);
      int64_t base = page * LZ_PAGE, avail = lz_size[disk] - base;
      if (avail > 0) lz_read(disk, base, pg, avail < LZ_PAGE ? (int)avail : LZ_PAGE);
      lz_pages[disk][page] = pg;
    }
    memcpy(pg + in, src + done, k);
    done += k;
  }
  return done;
}

struct lz_file { int disk; int64_t pos; };

static ssize_t lz_cread(void *c, char *buf, size_t n) {
  lz_file *f = (lz_file *)c;
  int64_t left = lz_size[f->disk] - f->pos; if (left <= 0) return 0;
  if ((int64_t)n > left) n = (size_t)left;
  pthread_mutex_lock(&lz_mtx);
  int got = lz_read(f->disk, f->pos, (uint8_t *)buf, (int)n);
  pthread_mutex_unlock(&lz_mtx);
  if (got <= 0) return got == 0 ? -1 : got;
  f->pos += got; return got;
}
static ssize_t lz_cwrite(void *c, const char *buf, size_t n) {
  lz_file *f = (lz_file *)c;
  int64_t left = lz_size[f->disk] - f->pos; if (left <= 0) return 0;
  if ((int64_t)n > left) n = (size_t)left;
  pthread_mutex_lock(&lz_mtx);
  int put = lz_write(f->disk, f->pos, (const uint8_t *)buf, (int)n);
  pthread_mutex_unlock(&lz_mtx);
  f->pos += put; return put;
}
static int lz_cseek(void *c, off_t *o, int whence) {
  lz_file *f = (lz_file *)c;
  int64_t p = whence == SEEK_SET ? *o : whence == SEEK_CUR ? f->pos + *o : lz_size[f->disk] + *o;
  if (p < 0) return -1;
  f->pos = p; *o = p; return 0;
}
static int lz_cclose(void *c) { free(c); return 0; }

extern "C" FILE *__wrap_fopen(const char *path, const char *mode) {
  /* Seulement le disque lui-même (…/<nom>.hdf) : WinUAE cherche aussi « <disque>.geo », qui n'existe pas */
  size_t pl = strlen(path);
  if (strncmp(path, "/lazy/", 6) || pl < 4 || strcmp(path + pl - 4, ".hdf")) return __real_fopen(path, mode);
  int disk = atoi(path + 6);
  if (disk < 0 || disk >= LZ_DISKS) return nullptr;
  pthread_mutex_lock(&lz_mtx);
  if (!lz_size[disk]) { int64_t s = lz_call(1, disk, 0, 0); lz_size[disk] = s > 0 ? s : 0; }
  int64_t size = lz_size[disk];
  pthread_mutex_unlock(&lz_mtx);
  if (!size) return nullptr;
  lz_file *f = (lz_file *)calloc(1, sizeof(lz_file)); if (!f) return nullptr;
  f->disk = disk;
  cookie_io_functions_t io = { lz_cread, lz_cwrite, lz_cseek, lz_cclose };
  FILE *h = fopencookie(f, mode, io);
  if (!h) free(f);
  return h;
}

/* Nouvel allumage : la réserve et les écritures de la séance précédente sont oubliées */
extern "C" EMSCRIPTEN_KEEPALIVE void amb_lazy_reset(void) {
  pthread_mutex_lock(&lz_mtx);
  for (auto &s : lz_cache) s.disk = -1;
  for (int d = 0; d < LZ_DISKS; d++) { for (auto &kv : lz_pages[d]) free(kv.second); lz_pages[d].clear(); lz_size[d] = 0; }
  pthread_mutex_unlock(&lz_mtx);
}
